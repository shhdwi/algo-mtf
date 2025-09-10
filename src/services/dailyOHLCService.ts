import TradingClient from './tradingClient';
import { ExchangeCode } from '@/types/chart';
import { normalizeExchange, parseHistoricalOHLCData } from '@/utils/chartUtils';

export interface DailyOHLCRequest {
  symbol: string;
  exchange?: ExchangeCode;
  yearsBack?: number; // Default: 2 years
}

export interface DailyOHLCData {
  symbol: string;
  exchange: string;
  interval: string;
  timeframe: {
    start: string;
    end: string;
  };
  totalDays: number;
  tradingDays: number;
  dailyData: Array<{
    date: string;
    epochTime: number;
    datetime: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    dayOfWeek: string;
    isWeekend: boolean;
  }>;
  summary: {
    startPrice: number;
    endPrice: number;
    totalReturn: number;
    totalReturnPercent: number;
    highestPrice: number;
    lowestPrice: number;
    averageVolume: number;
    volatility: number;
  };
}

/**
 * Daily OHLC Service for getting 1-day interval data
 * Specialized for daily trading analysis and backtesting
 */
class DailyOHLCService {
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
   * Get daily OHLC data for the last N years
   */
  async getDailyOHLC(request: DailyOHLCRequest): Promise<DailyOHLCData> {
    try {
      const { symbol, exchange = 'NSE', yearsBack = 2 } = request;

      // Validate symbol
      if (!symbol) {
        throw new Error('Symbol is required');
      }

      // Calculate date range for the specified years back
      const endDate = new Date();
      endDate.setHours(15, 30, 0, 0); // Market close time

      const startDate = new Date(endDate);
      startDate.setFullYear(startDate.getFullYear() - yearsBack);
      startDate.setHours(9, 15, 0, 0); // Market open time

      // Prepare request for historical API
      // Use appropriate interval based on years requested
      let interval = '1Y';
      if (yearsBack >= 3) {
        interval = '5Y'; // Use 5Y interval for 3+ years of data
      } else if (yearsBack >= 2) {
        interval = '3Y'; // Use 3Y interval for 2+ years of data  
      }

      const requestPayload = {
        symbol: symbol.toUpperCase(),
        exchange: normalizeExchange(exchange),
        interval,
        start_time: startDate.toISOString().slice(0, 19),
        end_time: endDate.toISOString().slice(0, 19)
      };

      // Get historical data
      const response = await this.tradingClient.getHistoricalChartData(requestPayload);
      
      if (!response.data || !response.data.points) {
        throw new Error('No historical data available for the specified period');
      }

      // Parse and enhance the data
      const parsedData = parseHistoricalOHLCData(response.data.points);
      
      // Add additional daily analysis
      const enhancedData = parsedData.map(point => {
        const date = new Date(point.timestamp);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        return {
          date: point.timestamp.split('T')[0], // Extract just the date part
          epochTime: point.epochTime,
          datetime: point.datetime,
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
          volume: point.volume,
          dayOfWeek,
          isWeekend
        };
      });

      // Calculate summary statistics
      const prices = enhancedData.map(d => d.close);
      const volumes = enhancedData.map(d => d.volume);
      const startPrice = enhancedData[0]?.close || 0;
      const endPrice = enhancedData[enhancedData.length - 1]?.close || 0;
      const totalReturn = endPrice - startPrice;
      const totalReturnPercent = startPrice > 0 ? (totalReturn / startPrice) * 100 : 0;
      const highestPrice = Math.max(...prices);
      const lowestPrice = Math.min(...prices);
      const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
      
      // Calculate volatility (standard deviation of daily returns)
      const dailyReturns = [];
      for (let i = 1; i < prices.length; i++) {
        const dailyReturn = (prices[i] - prices[i-1]) / prices[i-1];
        dailyReturns.push(dailyReturn);
      }
      const meanReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / dailyReturns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility

      return {
        symbol: response.data.symbol,
        exchange: response.data.exchange,
        interval: response.data.interval,
        timeframe: {
          start: response.data.start,
          end: response.data.end
        },
        totalDays: enhancedData.length,
        tradingDays: enhancedData.filter(d => !d.isWeekend).length,
        dailyData: enhancedData,
        summary: {
          startPrice,
          endPrice,
          totalReturn,
          totalReturnPercent,
          highestPrice,
          lowestPrice,
          averageVolume,
          volatility
        }
      };

    } catch (error) {
      console.error('DailyOHLCService error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Get daily OHLC for multiple symbols
   */
  async getMultipleDailyOHLC(symbols: string[], exchange: ExchangeCode = 'NSE', yearsBack: number = 2): Promise<DailyOHLCData[]> {
    const results: DailyOHLCData[] = [];
    
    for (const symbol of symbols) {
      try {
        const data = await this.getDailyOHLC({ symbol, exchange, yearsBack });
        results.push(data);
      } catch (error) {
        console.error(`Failed to fetch daily OHLC for ${symbol}:`, error);
        // Continue with other symbols
      }
    }
    
    return results;
  }

  /**
   * Get daily OHLC with performance comparison
   */
  async getDailyOHLCWithComparison(symbols: string[], exchange: ExchangeCode = 'NSE', yearsBack: number = 2): Promise<{
    data: DailyOHLCData[];
    comparison: {
      bestPerformer: { symbol: string; return: number };
      worstPerformer: { symbol: string; return: number };
      mostVolatile: { symbol: string; volatility: number };
      leastVolatile: { symbol: string; volatility: number };
    };
  }> {
    const data = await this.getMultipleDailyOHLC(symbols, exchange, yearsBack);
    
    if (data.length === 0) {
      throw new Error('No data available for comparison');
    }

    // Find best/worst performers and volatility
    const performances = data.map(d => ({
      symbol: d.symbol,
      return: d.summary.totalReturnPercent,
      volatility: d.summary.volatility
    }));

    const bestPerformer = performances.reduce((best, current) => 
      current.return > best.return ? current : best
    );
    
    const worstPerformer = performances.reduce((worst, current) => 
      current.return < worst.return ? current : worst
    );
    
    const mostVolatile = performances.reduce((most, current) => 
      current.volatility > most.volatility ? current : most
    );
    
    const leastVolatile = performances.reduce((least, current) => 
      current.volatility < least.volatility ? current : least
    );

    return {
      data,
      comparison: {
        bestPerformer: { symbol: bestPerformer.symbol, return: bestPerformer.return },
        worstPerformer: { symbol: worstPerformer.symbol, return: worstPerformer.return },
        mostVolatile: { symbol: mostVolatile.symbol, volatility: mostVolatile.volatility },
        leastVolatile: { symbol: leastVolatile.symbol, volatility: leastVolatile.volatility }
      }
    };
  }
}

export default DailyOHLCService;
