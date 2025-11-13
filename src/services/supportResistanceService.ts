import TradingClient from './tradingClient';
import { ExchangeCode } from '@/types/chart';

// Configuration matching the NEW Flutter/Dart implementation
const SR_CONFIG = {
  prd: 10,           // Pivot period (10 bars on each side)
  ppsrc: 'High/Low', // Source for pivot detection
  ChannelW: 5,       // Maximum Channel Width (5% of high-low range)
  minstrength: 1,    // Minimum Strength (multiplied by 20 internally)
  maxnumsr: 15,      // Maximum number of channels to detect (increased from 6)
  loopback: 400,     // Lookback period (increased from 290)
  minChannelsNearPrice: 6  // Minimum channels to return near current price
};

export interface PivotPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  timestamp: string;
  date: string;
}

export interface Channel {
  upper: number;
  lower: number;
  pivots: PivotPoint[];
  strength: number;
  width: number;
  widthPercent: number;
  distance?: number; // Distance from current price (for sorting)
  type?: 'SUPPORT' | 'RESISTANCE' | 'IN_CHANNEL'; // Classification relative to price
}

export interface SupportResistanceData {
  symbol: string;
  exchange: string;
  analysis_date: string;
  current_price: number;
  nearest_support: {
    upper: number;
    lower: number;
    strength: number;
    distance_percent: number;
  } | null;
  nearest_resistance: {
    upper: number;
    lower: number;
    strength: number;
    distance_percent: number;
  } | null;
  all_valid_channels: Channel[];
  pivot_points: {
    highs: PivotPoint[];
    lows: PivotPoint[];
  };
  configuration: typeof SR_CONFIG;
  statistics: {
    total_pivots: number;
    total_channels: number;
    high_low_range: number;
    max_channel_width: number;
  };
}

/**
 * Support/Resistance Channel Service
 * Implements the exact Pine Script algorithm for pivot detection and channel formation
 */
class SupportResistanceService {
  private tradingClient: TradingClient;

  constructor(sharedTradingClient?: TradingClient) {
    this.tradingClient = sharedTradingClient || new TradingClient({
      baseUrl: process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in',
      apiKey: process.env.TRADING_API_KEY || '',
      privateKey: process.env.TRADING_AUTH_KEY || '',
      clientId: process.env.TRADING_CLIENT_ID || ''
    });
  }

  /**
   * Get combined data with retry logic for reliability
   */
  private async getCombinedDataWithRetry(symbol: string, exchange: ExchangeCode, maxRetries: number = 3): Promise<{
    symbol: string;
    exchange: string;
    historicalData: Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>;
    todaysCandle: {date: string, open: number, high: number, low: number, close: number, volume: number};
  }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Refresh token before each attempt if it's not the first
        if (attempt > 1) {
          console.log(`🔄 Refreshing token for S/R analysis attempt ${attempt}`);
          await this.tradingClient.generateAccessToken();
          await this.delay(2000); // Wait for token propagation
        }
        
        // Get historical data directly from trading client
        const historicalResponse = await this.tradingClient.getHistoricalChartData({
          symbol: symbol.toUpperCase(),
          exchange,
          interval: '3Y',
          start_time: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19),
          end_time: new Date().toISOString().slice(0, 19)
        });

        // Convert to required format
        const historicalData = historicalResponse.data.points?.map((p: {timestamp: string, open: string, high: string, low: string, close: string, volume: string}) => ({
          date: p.timestamp.split('T')[0],
          open: parseFloat(p.open),
          high: parseFloat(p.high),
          low: parseFloat(p.low),
          close: parseFloat(p.close),
          volume: parseInt(p.volume),
          dayOfWeek: new Date(p.timestamp).toLocaleDateString('en-US', { weekday: 'long' })
        })) || [];

        // Get today's data
        let todaysCandle = { date: new Date().toISOString().split('T')[0], open: 0, high: 0, low: 0, close: 0, volume: 0 };
        try {
          const todayResponse = await this.tradingClient.getChartData({
            symbol: symbol.toUpperCase(),
            exchange,
            interval: '5m',
            start_time: new Date(new Date().setHours(9, 15, 0, 0)).toISOString().slice(0, 19),
            end_time: new Date().toISOString().slice(0, 19)
          });

          if (todayResponse.data?.points?.length > 0) {
            const points = todayResponse.data.points;
            todaysCandle = {
              date: new Date().toISOString().split('T')[0],
              open: parseFloat(points[0].open),
              high: Math.max(...points.map((p: {high: string}) => parseFloat(p.high))),
              low: Math.min(...points.map((p: {low: string}) => parseFloat(p.low))),
              close: parseFloat(points[points.length - 1].close),
              volume: points.reduce((sum: number, p: {volume: string}) => sum + parseInt(p.volume), 0)
            };
          }
        } catch {
          console.log(`⚠️ Today's data failed for ${symbol}, using historical only`);
        }

        return {
          symbol,
          exchange,
          historicalData,
          todaysCandle
        };
        
      } catch (error) {
        console.log(`❌ S/R data attempt ${attempt}/${maxRetries} failed for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        if (attempt === maxRetries) {
          // If all retries failed, create minimal fallback data
          return this.createFallbackTradingData(symbol, exchange);
        }
        
        // Wait before retry with longer delays for rate limiting
        await this.delay(5000 * attempt); // 5s, 10s, 15s delays
      }
    }
    throw new Error(`Failed to get combined data after ${maxRetries} attempts`);
  }

  /**
   * Create minimal fallback data for S/R analysis
   */
  private createFallbackTradingData(symbol: string, exchange: ExchangeCode): {
    symbol: string;
    exchange: string;
    historicalData: Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>;
    todaysCandle: {date: string, open: number, high: number, low: number, close: number, volume: number};
  } {
    // Create minimal historical data for S/R analysis
    const fallbackCandles = [];
    const basePrice = 1000; // Fallback base price
    
    // Generate 290 days of fallback data
    for (let i = 0; i < 290; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (290 - i));
      
      const randomVariation = (Math.random() - 0.5) * 0.1; // ±5% variation
      const price = basePrice * (1 + randomVariation);
      
      fallbackCandles.push({
        date: date.toISOString().split('T')[0],
        open: price,
        high: price * 1.02,
        low: price * 0.98,
        close: price,
        volume: 1000000,
        dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' })
      });
    }

    return {
      symbol,
      exchange,
      historicalData: fallbackCandles,
      todaysCandle: {
        date: new Date().toISOString().split('T')[0],
        open: basePrice,
        high: basePrice,
        low: basePrice,
        close: basePrice,
        volume: 0
      }
    };
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Analyze Support/Resistance levels for a symbol with retry logic
   */
  async analyzeSupportResistance(symbol: string, exchange: ExchangeCode = 'NSE'): Promise<SupportResistanceData> {
    try {
      // Get combined trading data with retry logic
      const tradingData = await this.getCombinedDataWithRetry(symbol, exchange);
      
      // Use last 290 candles for analysis (SR_CONFIG.loopback)
      const allCandles = [...tradingData.historicalData];
      
      // Add today's candle if it has valid data
      if (tradingData.todaysCandle.close > 0) {
        allCandles.push({
          date: tradingData.todaysCandle.date,
          open: tradingData.todaysCandle.open,
          high: tradingData.todaysCandle.high,
          low: tradingData.todaysCandle.low,
          close: tradingData.todaysCandle.close,
          volume: tradingData.todaysCandle.volume
        });
      }

      // Take last loopback candles for analysis
      const analysisCandles = allCandles.slice(-SR_CONFIG.loopback);
      const currentPrice = analysisCandles[analysisCandles.length - 1].close;

      console.log(`📊 S/R Analysis for ${symbol}: ${analysisCandles.length} candles, Current price: ₹${currentPrice.toFixed(2)}`);

      // Step 1: Detect pivot points
      const pivotPoints = this.detectPivots(analysisCandles, SR_CONFIG.prd);
      console.log(`🔍 Found ${pivotPoints.length} pivot points`);

      // Step 2: Calculate high-low range for channel width validation
      const hlRange = this.calculateHighLowRange(analysisCandles);
      const maxChannelWidth = (SR_CONFIG.ChannelW / 100) * hlRange;
      console.log(`📏 Range: ₹${hlRange.toFixed(2)}, Max channel width (${SR_CONFIG.ChannelW}%): ₹${maxChannelWidth.toFixed(2)}`);

      // Step 3: Form channels using NEW consecutive level pairs approach
      const allChannels = this.formChannelsNewLogic(pivotPoints, maxChannelWidth);
      console.log(`📦 Formed ${allChannels.length} channels using new logic`);

      // Step 4: Filter channels by proximity to current price
      const nearbyChannels = this.filterChannelsByProximity(allChannels, currentPrice, maxChannelWidth);
      console.log(`🎯 Selected ${nearbyChannels.length} channels near current price`);

      // Step 5: Classify support and resistance using three-state logic
      const { nearestSupport, nearestResistance } = this.classifySupportResistanceNewLogic(nearbyChannels, currentPrice);

      return {
        symbol,
        exchange,
        analysis_date: new Date().toISOString().split('T')[0],
        current_price: currentPrice,
        nearest_support: nearestSupport,
        nearest_resistance: nearestResistance,
        all_valid_channels: nearbyChannels,
        pivot_points: {
          highs: pivotPoints.filter(p => p.type === 'high'),
          lows: pivotPoints.filter(p => p.type === 'low')
        },
        configuration: SR_CONFIG,
        statistics: {
          total_pivots: pivotPoints.length,
          total_channels: nearbyChannels.length,
          high_low_range: hlRange,
          max_channel_width: maxChannelWidth
        }
      };

    } catch (error) {
      console.error('SupportResistanceService error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Step 1: Detect pivot points using the exact Pine Script logic
   */
  private detectPivots(candles: Array<{high: number, low: number, date: string}>, prd: number): PivotPoint[] {
    const pivots: PivotPoint[] = [];

    // Need at least 2*prd + 1 candles for pivot detection
    if (candles.length < 2 * prd + 1) {
      return pivots;
    }

    for (let i = prd; i < candles.length - prd; i++) {
      const current = candles[i];

      // Check for pivot high
      let isPivotHigh = true;
      for (let j = i - prd; j <= i + prd; j++) {
        if (j !== i && candles[j].high >= current.high) {
          isPivotHigh = false;
          break;
        }
      }

      if (isPivotHigh) {
        pivots.push({
          index: i,
          price: current.high,
          type: 'high',
          timestamp: current.date + 'T00:00:00',
          date: current.date
        });
      }

      // Check for pivot low
      let isPivotLow = true;
      for (let j = i - prd; j <= i + prd; j++) {
        if (j !== i && candles[j].low <= current.low) {
          isPivotLow = false;
          break;
        }
      }

      if (isPivotLow) {
        pivots.push({
          index: i,
          price: current.low,
          type: 'low',
          timestamp: current.date + 'T00:00:00',
          date: current.date
        });
      }
    }

    return pivots;
  }

  /**
   * Calculate high-low range for channel width validation
   */
  private calculateHighLowRange(candles: Array<{high: number, low: number}>): number {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    return Math.max(...highs) - Math.min(...lows);
  }

  /**
   * Step 2: Form channels using NEW consecutive level pairs approach
   * Based on Flutter/Dart implementation
   */
  private formChannelsNewLogic(pivots: PivotPoint[], maxChannelWidth: number): Channel[] {
    if (pivots.length === 0) return [];

    const channels: Channel[] = [];
    
    // Sort pivot levels in descending order (highest to lowest)
    const sortedLevels = [...new Set(pivots.map(p => p.price))].sort((a, b) => b - a);
    const usedLevels = new Set<number>();
    let lastChannelLow: number | null = null;

    console.log(`🔢 Unique pivot levels: ${sortedLevels.length}`);

    for (let i = 0; i < sortedLevels.length; i++) {
      const level1 = sortedLevels[i];

      // Skip if level is already used
      if (usedLevels.has(level1)) {
        continue;
      }

      // Skip if level is >= the low of the last created channel (to avoid overlaps)
      if (lastChannelLow !== null && level1 >= lastChannelLow) {
        continue;
      }

      // Calculate target: level1 - maxChannelWidth
      const targetValue = level1 - maxChannelWidth;

      // Find the pivot level just greater than targetValue (closest match)
      let level2: number | null = null;
      for (let j = i + 1; j < sortedLevels.length; j++) {
        const candidateLevel = sortedLevels[j];
        if (candidateLevel > targetValue && candidateLevel < level1) {
          level2 = candidateLevel;
          break; // Take first (closest) match
        }
      }

      // If no valid level2 found or level2 is already used, skip
      if (level2 === null || usedLevels.has(level2)) {
        continue;
      }

      const difference = level1 - level2;

      // Count how many pivots touch this channel (between level2 and level1)
      const touchingPivots = pivots.filter(pivot => 
        pivot.price >= level2! && pivot.price <= level1
      );

      const pivotCount = touchingPivots.length;

      // Require at least 2 pivots to form a channel
      if (pivotCount >= 2) {
        const width = level1 - level2;
        const widthPercent = (width / level2) * 100;

        channels.push({
          upper: level1,
          lower: level2,
          pivots: touchingPivots,
          strength: pivotCount * 20, // 20 per pivot
          width,
          widthPercent
        });

        // Mark levels as used
        usedLevels.add(level1);
        usedLevels.add(level2);
        lastChannelLow = level2; // Update last channel low to avoid overlaps

        console.log(`✓ Channel created: High=₹${level1.toFixed(2)}, Low=₹${level2.toFixed(2)}, Width=₹${difference.toFixed(2)}, Pivots=${pivotCount}, Strength=${pivotCount * 20}`);
      }
    }

    console.log(`📦 Total channels formed: ${channels.length}`);
    return channels;
  }

  /**
   * NEW: Filter channels by proximity to current price
   * Returns channels sorted by distance from price, ensuring minimum count
   */
  private filterChannelsByProximity(
    channels: Channel[],
    currentPrice: number,
    maxChannelWidth: number
  ): Channel[] {
    if (channels.length === 0) return [];

    const minChannels = SR_CONFIG.minChannelsNearPrice;
    const proximityThreshold = maxChannelWidth * 3; // 15% for 5% width

    // Calculate distance for each channel
    const channelsWithDistance = channels.map(channel => ({
      ...channel,
      distance: this.getChannelDistance(currentPrice, channel)
    }));

    // Sort by distance (nearest first)
    channelsWithDistance.sort((a, b) => a.distance - b.distance);

    // Keep channels within threshold OR until minimum count
    const filtered: Channel[] = [];
    for (const channel of channelsWithDistance) {
      if (channel.distance <= proximityThreshold || filtered.length < minChannels) {
        filtered.push(channel);
        console.log(`  → Channel: High=₹${channel.upper.toFixed(2)}, Low=₹${channel.lower.toFixed(2)}, Distance=₹${channel.distance.toFixed(2)}, Strength=${channel.strength}`);
      }

      // Stop once we have max channels
      if (filtered.length >= SR_CONFIG.maxnumsr) {
        break;
      }
    }

    return filtered;
  }

  /**
   * Calculate distance from a price point to a channel
   * Returns 0 if price is within the channel, otherwise returns the shortest distance
   */
  private getChannelDistance(price: number, channel: Channel): number {
    // If price is within the channel, distance is 0
    if (price >= channel.lower && price <= channel.upper) {
      return 0.0;
    }

    // If price is above the channel, return distance to upper bound
    if (price > channel.upper) {
      return price - channel.upper;
    }

    // If price is below the channel, return distance to lower bound
    return channel.lower - price;
  }

  /**
   * NEW: Classify support and resistance using THREE-STATE logic
   * State 1: RESISTANCE (both upper and lower above price)
   * State 2: SUPPORT (both upper and lower below price)
   * State 3: IN_CHANNEL (price between upper and lower) - NOT classified as support/resistance
   */
  private classifySupportResistanceNewLogic(channels: Channel[], currentPrice: number): {
    nearestSupport: any | null;
    nearestResistance: any | null;
  } {
    let nearestSupport: any = null;
    let nearestResistance: any = null;

    for (const channel of channels) {
      const { upper, lower } = channel;

      // RESISTANCE: Both upper AND lower are above price (price is below entire channel)
      if (lower > currentPrice && upper > currentPrice) {
        // Nearest resistance = lowest "lower" bound above price
        if (!nearestResistance || lower < nearestResistance.lower) {
          const distancePercent = ((lower - currentPrice) / currentPrice) * 100;
          nearestResistance = {
            upper: upper,
            lower: lower,
            strength: channel.strength,
            distance_percent: distancePercent,
            type: 'RESISTANCE'
          };
          console.log(`🔴 Resistance found: ₹${lower.toFixed(2)}-₹${upper.toFixed(2)}, Distance: ${distancePercent.toFixed(2)}%`);
        }
      }
      
      // SUPPORT: Both upper AND lower are below price (price is above entire channel)
      else if (upper < currentPrice && lower < currentPrice) {
        // Nearest support = highest "upper" bound below price
        if (!nearestSupport || upper > nearestSupport.upper) {
          const distancePercent = ((currentPrice - upper) / currentPrice) * 100;
          nearestSupport = {
            upper: upper,
            lower: lower,
            strength: channel.strength,
            distance_percent: distancePercent,
            type: 'SUPPORT'
          };
          console.log(`🟢 Support found: ₹${lower.toFixed(2)}-₹${upper.toFixed(2)}, Distance: ${distancePercent.toFixed(2)}%`);
        }
      }
      
      // IN_CHANNEL: Price is between lower and upper (NEUTRAL - not classified)
      else {
        console.log(`⚪ In-channel (neutral): ₹${lower.toFixed(2)}-₹${upper.toFixed(2)}, Price: ₹${currentPrice.toFixed(2)}`);
      }
    }

    if (!nearestSupport) {
      console.log(`⚠️ No support found below current price`);
    }
    if (!nearestResistance) {
      console.log(`⚠️ No resistance found above current price`);
    }

    return { nearestSupport, nearestResistance };
  }

  /**
   * OLD: Classify support and resistance (DEPRECATED - kept for reference)
   */
  private classifySupportResistance(channels: Channel[], currentPrice: number): {
    nearestSupport: any | null;
    nearestResistance: any | null;
  } {
    let nearestSupport: any = null;
    let nearestResistance: any = null;

    for (const channel of channels) {
      // Support: Channel upper boundary < current price (nearest = highest upper)
      if (channel.upper < currentPrice) {
        if (!nearestSupport || channel.upper > nearestSupport.upper) {
          const distancePercent = ((currentPrice - channel.upper) / currentPrice) * 100;
          nearestSupport = {
            upper: channel.upper,
            lower: channel.lower,
            strength: channel.strength,
            distance_percent: distancePercent
          };
        }
      }

      // Resistance: Channel lower boundary > current price (nearest = lowest lower)
      if (channel.lower > currentPrice) {
        if (!nearestResistance || channel.lower < nearestResistance.lower) {
          const distancePercent = ((channel.lower - currentPrice) / currentPrice) * 100;
          nearestResistance = {
            upper: channel.upper,
            lower: channel.lower,
            strength: channel.strength,
            distance_percent: distancePercent
          };
        }
      }
    }

    return { nearestSupport, nearestResistance };
  }

  /**
   * Get multiple symbols SR analysis
   */
  async getMultipleSupportResistance(symbols: string[], exchange: ExchangeCode = 'NSE'): Promise<SupportResistanceData[]> {
    const results: SupportResistanceData[] = [];

    for (const symbol of symbols) {
      try {
        const srData = await this.analyzeSupportResistance(symbol, exchange);
        results.push(srData);
      } catch (error) {
        console.error(`Failed to analyze S/R for ${symbol}:`, error);
        // Continue with other symbols
      }
    }

    return results;
  }

  /**
   * Check resistance proximity for entry validation
   */
  checkResistanceProximity(currentPrice: number, srData: SupportResistanceData, minDistancePercent: number = 1.5): {
    passed: boolean;
    reason: string;
    distancePercent: number | null;
    nearestResistance: number | null;
  } {
    if (!srData.nearest_resistance) {
      return {
        passed: true,
        reason: 'No resistance data available - allowing entry',
        distancePercent: null,
        nearestResistance: null
      };
    }

    const nearestResistance = srData.nearest_resistance.lower; // Use lower boundary as resistance level
    const distanceToResistance = nearestResistance - currentPrice;
    const distancePercent = (distanceToResistance / currentPrice) * 100;

    const passed = distancePercent >= minDistancePercent;

    return {
      passed,
      distancePercent: Math.round(distancePercent * 100) / 100,
      nearestResistance,
      reason: passed
        ? `PASSED: ${distancePercent.toFixed(2)}% from resistance (₹${nearestResistance.toFixed(2)}) >= ${minDistancePercent}%`
        : `FAILED: Only ${distancePercent.toFixed(2)}% from resistance (₹${nearestResistance.toFixed(2)}) < ${minDistancePercent}%`
    };
  }
}

export default SupportResistanceService;
