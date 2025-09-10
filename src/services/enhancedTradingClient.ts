import TradingClient from './tradingClient';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  expiresAt: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Enhanced Trading Client with reliability improvements
 */
class EnhancedTradingClient {
  private tradingClient: TradingClient;
  private cache: Map<string, CacheEntry> = new Map();
  private circuitBreaker: { failures: number; lastFailure: number; isOpen: boolean } = {
    failures: 0,
    lastFailure: 0,
    isOpen: false
  };
  private tokenPool: string[] = [];
  private currentTokenIndex = 0;

  constructor() {
    this.tradingClient = new TradingClient({
      baseUrl: process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in',
      apiKey: process.env.TRADING_API_KEY || '',
      privateKey: process.env.TRADING_AUTH_KEY || '',
      clientId: process.env.TRADING_CLIENT_ID || ''
    });
  }

  /**
   * Get chart data with retry logic and caching
   */
  async getChartDataWithRetry(params: {symbol: string, exchange: string, interval: string, start_time: string, end_time: string}, retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  }): Promise<unknown> {
    const cacheKey = this.generateCacheKey('chart', params);
    
    // Check cache first
    const cachedData = this.getFromCache(cacheKey);
    if (cachedData) {
      console.log(`📋 Cache hit for ${params.symbol}`);
      return cachedData;
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open - too many recent failures');
    }

    // Retry logic
    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        console.log(`📊 Analyzing ${params.symbol} (attempt ${attempt}/${retryConfig.maxRetries})`);
        
        const result = await this.tradingClient.getChartData(params);
        
        // Cache successful result (expires in 1 hour)
        this.setCache(cacheKey, result, 60 * 60 * 1000);
        
        // Reset circuit breaker on success
        this.circuitBreaker.failures = 0;
        
        return result;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed for ${params.symbol}:`, error instanceof Error ? error.message : 'Unknown error');
        
        // Record failure for circuit breaker
        this.recordFailure();
        
        if (attempt === retryConfig.maxRetries) {
          throw new Error(`Failed after ${retryConfig.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelay
        );
        
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await this.delay(delay);
      }
    }

    throw new Error('Retry logic failed - this should not happen');
  }

  /**
   * Get historical chart data with retry logic
   */
  async getHistoricalChartDataWithRetry(params: {symbol: string, exchange: string, interval: string, start_time: string, end_time: string}, retryConfig?: RetryConfig): Promise<unknown> {
    const cacheKey = this.generateCacheKey('historical', params);
    
    // Check cache first (historical data can be cached longer)
    const cachedData = this.getFromCache(cacheKey);
    if (cachedData) {
      console.log(`📋 Cache hit for ${params.symbol} historical`);
      return cachedData;
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open - too many recent failures');
    }

    const config = retryConfig || {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    };

    // Retry logic
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await this.tradingClient.getHistoricalChartData(params);
        
        // Cache historical data for 4 hours (more stable)
        this.setCache(cacheKey, result, 4 * 60 * 60 * 1000);
        
        // Reset circuit breaker on success
        this.circuitBreaker.failures = 0;
        
        return result;
        
      } catch (error) {
        this.recordFailure();
        
        if (attempt === config.maxRetries) {
          throw new Error(`Historical data failed after ${config.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        await this.delay(delay);
      }
    }

    throw new Error('Historical retry logic failed');
  }

  /**
   * Batch process with controlled concurrency
   */
  async processBatchWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 3
  ): Promise<Array<R | Error>> {
    const results: Array<R | Error> = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (item) => {
        try {
          return await processor(item);
        } catch (error) {
          return error instanceof Error ? error : new Error('Unknown error');
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(new Error(result.reason));
        }
      });
      
      // Delay between batches
      if (i + concurrency < items.length) {
        await this.delay(2000); // 2 second delay between batches
      }
    }
    
    return results;
  }

  /**
   * Cache management
   */
  private generateCacheKey(type: string, params: {symbol: string, interval?: string}): string {
    return `${type}_${params.symbol}_${params.interval || 'default'}_${new Date().toDateString()}`;
  }

  private getFromCache(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(): boolean {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // Reset circuit breaker after 5 minutes
    if (now - this.circuitBreaker.lastFailure > fiveMinutes) {
      this.circuitBreaker.failures = 0;
      this.circuitBreaker.isOpen = false;
    }
    
    // Open circuit breaker after 10 failures
    if (this.circuitBreaker.failures >= 10) {
      this.circuitBreaker.isOpen = true;
    }
    
    return this.circuitBreaker.isOpen;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    cache_size: number;
    circuit_breaker: { failures: number; isOpen: boolean };
    last_success: string;
  }> {
    try {
      // Try a simple API call
      await this.tradingClient.getChartData({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        interval: '1m',
        start_time: new Date(Date.now() - 60000).toISOString().slice(0, 19),
        end_time: new Date().toISOString().slice(0, 19)
      });
      
      return {
        status: 'healthy',
        cache_size: this.cache.size,
        circuit_breaker: {
          failures: this.circuitBreaker.failures,
          isOpen: this.circuitBreaker.isOpen
        },
        last_success: new Date().toISOString()
      };
    } catch {
      return {
        status: this.circuitBreaker.isOpen ? 'unhealthy' : 'degraded',
        cache_size: this.cache.size,
        circuit_breaker: {
          failures: this.circuitBreaker.failures,
          isOpen: this.circuitBreaker.isOpen
        },
        last_success: 'Failed'
      };
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EnhancedTradingClient;
