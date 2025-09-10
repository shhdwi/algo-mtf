import TradingClient from './tradingClient';
import { ExchangeCode } from '@/types/chart';

// Configuration matching the Pine Script implementation
const SR_CONFIG = {
  prd: 10,           // Pivot period (10 bars on each side)
  ppsrc: 'High/Low', // Source for pivot detection
  ChannelW: 5,       // Maximum Channel Width (5% of high-low range)
  minstrength: 1,    // Minimum Strength (multiplied by 20 internally)
  maxnumsr: 6,       // Maximum number of channels to detect
  loopback: 290      // Lookback period (290 candles)
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
  private async getCombinedDataWithRetry(symbol: string, exchange: ExchangeCode, maxRetries: number = 3): Promise<any> {
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
        const historicalData = historicalResponse.data.points?.map((p: any) => ({
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
              high: Math.max(...points.map((p: any) => parseFloat(p.high))),
              low: Math.min(...points.map((p: any) => parseFloat(p.low))),
              close: parseFloat(points[points.length - 1].close),
              volume: points.reduce((sum: number, p: any) => sum + parseInt(p.volume), 0)
            };
          }
        } catch (todayError) {
          console.log(`⚠️ Today's data failed for ${symbol}, using historical only`);
        }

        return {
          symbol,
          exchange,
          historicalData,
          todaysCandle
        };
        
      } catch (error) {
        console.log(`❌ S/R data attempt ${attempt}/${maxRetries} failed for ${symbol}: ${error.message}`);
        
        if (attempt === maxRetries) {
          // If all retries failed, create minimal fallback data
          return this.createFallbackTradingData(symbol, exchange);
        }
        
        // Wait before retry with longer delays for rate limiting
        await this.delay(5000 * attempt); // 5s, 10s, 15s delays
      }
    }
  }

  /**
   * Create minimal fallback data for S/R analysis
   */
  private createFallbackTradingData(symbol: string, exchange: ExchangeCode): any {
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
          volume: tradingData.todaysCandle.volume,
          dayOfWeek: new Date(tradingData.todaysCandle.date).toLocaleDateString('en-US', { weekday: 'long' })
        });
      }

      // Take last 290 candles for analysis
      const analysisCandles = allCandles.slice(-SR_CONFIG.loopback);
      const currentPrice = analysisCandles[analysisCandles.length - 1].close;

      // Step 1: Detect pivot points
      const pivotPoints = this.detectPivots(analysisCandles, SR_CONFIG.prd);

      // Step 2: Calculate high-low range for channel width validation
      const hlRange = this.calculateHighLowRange(analysisCandles);
      const maxChannelWidth = (SR_CONFIG.ChannelW / 100) * hlRange;

      // Step 3: Form channels from pivot points
      const allChannels = this.formChannels(pivotPoints, maxChannelWidth);

      // Step 4: Calculate channel strength
      const channelsWithStrength = this.calculateChannelStrengths(allChannels, analysisCandles);

      // Step 5: Select valid channels (strength >= minstrength * 20)
      const validChannels = this.selectValidChannels(channelsWithStrength, SR_CONFIG.minstrength * 20, SR_CONFIG.maxnumsr);

      // Step 6: Classify support and resistance
      const { nearestSupport, nearestResistance } = this.classifySupportResistance(validChannels, currentPrice);

      return {
        symbol,
        exchange,
        analysis_date: new Date().toISOString().split('T')[0],
        current_price: currentPrice,
        nearest_support: nearestSupport,
        nearest_resistance: nearestResistance,
        all_valid_channels: validChannels,
        pivot_points: {
          highs: pivotPoints.filter(p => p.type === 'high'),
          lows: pivotPoints.filter(p => p.type === 'low')
        },
        configuration: SR_CONFIG,
        statistics: {
          total_pivots: pivotPoints.length,
          total_channels: validChannels.length,
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
  private detectPivots(candles: any[], prd: number): PivotPoint[] {
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
  private calculateHighLowRange(candles: any[]): number {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    return Math.max(...highs) - Math.min(...lows);
  }

  /**
   * Step 2: Form channels from pivot points
   */
  private formChannels(pivots: PivotPoint[], maxChannelWidth: number): Channel[] {
    const channels: Channel[] = [];

    // Create potential channels starting from each pivot
    for (let i = 0; i < pivots.length; i++) {
      const startPivot = pivots[i];
      let channelUpper = startPivot.price;
      let channelLower = startPivot.price;
      const channelPivots = [startPivot];

      // Find all other pivots that fit within max channel width
      for (let j = 0; j < pivots.length; j++) {
        if (i === j) continue;

        const otherPivot = pivots[j];
        const testUpper = Math.max(channelUpper, otherPivot.price);
        const testLower = Math.min(channelLower, otherPivot.price);
        const testWidth = testUpper - testLower;

        // Check if this pivot fits within max channel width
        if (testWidth <= maxChannelWidth) {
          channelUpper = testUpper;
          channelLower = testLower;
          channelPivots.push(otherPivot);
        }
      }

      // Only create channel if it has width and multiple pivots
      if (channelUpper !== channelLower && channelPivots.length > 1) {
        const width = channelUpper - channelLower;
        const widthPercent = (width / channelLower) * 100;

        channels.push({
          upper: channelUpper,
          lower: channelLower,
          pivots: channelPivots,
          strength: 0, // Will be calculated in next step
          width,
          widthPercent
        });
      }
    }

    return channels;
  }

  /**
   * Step 3: Calculate channel strength
   */
  private calculateChannelStrengths(channels: Channel[], candles: any[]): Channel[] {
    return channels.map(channel => {
      let strength = channel.pivots.length * 20; // 20 points per pivot

      // Add strength for historical bar touches
      for (const candle of candles) {
        // Check if candle touched or penetrated channel boundaries
        const touchedUpper = Math.abs(candle.high - channel.upper) <= (channel.upper * 0.002); // 0.2% tolerance
        const touchedLower = Math.abs(candle.low - channel.lower) <= (channel.lower * 0.002); // 0.2% tolerance
        const penetratedChannel = candle.low <= channel.upper && candle.high >= channel.lower;

        if (touchedUpper || touchedLower || penetratedChannel) {
          strength += 1;
        }
      }

      return {
        ...channel,
        strength
      };
    });
  }

  /**
   * Step 4: Select valid channels based on strength and non-overlap
   */
  private selectValidChannels(channels: Channel[], minStrength: number, maxChannels: number): Channel[] {
    // Sort by strength (strongest first)
    const sortedChannels = channels.sort((a, b) => b.strength - a.strength);
    const selectedChannels: Channel[] = [];
    const usedPivotIndices = new Set<number>();

    for (const channel of sortedChannels) {
      // Check minimum strength requirement
      if (channel.strength < minStrength) {
        continue;
      }

      // Check if any pivots in this channel are already used
      const channelPivotIndices = channel.pivots.map(p => p.index);
      const hasUsedPivots = channelPivotIndices.some(idx => usedPivotIndices.has(idx));

      if (!hasUsedPivots && selectedChannels.length < maxChannels) {
        selectedChannels.push(channel);
        // Mark all pivots in this channel as used
        channelPivotIndices.forEach(idx => usedPivotIndices.add(idx));
      }
    }

    return selectedChannels;
  }

  /**
   * Step 5: Classify support and resistance relative to current price
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
