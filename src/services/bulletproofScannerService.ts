import { SMA, RSI, MACD, EMA } from 'technicalindicators';
import CombinedTradingService from './combinedTradingService';
import SupportResistanceService from './supportResistanceService';
import { ExchangeCode } from '@/types/chart';
import { ALL_SYMBOLS } from '@/constants/symbols';

export interface BulletproofScanResult {
  symbol: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  signal: 'ENTRY' | 'WATCHLIST' | 'NO_ENTRY' | 'ERROR';
  confidence: number;
  win_probability: number;
  current_price: number;
  reasoning: string;
  processing_time_ms: number;
  retry_count: number;
  error_details?: string;
  conditions?: {
    aboveEMA: boolean;
    rsiInRange: boolean;
    rsiAboveSMA: boolean;
    macdBullish: boolean;
    histogramOk: boolean;
    resistanceOk: boolean;
  };
  indicators?: {
    close: number;
    ema50: number;
    rsi14: number;
    rsiSma14: number;
    macd: number;
    macdSignal: number;
    histogram: number;
  };
  risk_assessment?: {
    stop_loss: number;
    target1: number;
    target2: number;
    position_size_percent: number;
  };
}

export interface BulletproofScanSummary {
  scan_id: string;
  scan_date: string;
  total_stocks: number;
  successful: number;
  partial_success: number;
  failed: number;
  success_rate_percent: number;
  entry_signals: number;
  watchlist_signals: number;
  no_entry_signals: number;
  processing_time_total_ms: number;
  avg_processing_time_per_stock_ms: number;
  market_condition: string;
  top_opportunities: Array<{
    symbol: string;
    confidence: number;
    win_probability: number;
    current_price: number;
    reasoning: string;
  }>;
}

/**
 * Bulletproof Scanner Service - Guaranteed to process all stocks
 */
class BulletproofScannerService {
  private combinedService: CombinedTradingService;
  private srService: SupportResistanceService;
  private processingLog: Array<{ timestamp: string; message: string; symbol?: string }> = [];

  constructor() {
    this.combinedService = new CombinedTradingService();
    this.srService = new SupportResistanceService();
  }

  /**
   * Bulletproof scan with guaranteed processing of all stocks
   */
  async bulletproofScanAll(exchange: ExchangeCode = 'NSE'): Promise<{
    results: BulletproofScanResult[];
    summary: BulletproofScanSummary;
    processing_log: Array<{ timestamp: string; message: string; symbol?: string }>;
  }> {
    const scanId = `scan_${Date.now()}`;
    const startTime = Date.now();
    this.processingLog = [];
    
    this.log(`🚀 Starting Bulletproof Scan ${scanId} for ${ALL_SYMBOLS.length} stocks`);
    
    const results: BulletproofScanResult[] = [];
    let _successCount = 0;
    let _partialSuccessCount = 0;
    let _failedCount = 0;

    // Process each stock with maximum reliability
    for (let i = 0; i < ALL_SYMBOLS.length; i++) {
      const symbol = ALL_SYMBOLS[i];
      const progress = `${i + 1}/${ALL_SYMBOLS.length}`;
      
      this.log(`📊 [${progress}] Processing ${symbol}...`, symbol);
      
      const stockStartTime = Date.now();
      const result = await this.processStockWithMaxReliability(symbol, exchange);
      const stockProcessingTime = Date.now() - stockStartTime;
      
      result.processing_time_ms = stockProcessingTime;
      results.push(result);
      
      // Update counters
      if (result.status === 'SUCCESS') {
        _successCount++;
        this.log(`✅ [${progress}] ${symbol}: ${result.signal} (${result.confidence}% conf, ${result.win_probability}% win)`, symbol);
      } else if (result.status === 'PARTIAL_SUCCESS') {
        _partialSuccessCount++;
        this.log(`⚠️ [${progress}] ${symbol}: ${result.signal} (partial data)`, symbol);
      } else {
        _failedCount++;
        this.log(`❌ [${progress}] ${symbol}: FAILED - ${result.error_details}`, symbol);
      }

      // Progress update every 10 stocks
      if ((i + 1) % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const eta = (elapsed / (i + 1)) * (ALL_SYMBOLS.length - i - 1);
        this.log(`📈 Progress: ${i + 1}/${ALL_SYMBOLS.length} (${Math.round(((i + 1) / ALL_SYMBOLS.length) * 100)}%) - ETA: ${Math.round(eta)}s`);
      }

      // Small delay to prevent API overload
      await this.delay(200);
    }

    const totalTime = Date.now() - startTime;
    this.log(`✅ Bulletproof scan completed in ${(totalTime / 1000).toFixed(1)}s`);

    // Generate summary
    const summary = this.generateBulletproofSummary(results, scanId, startTime, totalTime);
    
    // Log final summary
    this.log(`🎯 FINAL RESULTS: ${summary.entry_signals} entries, ${summary.watchlist_signals} watchlist, ${summary.success_rate_percent}% success rate`);

    return {
      results,
      summary,
      processing_log: this.processingLog
    };
  }

  /**
   * Process single stock with maximum reliability
   */
  private async processStockWithMaxReliability(symbol: string, exchange: ExchangeCode): Promise<BulletproofScanResult> {
    const maxRetries = 5;
    const baseDelay = 1000;
    let lastError = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try to get combined data
        let tradingData;
        try {
          tradingData = await this.combinedService.getCombinedTradingData(symbol, exchange);
        } catch (error) {
          if (attempt === maxRetries) {
            return this.createErrorResult(symbol, `Combined data failed: ${error instanceof Error ? error.message : 'Unknown error'}`, attempt);
          }
          await this.delay(baseDelay * attempt);
          continue;
        }

        // Try to get S/R data (optional - can proceed without it)
        let srData = null;
        try {
          srData = await this.srService.analyzeSupportResistance(symbol, exchange);
        } catch {
          this.log(`⚠️ S/R analysis failed for ${symbol}, proceeding without it`, symbol);
        }

        // Calculate indicators
        const allCandles = [...tradingData.historicalData];
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

        const indicators = this.calculateIndicatorsSafely(allCandles);
        const histogramCount = this.calculateHistogramCountSafely(allCandles);
        
        // Check resistance (with fallback)
        const resistanceCheck = srData 
          ? this.srService.checkResistanceProximity(indicators.close, srData, 1.5)
          : { passed: true, reason: 'No S/R data - allowing entry', distancePercent: null, nearestResistance: null };

        // Evaluate conditions
        const conditions = this.evaluateConditionsSafely(indicators, histogramCount, resistanceCheck);
        
        // Generate signal
        const signal = this.generateSignalSafely(conditions);

        return {
          symbol,
          status: srData ? 'SUCCESS' : 'PARTIAL_SUCCESS',
          signal: signal.signal,
          confidence: signal.confidence,
          win_probability: signal.winProbability,
          current_price: indicators.close,
          reasoning: signal.reasoning,
          processing_time_ms: 0, // Will be set by caller
          retry_count: attempt,
          conditions,
          indicators,
          risk_assessment: {
            stop_loss: Math.round(indicators.close * 0.975 * 100) / 100,
            target1: Math.round(indicators.close * 1.05 * 100) / 100,
            target2: Math.round(indicators.close * 1.08 * 100) / 100,
            position_size_percent: signal.signal === 'ENTRY' ? 3 : 1
          }
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.log(`❌ Attempt ${attempt}/${maxRetries} failed for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`, symbol);
        
        if (attempt < maxRetries) {
          await this.delay(baseDelay * Math.pow(2, attempt - 1)); // Exponential backoff
        }
      }
    }

    return this.createErrorResult(symbol, lastError, maxRetries);
  }

  /**
   * Calculate indicators with error handling
   */
  private calculateIndicatorsSafely(candles: Array<{open: number, high: number, low: number, close: number, volume: number}>): {
    close: number;
    ema50: number;
    rsi14: number;
    rsiSma14: number;
    macd: number;
    macdSignal: number;
    histogram: number;
  } {
    try {
      const closes = candles.map(c => c.close);
      const currentClose = closes[closes.length - 1];

      // Calculate with fallbacks
      const ema50Values = EMA.calculate({ values: closes, period: Math.min(50, closes.length) });
      const ema50 = ema50Values[ema50Values.length - 1] || currentClose;

      const rsi14Values = RSI.calculate({ values: closes, period: Math.min(14, closes.length) });
      const rsi14 = rsi14Values[rsi14Values.length - 1] || 50;

      const rsiSma14Values = SMA.calculate({ values: rsi14Values, period: Math.min(14, rsi14Values.length) });
      const rsiSma14 = rsiSma14Values[rsiSma14Values.length - 1] || 50;

      const macdData = MACD.calculate({
        values: closes,
        fastPeriod: Math.min(12, closes.length),
        slowPeriod: Math.min(26, closes.length),
        signalPeriod: Math.min(9, closes.length),
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      
      const latestMACD = macdData[macdData.length - 1];

      return {
        close: currentClose,
        ema50: Math.round(ema50 * 100) / 100,
        rsi14: Math.round(rsi14 * 100) / 100,
        rsiSma14: Math.round(rsiSma14 * 100) / 100,
        macd: Math.round((latestMACD?.MACD || 0) * 100) / 100,
        macdSignal: Math.round((latestMACD?.signal || 0) * 100) / 100,
        histogram: Math.round((latestMACD?.histogram || 0) * 100) / 100
      };
    } catch {
      // Return safe defaults if calculation fails
      const currentClose = candles[candles.length - 1]?.close || 0;
      return {
        close: currentClose,
        ema50: currentClose,
        rsi14: 50,
        rsiSma14: 50,
        macd: 0,
        macdSignal: 0,
        histogram: 0
      };
    }
  }

  /**
   * Calculate histogram count with error handling
   */
  private calculateHistogramCountSafely(candles: Array<{close: number}>): number {
    try {
      const closes = candles.map(c => c.close);
      
      const macdData = MACD.calculate({
        values: closes,
        fastPeriod: Math.min(12, closes.length),
        slowPeriod: Math.min(26, closes.length),
        signalPeriod: Math.min(9, closes.length),
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      let consecutiveCount = 0;
      for (let i = macdData.length - 1; i >= 0; i--) {
        const dataPoint = macdData[i];
        if (dataPoint && dataPoint.histogram !== undefined && dataPoint.histogram > 0) {
          consecutiveCount++;
        } else {
          break;
        }
      }

      return consecutiveCount;
    } catch {
      return 0; // Safe default
    }
  }

  /**
   * Evaluate conditions with error handling
   */
  private evaluateConditionsSafely(
    indicators: {close: number, ema50: number, rsi14: number, rsiSma14: number, macd: number, macdSignal: number}, 
    histogramCount: number, 
    resistanceCheck: {passed: boolean}
  ): {
    aboveEMA: boolean;
    rsiInRange: boolean; 
    rsiAboveSMA: boolean;
    macdBullish: boolean;
    histogramOk: boolean;
    resistanceOk: boolean;
  } {
    try {
      return {
        aboveEMA: indicators.close > indicators.ema50,
        rsiInRange: indicators.rsi14 > 50 && indicators.rsi14 <= 70,
        rsiAboveSMA: indicators.rsi14 >= indicators.rsiSma14,
        macdBullish: indicators.macd > indicators.macdSignal,
        histogramOk: histogramCount <= 3,
        resistanceOk: resistanceCheck.passed
      };
    } catch {
      return {
        aboveEMA: false,
        rsiInRange: false,
        rsiAboveSMA: false,
        macdBullish: false,
        histogramOk: false,
        resistanceOk: false
      };
    }
  }

  /**
   * Generate signal with error handling
   */
  private generateSignalSafely(
    conditions: {[key: string]: boolean}
  ): {
    signal: 'ENTRY' | 'NO_ENTRY' | 'WATCHLIST' | 'ERROR';
    confidence: number;
    winProbability: number;
    reasoning: string;
  } {
    try {
      const conditionsPassed = Object.values(conditions).filter(c => c === true).length;
      const confidence = Math.round((conditionsPassed / 6) * 100);
      const winProbability = Math.max(20, Math.min(95, confidence + 10));

      let signal: 'ENTRY' | 'NO_ENTRY' | 'WATCHLIST' = 'NO_ENTRY';
      if (conditionsPassed === 6) {
        signal = 'ENTRY';
      } else if (conditionsPassed >= 4) {
        signal = 'WATCHLIST';
      }

      const reasons: string[] = [];
      if (conditions.aboveEMA) reasons.push('Above EMA50');
      if (conditions.rsiInRange) reasons.push('RSI healthy');
      if (conditions.rsiAboveSMA) reasons.push('RSI rising');
      if (conditions.macdBullish) reasons.push('MACD bullish');
      if (conditions.histogramOk) reasons.push('Early momentum');
      if (conditions.resistanceOk) reasons.push('Clear resistance');

      const failures: string[] = [];
      if (!conditions.aboveEMA) failures.push('Below EMA50');
      if (!conditions.rsiInRange) failures.push('RSI out of range');
      if (!conditions.rsiAboveSMA) failures.push('RSI declining');
      if (!conditions.macdBullish) failures.push('MACD bearish');
      if (!conditions.histogramOk) failures.push('Late momentum');
      if (!conditions.resistanceOk) failures.push('Near resistance');

      const reasoning = signal === 'ENTRY' 
        ? `🎯 ENTRY: ${reasons.join(', ')}`
        : signal === 'WATCHLIST'
        ? `👀 WATCHLIST: ${reasons.join(', ')}. Missing: ${failures.join(', ')}`
        : `❌ NO ENTRY: ${failures.join(', ')}`;

      return {
        signal,
        confidence,
        winProbability,
        reasoning
      };
    } catch (error) {
      return {
        signal: 'ERROR',
        confidence: 0,
        winProbability: 0,
        reasoning: `Signal generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(symbol: string, error: string, retryCount: number): BulletproofScanResult {
    return {
      symbol,
      status: 'FAILED',
      signal: 'ERROR',
      confidence: 0,
      win_probability: 0,
      current_price: 0,
      reasoning: 'Analysis failed',
      processing_time_ms: 0,
      retry_count: retryCount,
      error_details: error
    };
  }

  /**
   * Generate bulletproof summary
   */
  private generateBulletproofSummary(results: BulletproofScanResult[], scanId: string, startTime: number, totalTime: number): BulletproofScanSummary {
    const successful = results.filter(r => r.status === 'SUCCESS').length;
    const partialSuccess = results.filter(r => r.status === 'PARTIAL_SUCCESS').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    const successRate = Math.round(((successful + partialSuccess) / results.length) * 100);

    const entries = results.filter(r => r.signal === 'ENTRY');
    const watchlist = results.filter(r => r.signal === 'WATCHLIST');
    const noEntries = results.filter(r => r.signal === 'NO_ENTRY');

    const topOpportunities = entries
      .sort((a, b) => b.win_probability - a.win_probability)
      .slice(0, 5)
      .map(r => ({
        symbol: r.symbol,
        confidence: r.confidence,
        win_probability: r.win_probability,
        current_price: r.current_price,
        reasoning: r.reasoning
      }));

    const avgProcessingTime = results.reduce((sum, r) => sum + r.processing_time_ms, 0) / results.length;

    let marketCondition = 'NEUTRAL';
    const entryRate = (entries.length / (successful + partialSuccess)) * 100;
    if (entryRate > 15) marketCondition = 'BULLISH';
    else if (entryRate < 3) marketCondition = 'BEARISH';
    else if (entryRate > 8) marketCondition = 'MIXED';

    return {
      scan_id: scanId,
      scan_date: new Date().toISOString().split('T')[0],
      total_stocks: results.length,
      successful,
      partial_success: partialSuccess,
      failed,
      success_rate_percent: successRate,
      entry_signals: entries.length,
      watchlist_signals: watchlist.length,
      no_entry_signals: noEntries.length,
      processing_time_total_ms: totalTime,
      avg_processing_time_per_stock_ms: Math.round(avgProcessingTime),
      market_condition: marketCondition,
      top_opportunities: topOpportunities
    };
  }

  /**
   * Logging utility
   */
  private log(message: string, symbol?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      symbol
    };
    this.processingLog.push(logEntry);
    console.log(`[${logEntry.timestamp.split('T')[1].split('.')[0]}] ${message}`);
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default BulletproofScannerService;
