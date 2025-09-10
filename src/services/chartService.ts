import { 
  ChartDataRequest, 
  ChartDataResponse, 
  HistoricalChartDataResponse,
  ChartApiError, 
  OHLCData,
  HistoricalOHLCData, 
  ChartServiceConfig, 
  GetChartDataOptions,
  ExchangeCode,
  TimeInterval,
  HistoricalTimeInterval 
} from '@/types/chart';
import { 
  getTimeRange, 
  normalizeExchange, 
  validateInterval,
  validateHistoricalInterval, 
  parseOHLCData,
  parseHistoricalOHLCData,
  formatDateToISO 
} from '@/utils/chartUtils';
import TradingClient from './tradingClient';

class ChartService {
  private config: ChartServiceConfig;
  private tradingClient: TradingClient;

  constructor(config?: Partial<ChartServiceConfig>) {
    this.config = {
      apiUrl: config?.apiUrl || process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in',
      apiKey: config?.apiKey || process.env.TRADING_API_KEY || '',
      authKey: config?.authKey || process.env.TRADING_AUTH_KEY || '',
      clientId: config?.clientId || process.env.TRADING_CLIENT_ID || ''
    };

    // Initialize trading client for authentication
    this.tradingClient = new TradingClient({
      baseUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      privateKey: this.config.authKey,
      clientId: this.config.clientId
    });

    if (!this.config.apiKey || !this.config.authKey || !this.config.clientId) {
      console.warn('ChartService: Missing required API credentials. Some functionality may not work.');
    }
  }

  /**
   * Fetches chart data from the trading API
   */
  async getChartData(options: GetChartDataOptions): Promise<OHLCData> {
    try {
      // Validate required parameters
      if (!options.symbol && !options.token) {
        throw new Error('Either symbol or token must be provided');
      }

      const exchange = options.exchange || 'NSE';
      const interval = options.interval || '1m';

      // Validate interval
      if (!validateInterval(interval)) {
        throw new Error(`Invalid interval: ${interval}`);
      }

      // Get time range
      let startTime: string, endTime: string;
      
      if (options.startTime && options.endTime) {
        startTime = options.startTime;
        endTime = options.endTime;
      } else if (options.duration) {
        const timeRange = getTimeRange(options.duration);
        startTime = timeRange.start;
        endTime = timeRange.end;
      } else {
        // Default to last 1 hour
        const timeRange = getTimeRange('1h');
        startTime = timeRange.start;
        endTime = timeRange.end;
      }

      // Prepare request payload
      const requestPayload: ChartDataRequest = {
        exchange: normalizeExchange(exchange),
        interval,
        start_time: startTime,
        end_time: endTime
      };

      // Add symbol or token
      if (options.symbol) {
        requestPayload.symbol = options.symbol.toUpperCase();
      } else if (options.token) {
        requestPayload.token = options.token;
      }

      // Make API request using TradingClient with proper authentication
      const chartResponse = await this.tradingClient.getChartData(requestPayload) as ChartDataResponse;
      
      // Parse and format the data
      const parsedData = parseOHLCData(chartResponse.data.points);

      return {
        symbol: chartResponse.data.symbol,
        exchange: chartResponse.data.exchange,
        interval: chartResponse.data.interval,
        timeframe: {
          start: chartResponse.data.start,
          end: chartResponse.data.end
        },
        data: parsedData
      };

    } catch (error) {
      console.error('ChartService error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Fetches multiple symbols data in parallel
   */
  async getMultipleChartData(
    symbols: string[], 
    options: Omit<GetChartDataOptions, 'symbol'>
  ): Promise<OHLCData[]> {
    const promises = symbols.map(symbol => 
      this.getChartData({ ...options, symbol }).catch(error => {
        console.error(`Failed to fetch data for ${symbol}:`, error);
        return null;
      })
    );

    const results = await Promise.allSettled(promises);
    return results
      .filter((result): result is PromiseFulfilledResult<OHLCData> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  /**
   * Gets current price data (latest OHLC)
   */
  async getCurrentPrice(symbol: string, exchange: ExchangeCode = 'NSE'): Promise<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    timestamp: string;
  }> {
    try {
      const data = await this.getChartData({
        symbol,
        exchange,
        interval: '1m',
        duration: '5m' // Get last 5 minutes
      });

      if (data.data.length === 0) {
        throw new Error('No data available');
      }

      const latest = data.data[data.data.length - 1];
      const previous = data.data.length > 1 ? data.data[data.data.length - 2] : latest;
      
      const change = latest.close - previous.close;
      const changePercent = (change / previous.close) * 100;

      return {
        symbol: data.symbol,
        price: latest.close,
        change,
        changePercent,
        timestamp: latest.timestamp
      };
    } catch (error) {
      console.error(`Failed to get current price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Gets historical data for backtesting using the historical-chart endpoint
   */
  async getHistoricalData(
    symbol: string,
    startDate: string,
    endDate: string,
    interval: HistoricalTimeInterval = '1W',
    exchange: ExchangeCode = 'NSE'
  ): Promise<HistoricalOHLCData> {
    try {
      // Validate required parameters
      if (!symbol) {
        throw new Error('Symbol is required');
      }

      // Validate historical interval
      if (!validateHistoricalInterval(interval)) {
        throw new Error(`Invalid historical interval: ${interval}. Must be one of: 1W, 1M, 3M, 1Y, 3Y, 5Y`);
      }

      // Prepare request payload
      const requestPayload: ChartDataRequest = {
        exchange: normalizeExchange(exchange),
        interval,
        start_time: startDate,
        end_time: endDate
      };

      // Add symbol
      requestPayload.symbol = symbol.toUpperCase();

      // Make API request using TradingClient with proper authentication
      const chartResponse = await this.tradingClient.getHistoricalChartData(requestPayload) as HistoricalChartDataResponse;
      
      // Parse and format the data with epochTime
      const parsedData = parseHistoricalOHLCData(chartResponse.data.points || []);

      return {
        symbol: chartResponse.data.symbol,
        exchange: chartResponse.data.exchange,
        interval: chartResponse.data.interval,
        timeframe: {
          start: chartResponse.data.start,
          end: chartResponse.data.end
        },
        data: parsedData
      };

    } catch (error) {
      console.error('ChartService historical data error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Gets intraday data for today
   */
  async getIntradayData(
    symbol: string,
    interval: TimeInterval = '5m',
    exchange: ExchangeCode = 'NSE'
  ): Promise<OHLCData> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(9, 15, 0, 0); // Market opens at 9:15 AM

    return this.getChartData({
      symbol,
      exchange,
      interval,
      startTime: formatDateToISO(todayStart),
      endTime: formatDateToISO(now)
    });
  }

  /**
   * Updates configuration
   */
  updateConfig(newConfig: Partial<ChartServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets service configuration (without sensitive data)
   */
  getConfig(): Omit<ChartServiceConfig, 'apiKey' | 'authKey'> {
    return {
      apiUrl: this.config.apiUrl,
      clientId: this.config.clientId
    };
  }
}

export default ChartService;
