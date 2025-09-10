import { SMA, RSI, MACD, EMA } from 'technicalindicators';
import CombinedTradingService from './combinedTradingService';
import SupportResistanceService from './supportResistanceService';
import { ExchangeCode } from '@/types/chart';

export interface TechnicalIndicators {
  close: number;
  ema50: number;
  rsi14: number;
  rsiSma14: number;
  macd: number;
  macdSignal: number;
  histogram: number;
}

export interface EntryConditions {
  aboveEMA: boolean;
  rsiInRange: boolean;
  rsiAboveSMA: boolean;
  macdBullish: boolean;
  histogramOk: boolean;
  resistanceOk: boolean;
}

export interface EntrySignalResult {
  symbol: string;
  exchange: string;
  analysis_date: string;
  current_price: number;
  signal: 'ENTRY' | 'NO_ENTRY';
  confidence: number;
  indicators: TechnicalIndicators;
  conditions: EntryConditions;
  histogram_count: number;
  resistance_check: {
    passed: boolean;
    reason: string;
    distancePercent: number | null;
    nearestResistance: number | null;
  };
  reasoning: string;
  next_review: string;
}

/**
 * Entry Signal Service implementing the complete Algo-MTF entry logic
 */
class EntrySignalService {
  private combinedTradingService: CombinedTradingService;
  private srService: SupportResistanceService;

  constructor() {
    this.combinedTradingService = new CombinedTradingService();
    this.srService = new SupportResistanceService();
  }

  /**
   * Analyze entry signal for a symbol
   */
  async analyzeEntrySignal(symbol: string, exchange: ExchangeCode = 'NSE'): Promise<EntrySignalResult> {
    try {
      // Step 1: Get combined trading data using the fixed IST service
      const tradingData = await this.combinedTradingService.getCombinedTradingData(symbol, exchange);
      
      // Step 2: Get Support/Resistance analysis
      const srData = await this.srService.analyzeSupportResistance(symbol, exchange);
      
      // Step 3: Prepare data for technical analysis
      const allCandles = [...tradingData.historicalData];
      
      // Add today's candle if valid (now using IST-corrected data)
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

      // DEBUG: Log the data we're working with
      console.log(`🔍 DEBUG ${symbol}: Historical data points: ${tradingData.historicalData.length}`);
      console.log(`🔍 DEBUG ${symbol}: Today's candle: ${tradingData.todaysCandle.close > 0 ? `${tradingData.todaysCandle.close}` : 'null'}`);
      console.log(`🔍 DEBUG ${symbol}: Total candles for analysis: ${allCandles.length}`);
      console.log(`🔍 DEBUG ${symbol}: Last candle close: ${allCandles[allCandles.length - 1]?.close}`);

      // Step 6: Calculate technical indicators
      const indicators = this.calculateTechnicalIndicators(allCandles);
      
      // DEBUG: Log calculated indicators
      console.log(`🔍 DEBUG ${symbol}: Indicators - Close: ${indicators.close}, EMA50: ${indicators.ema50}, RSI14: ${indicators.rsi14}`);
      
      // Step 7: Calculate histogram count
      const histogramCount = this.calculateHistogramCount(allCandles);
      
      // Step 8: Check resistance proximity with proper logic
      let resistanceCheck;
      if (!srData.nearest_resistance && !srData.nearest_support) {
        // No resistance + no support data = FALSE
        resistanceCheck = {
          passed: false,
          reason: 'No resistance or support data available',
          distancePercent: null,
          nearestResistance: null
        };
      } else if (!srData.nearest_resistance && srData.nearest_support) {
        // No resistance but support data available = TRUE
        resistanceCheck = {
          passed: true,
          reason: 'No resistance data but support data available - allowing entry',
          distancePercent: null,
          nearestResistance: null
        };
      } else {
        // Normal resistance check
        resistanceCheck = this.srService.checkResistanceProximity(indicators.close, srData, 1.5);
      }

      // Step 7: Evaluate all entry conditions
      const conditions = this.evaluateEntryConditions(indicators, histogramCount, resistanceCheck);
      
      // Step 8: Generate final signal
      const signal = this.generateEntrySignal(conditions, indicators, histogramCount, resistanceCheck);

      return {
        symbol,
        exchange,
        analysis_date: new Date().toISOString().split('T')[0],
        current_price: indicators.close,
        signal: signal.signal,
        confidence: signal.confidence,
        indicators,
        conditions,
        histogram_count: histogramCount,
        resistance_check: resistanceCheck,
        reasoning: signal.reasoning,
        next_review: signal.nextReview,
        debug_info: {
          historical_data_points: tradingData.historicalData.length,
          todays_candle_close: tradingData.todaysCandle.close || 0,
          total_candles: allCandles.length,
          last_candle_close: allCandles[allCandles.length - 1]?.close,
          last_candle_date: allCandles[allCandles.length - 1]?.date
        }
      };

    } catch (error) {
      console.error('EntrySignalService error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Calculate all technical indicators using the technicalindicators library
   */
  private calculateTechnicalIndicators(candles: any[]): TechnicalIndicators {
    const closes = candles.map(c => c.close);
    const currentClose = closes[closes.length - 1];

    // EMA50
    const ema50Values = EMA.calculate({ 
      values: closes, 
      period: 50 
    });
    const ema50 = ema50Values[ema50Values.length - 1] || 0;

    // RSI14
    const rsi14Values = RSI.calculate({ 
      values: closes, 
      period: 14 
    });
    const rsi14 = rsi14Values[rsi14Values.length - 1] || 0;

    // RSI SMA14 (Simple Moving Average of RSI values)
    const rsiSma14Values = SMA.calculate({ 
      values: rsi14Values, 
      period: 14 
    });
    const rsiSma14 = rsiSma14Values[rsiSma14Values.length - 1] || 0;

    // MACD (12,26,9)
    const macdData = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    
    const latestMACD = macdData[macdData.length - 1];
    const macd = latestMACD?.MACD || 0;
    const macdSignal = latestMACD?.signal || 0;
    const histogram = latestMACD?.histogram || 0;

    return {
      close: currentClose,
      ema50: Math.round(ema50 * 100) / 100,
      rsi14: Math.round(rsi14 * 100) / 100,
      rsiSma14: Math.round(rsiSma14 * 100) / 100,
      macd: Math.round(macd * 100) / 100,
      macdSignal: Math.round(macdSignal * 100) / 100,
      histogram: Math.round(histogram * 100) / 100
    };
  }

  /**
   * Calculate consecutive positive histogram count
   */
  private calculateHistogramCount(candles: any[]): number {
    const closes = candles.map(c => c.close);
    
    const macdData = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    let consecutiveCount = 0;
    for (let i = macdData.length - 1; i >= 0; i--) {
      if (macdData[i]?.histogram > 0) {
        consecutiveCount++;
      } else {
        break; // Stop at first non-positive histogram
      }
    }

    return consecutiveCount;
  }

  /**
   * Evaluate all entry conditions
   */
  private evaluateEntryConditions(
    indicators: TechnicalIndicators, 
    histogramCount: number,
    resistanceCheck: any
  ): EntryConditions {
    return {
      aboveEMA: indicators.close > indicators.ema50,
      rsiInRange: indicators.rsi14 > 50 && indicators.rsi14 <= 70,
      rsiAboveSMA: indicators.rsi14 >= indicators.rsiSma14,
      macdBullish: indicators.macd > indicators.macdSignal,
      histogramOk: histogramCount <= 3,
      resistanceOk: resistanceCheck.passed
    };
  }

  /**
   * Generate final entry signal with reasoning
   */
  private generateEntrySignal(
    conditions: EntryConditions, 
    indicators: TechnicalIndicators,
    histogramCount: number,
    resistanceCheck: any
  ): {
    signal: 'ENTRY' | 'NO_ENTRY';
    confidence: number;
    reasoning: string;
    nextReview: string;
  } {
    // Check if ALL conditions are met
    const allConditionsMet = Object.values(conditions).every(condition => condition === true);
    
    let confidence = 0;
    const reasons: string[] = [];
    const failures: string[] = [];

    // Calculate confidence based on individual conditions
    if (conditions.aboveEMA) {
      confidence += 20;
      reasons.push('Price above EMA50 (Uptrend)');
    } else {
      failures.push(`Price below EMA50 (₹${indicators.close} < ₹${indicators.ema50})`);
    }

    if (conditions.rsiInRange) {
      confidence += 15;
      reasons.push(`RSI in healthy range (${indicators.rsi14})`);
    } else {
      if (indicators.rsi14 <= 50) {
        failures.push(`RSI oversold/neutral (${indicators.rsi14} <= 50)`);
      } else {
        failures.push(`RSI overbought (${indicators.rsi14} > 70)`);
      }
    }

    if (conditions.rsiAboveSMA) {
      confidence += 15;
      reasons.push(`RSI above SMA (${indicators.rsi14} >= ${indicators.rsiSma14})`);
    } else {
      failures.push(`RSI below SMA (${indicators.rsi14} < ${indicators.rsiSma14})`);
    }

    if (conditions.macdBullish) {
      confidence += 20;
      reasons.push('MACD bullish signal');
    } else {
      failures.push(`MACD bearish (${indicators.macd} <= ${indicators.macdSignal})`);
    }

    if (conditions.histogramOk) {
      confidence += 15;
      reasons.push(`Early momentum phase (${histogramCount} bars)`);
    } else {
      failures.push(`Late momentum entry (${histogramCount} > 3 bars)`);
    }

    if (conditions.resistanceOk) {
      confidence += 15;
      reasons.push(resistanceCheck.reason);
    } else {
      failures.push(resistanceCheck.reason);
    }

    // Determine next review timing
    let nextReview = 'Next market day';
    const now = new Date();
    const marketClose = new Date(now);
    marketClose.setHours(15, 30, 0, 0);
    
    if (now < marketClose && now.getDay() !== 0 && now.getDay() !== 6) {
      nextReview = 'End of day (3:25 PM)';
    }

    if (allConditionsMet) {
      return {
        signal: 'ENTRY',
        confidence,
        reasoning: `🎯 ENTRY SIGNAL: All conditions met. ${reasons.join(', ')}`,
        nextReview
      };
    } else {
      return {
        signal: 'NO_ENTRY',
        confidence,
        reasoning: `❌ NO ENTRY: ${failures.join(', ')}`,
        nextReview
      };
    }
  }

  /**
   * Get entry signals for multiple symbols
   */
  async getMultipleEntrySignals(symbols: string[], exchange: ExchangeCode = 'NSE'): Promise<EntrySignalResult[]> {
    const results: EntrySignalResult[] = [];

    for (const symbol of symbols) {
      try {
        const signal = await this.analyzeEntrySignal(symbol, exchange);
        results.push(signal);
      } catch (error) {
        console.error(`Failed to analyze entry signal for ${symbol}:`, error);
        // Continue with other symbols
      }
    }

    return results;
  }

  /**
   * Get entry signals summary for portfolio screening
   */
  async getEntrySignalsSummary(symbols: string[], exchange: ExchangeCode = 'NSE'): Promise<{
    signals: EntrySignalResult[];
    summary: {
      total: number;
      entries: number;
      noEntries: number;
      avgConfidence: number;
      topOpportunities: Array<{ symbol: string; confidence: number; reasoning: string }>;
    };
  }> {
    const signals = await this.getMultipleEntrySignals(symbols, exchange);
    
    const entries = signals.filter(s => s.signal === 'ENTRY');
    const noEntries = signals.filter(s => s.signal === 'NO_ENTRY');
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    
    // Get top 3 opportunities (highest confidence)
    const topOpportunities = signals
      .filter(s => s.signal === 'ENTRY')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(s => ({
        symbol: s.symbol,
        confidence: s.confidence,
        reasoning: s.reasoning
      }));

    return {
      signals,
      summary: {
        total: signals.length,
        entries: entries.length,
        noEntries: noEntries.length,
        avgConfidence: Math.round(avgConfidence),
        topOpportunities
      }
    };
  }
}

export default EntrySignalService;
