import TradingClient from './tradingClient';
import DailyOHLCService from './dailyOHLCService';
import { ExchangeCode } from '@/types/chart';
import { normalizeExchange, parseOHLCData } from '@/utils/chartUtils';

export interface TodaysCandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startTime: string;
  endTime: string;
  isPartialDay: boolean;
  dataPoints: number;
  lastUpdateTime: string;
}

export interface CombinedTradingData {
  symbol: string;
  exchange: string;
  historicalDays: number;
  todaysCandle: TodaysCandleData;
  historicalData: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    dayOfWeek: string;
  }>;
  combinedAnalysis: {
    currentVsYesterday: {
      priceChange: number;
      priceChangePercent: number;
      volumeChange: number;
      volumeChangePercent: number;
    };
    technicalLevels: {
      support: number;
      resistance: number;
      movingAverage20: number;
      movingAverage50: number;
    };
    marketContext: {
      isMarketOpen: boolean;
      timeUntilClose: string;
      tradingSession: 'pre-market' | 'market-hours' | 'post-market' | 'closed';
    };
  };
}

/**
 * Combined Trading Service for historical + intraday analysis
 * Perfect for end-of-day trading decisions at 3:00 PM
 */
class CombinedTradingService {
  private tradingClient: TradingClient;
  private dailyOHLCService: DailyOHLCService;

  constructor() {
    this.tradingClient = new TradingClient({
      baseUrl: process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in',
      apiKey: process.env.TRADING_API_KEY || '',
      privateKey: process.env.TRADING_AUTH_KEY || '',
      clientId: process.env.TRADING_CLIENT_ID || ''
    });
    
    this.dailyOHLCService = new DailyOHLCService(this.tradingClient);
  }

  /**
   * Get combined historical + today's intraday data
   */
  async getCombinedTradingData(symbol: string, exchange: ExchangeCode = 'NSE'): Promise<CombinedTradingData> {
    try {
      // 1. Get 3 years of historical daily data (token managed by GlobalTokenManager)
      const historicalData = await this.dailyOHLCService.getDailyOHLC({
        symbol,
        exchange,
        yearsBack: 3
      });

      // 2. Get today's intraday data and convert to day candle
      const todaysCandle = await this.getTodaysCandle(symbol, exchange);

      // 3. Calculate technical analysis
      const combinedAnalysis = this.calculateCombinedAnalysis(historicalData.dailyData, todaysCandle);

      return {
        symbol: historicalData.symbol,
        exchange: historicalData.exchange,
        historicalDays: historicalData.totalDays,
        todaysCandle,
        historicalData: historicalData.dailyData.map(day => ({
          date: day.date,
          open: day.open,
          high: day.high,
          low: day.low,
          close: day.close,
          volume: day.volume,
          dayOfWeek: day.dayOfWeek
        })),
        combinedAnalysis
      };

    } catch (error) {
      console.error('CombinedTradingService error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Get today's intraday data and convert to a single day candle
   */
  private async getTodaysCandle(symbol: string, exchange: ExchangeCode): Promise<TodaysCandleData> {
    // Get current time
    const now = new Date();
    
    // Use fixed market hours (9:00 AM to 3:30 PM IST)
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const today = istTime.toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    
    // Create IST market hours for today
    const marketOpenIST = `${today}T09:00:00`; // 9:00 AM IST
    const marketCloseIST = `${today}T15:30:00`; // 3:30 PM IST
    
    console.log(`🔍 DEBUG ${symbol}: IST market hours - Open: ${marketOpenIST}, Close: ${marketCloseIST}, Current IST: ${istTime.toISOString()}`);

    const isPartialDay = istTime.getHours() < 15 || (istTime.getHours() === 15 && istTime.getMinutes() < 30);

    try {
      // Token managed by GlobalTokenManager, no need to refresh here
      
      // Use fixed IST market hours as strings
      const requestPayload = {
        symbol: symbol.toUpperCase(),
        exchange: normalizeExchange(exchange),
        interval: '1m',
        start_time: marketOpenIST,
        end_time: marketCloseIST
      };
      
      console.log(`🔍 DEBUG ${symbol} intraday request (fixed hours):`, requestPayload);
      const response = await this.tradingClient.getChartData(requestPayload);
      console.log(`🔍 DEBUG ${symbol} intraday response: ${response?.data?.points?.length || 0} points`);
      console.log(`🔍 DEBUG ${symbol} intraday response status:`, response?.status);
      console.log(`🔍 DEBUG ${symbol} intraday response data:`, response?.data ? 'has data' : 'no data');
      
      // LOG ALL INTRADAY DATA POINTS
      if (response?.data?.points?.length > 0) {
        console.log(`\n📊 ${symbol} INTRADAY DATA POINTS (${response.data.points.length} total):`);
        response.data.points.forEach((point: {timestamp: string, open: string, high: string, low: string, close: string, volume: string}, index: number) => {
          console.log(`  ${index + 1}. ${point.timestamp} | O:${point.open} H:${point.high} L:${point.low} C:${point.close} V:${point.volume}`);
        });
        console.log(`📊 ${symbol} INTRADAY SUMMARY: First: ${response.data.points[0].close}, Last: ${response.data.points[response.data.points.length - 1].close}`);
      } else {
        console.log(`⚠️ ${symbol}: No intraday data points received`);
      }
      
      if (!response.data || !response.data.points || response.data.points.length === 0) {
        throw new Error('No intraday data available for today');
      }

      // Convert intraday points to a single day candle
      const points = parseOHLCData(response.data.points);
      
      const open = points[0].open;
      const close = points[points.length - 1].close;
      const high = Math.max(...points.map(p => p.high));
      const low = Math.min(...points.map(p => p.low));
      const volume = points.reduce((sum, p) => sum + p.volume, 0);

      return {
        date: today, // Already in YYYY-MM-DD format
        open,
        high,
        low,
        close,
        volume,
        startTime: marketOpenIST,
        endTime: marketCloseIST,
        isPartialDay,
        dataPoints: points.length,
        lastUpdateTime: now.toISOString().slice(0, 19)
      };

    } catch (error) {
      // If intraday data fails, create a placeholder based on last known price
      console.log(`🔍 DEBUG ${symbol} intraday FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        date: today,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        startTime: marketOpenIST,
        endTime: marketCloseIST,
        isPartialDay,
        dataPoints: 0,
        lastUpdateTime: now.toISOString().slice(0, 19)
      };
    }
  }

  /**
   * Calculate technical analysis on combined data
   */
  private calculateCombinedAnalysis(
    historicalData: Array<{close: number, high: number, low: number, volume: number}>, 
    todaysCandle: TodaysCandleData
  ): {
    currentVsYesterday: {
      priceChange: number;
      priceChangePercent: number;
      volumeChange: number;
      volumeChangePercent: number;
    };
    technicalLevels: {
      support: number;
      resistance: number;
      movingAverage20: number;
      movingAverage50: number;
    };
    marketContext: {
      isMarketOpen: boolean;
      timeUntilClose: string;
      tradingSession: 'pre-market' | 'market-hours' | 'post-market' | 'closed';
    };
  } {
    const yesterday = historicalData[historicalData.length - 1];
    const last20Days = historicalData.slice(-20);
    const last50Days = historicalData.slice(-50);

    // Calculate moving averages
    const ma20 = last20Days.reduce((sum, day) => sum + day.close, 0) / last20Days.length;
    const ma50 = last50Days.reduce((sum, day) => sum + day.close, 0) / last50Days.length;

    // Find support and resistance from last 20 days
    const highs = last20Days.map(d => d.high);
    const lows = last20Days.map(d => d.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    // Compare today vs yesterday
    const priceChange = todaysCandle.close - yesterday.close;
    const priceChangePercent = (priceChange / yesterday.close) * 100;
    const volumeChange = todaysCandle.volume - yesterday.volume;
    const volumeChangePercent = (volumeChange / yesterday.volume) * 100;

    // Market context
    const now = new Date();
    const marketClose = new Date(now);
    marketClose.setHours(15, 30, 0, 0);
    
    const timeUntilClose = marketClose.getTime() - now.getTime();
    const hoursUntilClose = Math.floor(timeUntilClose / (1000 * 60 * 60));
    const minutesUntilClose = Math.floor((timeUntilClose % (1000 * 60 * 60)) / (1000 * 60));

    let tradingSession: 'pre-market' | 'market-hours' | 'post-market' | 'closed';
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (currentHour < 9 || (currentHour === 9 && currentMinute < 15)) {
      tradingSession = 'pre-market';
    } else if (currentHour < 15 || (currentHour === 15 && currentMinute <= 30)) {
      tradingSession = 'market-hours';
    } else {
      tradingSession = 'post-market';
    }

    // Check if it's weekend
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      tradingSession = 'closed';
    }

    return {
      currentVsYesterday: {
        priceChange,
        priceChangePercent,
        volumeChange,
        volumeChangePercent
      },
      technicalLevels: {
        support: Math.round(support * 100) / 100,
        resistance: Math.round(resistance * 100) / 100,
        movingAverage20: Math.round(ma20 * 100) / 100,
        movingAverage50: Math.round(ma50 * 100) / 100
      },
      marketContext: {
        isMarketOpen: tradingSession === 'market-hours',
        timeUntilClose: timeUntilClose > 0 ? `${hoursUntilClose}h ${minutesUntilClose}m` : 'Market Closed',
        tradingSession
      }
    };
  }

  /**
   * Get multiple symbols combined data
   */
  async getMultipleCombinedData(symbols: string[], exchange: ExchangeCode = 'NSE'): Promise<CombinedTradingData[]> {
    const results: CombinedTradingData[] = [];
    
    for (const symbol of symbols) {
      try {
        const data = await this.getCombinedTradingData(symbol, exchange);
        results.push(data);
      } catch (error) {
        console.error(`Failed to get combined data for ${symbol}:`, error);
        // Continue with other symbols
      }
    }
    
    return results;
  }

  /**
   * Get trading signals based on combined data
   */
  getTradingSignals(data: CombinedTradingData): {
    signals: string[];
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: 'buy' | 'sell' | 'hold' | 'wait';
    confidence: number;
  } {
    const signals: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    let recommendation: 'buy' | 'sell' | 'hold' | 'wait' = 'hold';
    let confidence = 50;

    const { todaysCandle, combinedAnalysis } = data;
    const { technicalLevels, currentVsYesterday } = combinedAnalysis;

    // Price vs Moving Averages
    if (todaysCandle.close > technicalLevels.movingAverage20) {
      signals.push('Above 20-day MA (Bullish)');
      confidence += 10;
    } else {
      signals.push('Below 20-day MA (Bearish)');
      confidence -= 10;
    }

    if (todaysCandle.close > technicalLevels.movingAverage50) {
      signals.push('Above 50-day MA (Bullish)');
      confidence += 10;
    } else {
      signals.push('Below 50-day MA (Bearish)');
      confidence -= 10;
    }

    // Support/Resistance levels
    const distanceFromSupport = ((todaysCandle.close - technicalLevels.support) / technicalLevels.support) * 100;
    const distanceFromResistance = ((technicalLevels.resistance - todaysCandle.close) / technicalLevels.resistance) * 100;

    if (distanceFromSupport < 2) {
      signals.push('Near Support Level (Potential Bounce)');
      if (currentVsYesterday.priceChangePercent > 0) {
        recommendation = 'buy';
        confidence += 15;
      }
    }

    if (distanceFromResistance < 2) {
      signals.push('Near Resistance Level (Potential Rejection)');
      if (currentVsYesterday.priceChangePercent < 0) {
        recommendation = 'sell';
        confidence += 15;
      }
    }

    // Volume analysis
    if (currentVsYesterday.volumeChangePercent > 50) {
      signals.push('High Volume Day (Strong Move)');
      confidence += 10;
    } else if (currentVsYesterday.volumeChangePercent < -30) {
      signals.push('Low Volume Day (Weak Move)');
      confidence -= 5;
    }

    // Daily price change
    if (currentVsYesterday.priceChangePercent > 3) {
      signals.push('Strong Bullish Day (+3%)');
      riskLevel = 'high';
    } else if (currentVsYesterday.priceChangePercent < -3) {
      signals.push('Strong Bearish Day (-3%)');
      riskLevel = 'high';
    }

    // Market timing
    if (combinedAnalysis.marketContext.tradingSession === 'post-market') {
      signals.push('Post-Market Hours (Next Day Setup)');
    } else if (combinedAnalysis.marketContext.tradingSession === 'market-hours') {
      signals.push('Market Open (Real-time Data)');
    }

    // Determine final recommendation
    if (confidence > 70) {
      if (currentVsYesterday.priceChangePercent > 1 && todaysCandle.close > technicalLevels.movingAverage20) {
        recommendation = 'buy';
      } else if (currentVsYesterday.priceChangePercent < -1 && todaysCandle.close < technicalLevels.movingAverage20) {
        recommendation = 'sell';
      }
    } else if (confidence < 40) {
      recommendation = 'wait';
    }

    return {
      signals,
      riskLevel,
      recommendation,
      confidence: Math.max(0, Math.min(100, confidence))
    };
  }
}

export default CombinedTradingService;
