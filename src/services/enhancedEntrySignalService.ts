import { SMA, RSI, MACD, EMA } from 'technicalindicators';
import CombinedTradingService from './combinedTradingService';
import SupportResistanceService from './supportResistanceService';
import EnhancedTradingClient from './enhancedTradingClient';
import { ExchangeCode } from '@/types/chart';

export interface EnhancedTechnicalIndicators {
  close: number;
  ema50: number;
  rsi14: number;
  rsiSma14: number;
  macd: number;
  macdSignal: number;
  histogram: number;
  // Enhanced indicators
  ema20: number;
  volume: number;
  avgVolume20: number;
  priceVsEma50Percent: number;
  rsiMomentum: boolean;
  macdAcceleration: boolean;
}

export interface EnhancedEntryConditions {
  // Original conditions
  aboveEMA: boolean;
  rsiInRange: boolean;
  rsiAboveSMA: boolean;
  macdBullish: boolean;
  histogramOk: boolean;
  resistanceOk: boolean;
  // Enhanced conditions
  strongTrend: boolean;
  volumeConfirmation: boolean;
  rsiMomentumUp: boolean;
  acceleratingMACD: boolean;
  aboveEMA20: boolean;
  marketConditionOk: boolean;
}

export interface EnhancedEntrySignalResult {
  symbol: string;
  exchange: string;
  analysis_date: string;
  current_price: number;
  signal: 'ENTRY' | 'NO_ENTRY' | 'WATCHLIST';
  confidence: number;
  win_probability: number;
  risk_reward_ratio: number;
  indicators: EnhancedTechnicalIndicators;
  conditions: EnhancedEntryConditions;
  histogram_count: number;
  resistance_check: {
    passed: boolean;
    reason: string;
    distancePercent: number | null;
    nearestResistance: number | null;
  };
  reasoning: string;
  risk_assessment: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    stop_loss: number;
    target1: number;
    target2: number;
    position_size_percent: number;
  };
  next_review: string;
}

/**
 * Enhanced Entry Signal Service with improved reliability and stricter criteria
 */
class EnhancedEntrySignalService {
  private combinedTradingService: CombinedTradingService;
  private srService: SupportResistanceService;
  private enhancedClient: EnhancedTradingClient;

  constructor() {
    this.combinedTradingService = new CombinedTradingService();
    this.srService = new SupportResistanceService();
    this.enhancedClient = new EnhancedTradingClient();
  }

  /**
   * Analyze entry signal with enhanced criteria
   */
  async analyzeEnhancedEntrySignal(symbol: string, exchange: ExchangeCode = 'NSE'): Promise<EnhancedEntrySignalResult> {
    try {
      // Step 1: Get combined trading data with retry
      const tradingData = await this.getCombinedDataWithRetry(symbol, exchange);
      
      // Step 2: Get Support/Resistance analysis with retry
      const srData = await this.getSRDataWithRetry(symbol, exchange);
      
      // Step 3: Prepare enhanced data
      const allCandles = [...tradingData.historicalData];
      
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

      // Step 4: Calculate enhanced technical indicators
      const indicators = this.calculateEnhancedIndicators(allCandles);
      
      // Step 5: Calculate histogram count
      const histogramCount = this.calculateHistogramCount(allCandles);
      
      // Step 6: Check resistance proximity
      const resistanceCheck = this.srService.checkResistanceProximity(
        indicators.close, 
        srData, 
        1.5
      );

      // Step 7: Evaluate enhanced entry conditions
      const conditions = this.evaluateEnhancedConditions(indicators, histogramCount, resistanceCheck);
      
      // Step 8: Calculate market condition
      const marketCondition = await this.assessMarketCondition();
      conditions.marketConditionOk = marketCondition.isHealthy;

      // Step 9: Generate enhanced signal with risk assessment
      const signal = this.generateEnhancedSignal(conditions, indicators, histogramCount, resistanceCheck);

      return {
        symbol,
        exchange,
        analysis_date: new Date().toISOString().split('T')[0],
        current_price: indicators.close,
        signal: signal.signal,
        confidence: signal.confidence,
        win_probability: signal.winProbability,
        risk_reward_ratio: signal.riskRewardRatio,
        indicators,
        conditions,
        histogram_count: histogramCount,
        resistance_check: resistanceCheck,
        reasoning: signal.reasoning,
        risk_assessment: signal.riskAssessment,
        next_review: signal.nextReview
      };

    } catch (error) {
      console.error(`Enhanced analysis failed for ${symbol}:`, error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  /**
   * Get combined data with retry logic
   */
  private async getCombinedDataWithRetry(symbol: string, exchange: ExchangeCode, maxRetries: number = 3): Promise<{
    historicalData: Array<{date: string, open: number, high: number, low: number, close: number, volume: number}>;
    todaysCandle: {date: string, open: number, high: number, low: number, close: number, volume: number};
    analysis?: unknown;
  }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.combinedTradingService.getCombinedTradingData(symbol, exchange);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await this.delay(1000 * attempt);
      }
    }
    throw new Error(`Failed to get combined data after ${maxRetries} attempts`);
  }

  /**
   * Get S/R data with retry logic
   */
  private async getSRDataWithRetry(symbol: string, exchange: ExchangeCode, maxRetries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.srService.analyzeSupportResistance(symbol, exchange);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await this.delay(1000 * attempt);
      }
    }
    throw new Error(`Failed to get S/R data after ${maxRetries} attempts`);
  }

  /**
   * Calculate enhanced technical indicators
   */
  private calculateEnhancedIndicators(candles: Array<{close: number, volume: number}>): EnhancedTechnicalIndicators {
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const currentClose = closes[closes.length - 1];
    const currentVolume = volumes[volumes.length - 1];

    // Original indicators
    const ema50Values = EMA.calculate({ values: closes, period: 50 });
    const ema50 = ema50Values[ema50Values.length - 1] || 0;

    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const ema20 = ema20Values[ema20Values.length - 1] || 0;

    const rsi14Values = RSI.calculate({ values: closes, period: 14 });
    const rsi14 = rsi14Values[rsi14Values.length - 1] || 0;
    const rsi14Previous = rsi14Values[rsi14Values.length - 2] || 0;

    const rsiSma14Values = SMA.calculate({ values: rsi14Values, period: 14 });
    const rsiSma14 = rsiSma14Values[rsiSma14Values.length - 1] || 0;

    const macdData = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    
    const latestMACD = macdData[macdData.length - 1];
    const previousMACD = macdData[macdData.length - 2];
    const macd = latestMACD?.MACD || 0;
    const macdSignal = latestMACD?.signal || 0;
    const histogram = latestMACD?.histogram || 0;

    // Enhanced calculations
    const avgVolume20 = volumes.slice(-20).reduce((sum, vol) => sum + vol, 0) / Math.min(20, volumes.length);
    const priceVsEma50Percent = ((currentClose - ema50) / ema50) * 100;
    const rsiMomentum = rsi14 > rsi14Previous;
    const macdAcceleration = histogram > (previousMACD?.histogram || 0);

    return {
      close: currentClose,
      ema50: Math.round(ema50 * 100) / 100,
      rsi14: Math.round(rsi14 * 100) / 100,
      rsiSma14: Math.round(rsiSma14 * 100) / 100,
      macd: Math.round(macd * 100) / 100,
      macdSignal: Math.round(macdSignal * 100) / 100,
      histogram: Math.round(histogram * 100) / 100,
      ema20: Math.round(ema20 * 100) / 100,
      volume: currentVolume,
      avgVolume20: Math.round(avgVolume20),
      priceVsEma50Percent: Math.round(priceVsEma50Percent * 100) / 100,
      rsiMomentum,
      macdAcceleration
    };
  }

  /**
   * Calculate histogram count
   */
  private calculateHistogramCount(candles: Array<{close: number}>): number {
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
      const dataPoint = macdData[i];
      if (dataPoint && dataPoint.histogram !== undefined && dataPoint.histogram > 0) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    return consecutiveCount;
  }

  /**
   * Evaluate enhanced entry conditions
   */
  private evaluateEnhancedConditions(
    indicators: EnhancedTechnicalIndicators,
    histogramCount: number,
    resistanceCheck: {passed: boolean, reason: string, distancePercent: number | null, nearestResistance: number | null}
  ): EnhancedEntryConditions {
    // Original conditions
    const aboveEMA = indicators.close > indicators.ema50;
    const rsiInRange = indicators.rsi14 > 50 && indicators.rsi14 <= 70;
    const rsiAboveSMA = indicators.rsi14 >= indicators.rsiSma14;
    const macdBullish = indicators.macd > indicators.macdSignal;
    const histogramOk = histogramCount <= 3;
    const resistanceOk = resistanceCheck.passed;

    // Enhanced conditions
    const strongTrend = indicators.priceVsEma50Percent >= 2.0; // At least 2% above EMA50
    const volumeConfirmation = indicators.volume > indicators.avgVolume20 * 1.2; // 20% above average volume
    const rsiMomentumUp = indicators.rsiMomentum; // RSI rising
    const acceleratingMACD = indicators.macdAcceleration; // MACD histogram accelerating
    const aboveEMA20 = indicators.close > indicators.ema20; // Above short-term trend

    return {
      aboveEMA,
      rsiInRange,
      rsiAboveSMA,
      macdBullish,
      histogramOk,
      resistanceOk,
      strongTrend,
      volumeConfirmation,
      rsiMomentumUp,
      acceleratingMACD,
      aboveEMA20,
      marketConditionOk: true // Will be set later
    };
  }

  /**
   * Assess overall market condition
   */
  private async assessMarketCondition(): Promise<{ isHealthy: boolean; reason: string }> {
    // For now, return healthy - in production, this could check Nifty index, VIX, etc.
    return {
      isHealthy: true,
      reason: 'Market condition check passed'
    };
  }

  /**
   * Generate enhanced signal with risk assessment
   */
  private generateEnhancedSignal(
    conditions: EnhancedEntryConditions,
    indicators: EnhancedTechnicalIndicators,
    histogramCount: number,
    resistanceCheck: {passed: boolean, reason: string, distancePercent: number | null, nearestResistance: number | null}
  ): {
    signal: 'ENTRY' | 'NO_ENTRY' | 'WATCHLIST';
    confidence: number;
    winProbability: number;
    riskRewardRatio: number;
    reasoning: string;
    riskAssessment: {
      level: 'LOW' | 'MEDIUM' | 'HIGH';
      stop_loss: number;
      target1: number;
      target2: number;
      position_size_percent: number;
    };
    nextReview: string;
  } {
    // Count passed conditions
    const originalConditions = [
      conditions.aboveEMA,
      conditions.rsiInRange,
      conditions.rsiAboveSMA,
      conditions.macdBullish,
      conditions.histogramOk,
      conditions.resistanceOk
    ];

    const enhancedConditions = [
      conditions.strongTrend,
      conditions.volumeConfirmation,
      conditions.rsiMomentumUp,
      conditions.acceleratingMACD,
      conditions.aboveEMA20,
      conditions.marketConditionOk
    ];

    const originalPassed = originalConditions.filter(c => c).length;
    const enhancedPassed = enhancedConditions.filter(c => c).length;

    // Calculate confidence (0-100)
    const confidence = (originalPassed / 6) * 60 + (enhancedPassed / 6) * 40;

    // Calculate win probability based on conditions met
    let winProbability = 30; // Base probability
    if (originalPassed === 6) winProbability += 40; // All original conditions
    if (enhancedPassed >= 4) winProbability += 20;  // Most enhanced conditions
    if (conditions.volumeConfirmation) winProbability += 10; // Volume confirmation

    // Calculate risk-reward ratio
    const stopLossPercent = 2.5;
    const targetPercent = resistanceCheck.distancePercent ? 
      Math.min(resistanceCheck.distancePercent * 0.8, 6.0) : 5.0;
    const riskRewardRatio = targetPercent / stopLossPercent;

    // Risk assessment
    const stopLoss = indicators.close * (1 - stopLossPercent / 100);
    const target1 = indicators.close * (1 + targetPercent / 100);
    const target2 = indicators.close * (1 + targetPercent * 1.5 / 100);
    
    let positionSizePercent = 2.0; // Base 2% position
    if (winProbability > 70) positionSizePercent = 3.0;
    if (winProbability > 80) positionSizePercent = 4.0;

    const riskLevel = winProbability > 70 ? 'LOW' : winProbability > 50 ? 'MEDIUM' : 'HIGH';

    // Generate reasoning
    const reasons: string[] = [];
    const failures: string[] = [];

    if (conditions.aboveEMA) reasons.push('Above EMA50');
    else failures.push('Below EMA50');

    if (conditions.rsiInRange) reasons.push('RSI healthy');
    else failures.push('RSI out of range');

    if (conditions.rsiAboveSMA) reasons.push('RSI rising');
    else failures.push('RSI declining');

    if (conditions.macdBullish) reasons.push('MACD bullish');
    else failures.push('MACD bearish');

    if (conditions.histogramOk) reasons.push('Early momentum');
    else failures.push('Late momentum');

    if (conditions.resistanceOk) reasons.push('Clear resistance');
    else failures.push('Near resistance');

    // Enhanced condition feedback
    if (conditions.strongTrend) reasons.push('Strong trend');
    if (conditions.volumeConfirmation) reasons.push('Volume confirmation');
    if (conditions.rsiMomentumUp) reasons.push('RSI accelerating');
    if (conditions.acceleratingMACD) reasons.push('MACD accelerating');

    // Determine signal type
    let signal: 'ENTRY' | 'NO_ENTRY' | 'WATCHLIST' = 'NO_ENTRY';
    
    if (originalPassed === 6 && enhancedPassed >= 3) {
      signal = 'ENTRY';
    } else if (originalPassed >= 4 && enhancedPassed >= 2) {
      signal = 'WATCHLIST';
    }

    const reasoning = signal === 'ENTRY' 
      ? `🎯 ENTRY SIGNAL: ${reasons.join(', ')}`
      : signal === 'WATCHLIST'
      ? `👀 WATCHLIST: ${reasons.join(', ')}. Missing: ${failures.join(', ')}`
      : `❌ NO ENTRY: ${failures.join(', ')}`;

    return {
      signal,
      confidence: Math.round(confidence),
      winProbability: Math.round(winProbability),
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      reasoning,
      riskAssessment: {
        level: riskLevel,
        stop_loss: Math.round(stopLoss * 100) / 100,
        target1: Math.round(target1 * 100) / 100,
        target2: Math.round(target2 * 100) / 100,
        position_size_percent: positionSizePercent
      },
      nextReview: 'Next trading day'
    };
  }

  /**
   * Batch process multiple symbols with enhanced reliability
   */
  async batchAnalyzeWithReliability(symbols: string[], exchange: ExchangeCode = 'NSE'): Promise<{
    results: EnhancedEntrySignalResult[];
    performance: {
      total: number;
      successful: number;
      failed: number;
      entries: number;
      watchlist: number;
      noEntries: number;
      avgConfidence: number;
      processingTime: number;
    };
  }> {
    const startTime = Date.now();
    const results: EnhancedEntrySignalResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process in small batches with delays
    const batchSize = 3;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}: ${batch.join(', ')}`);

      for (const symbol of batch) {
        try {
          console.log(`🔍 Analyzing ${symbol}...`);
          const result = await this.analyzeEnhancedEntrySignal(symbol, exchange);
          
          // Log the result
          console.log(`📊 ${symbol}: ${result.signal} (${result.confidence}% confidence, ${result.win_probability}% win prob)`);
          if (result.signal === 'ENTRY') {
            console.log(`🎉 ENTRY FOUND: ${symbol} - ${result.reasoning}`);
          } else if (result.signal === 'WATCHLIST') {
            console.log(`👀 WATCHLIST: ${symbol} - ${result.reasoning.substring(0, 100)}...`);
          }
          
          results.push(result);
          successful++;
        } catch (error) {
          console.error(`❌ Failed to analyze ${symbol}:`, error instanceof Error ? error.message : 'Unknown error');
          failed++;
        }
        
        // Small delay between individual stocks
        await this.delay(500);
      }
      
      // Delay between batches
      if (i + batchSize < symbols.length) {
        await this.delay(2000);
      }
    }

    const entries = results.filter(r => r.signal === 'ENTRY').length;
    const watchlist = results.filter(r => r.signal === 'WATCHLIST').length;
    const noEntries = results.filter(r => r.signal === 'NO_ENTRY').length;
    const avgConfidence = results.length > 0 
      ? Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length)
      : 0;

    return {
      results,
      performance: {
        total: symbols.length,
        successful,
        failed,
        entries,
        watchlist,
        noEntries,
        avgConfidence,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EnhancedEntrySignalService;
