import EntrySignalService from './entrySignalService';
import SupportResistanceService from './supportResistanceService';
import { ExchangeCode } from '@/types/chart';
import { ALL_SYMBOLS, NIFTY_100_SYMBOLS, STOCK_CATEGORIES } from '@/constants/symbols';

export interface ScanResult {
  symbol: string;
  signal: 'ENTRY' | 'NO_ENTRY' | 'ERROR';
  confidence: number;
  reasoning: string;
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
  resistance_distance?: number;
  histogram_count?: number;
  error?: string;
}

export interface Nifty100ScanSummary {
  scan_date: string;
  scan_time: string;
  total_stocks: number;
  successful_scans: number;
  failed_scans: number;
  entry_signals: number;
  no_entry_signals: number;
  market_condition: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
  avg_confidence: number;
  top_opportunities: Array<{
    symbol: string;
    confidence: number;
    reasoning: string;
    current_price: number;
    resistance_distance: number;
  }>;
  sector_breakdown: Record<string, {
    total: number;
    entries: number;
    avg_confidence: number;
  }>;
  failure_analysis: Record<string, number>;
  recommendations: string[];
}

export interface ScanFilters {
  minConfidence?: number;
  maxHistogramBars?: number;
  minResistanceDistance?: number;
  sectors?: string[];
  signalType?: 'ENTRY' | 'NO_ENTRY' | 'ALL';
  sortBy?: 'confidence' | 'symbol' | 'price' | 'resistance_distance';
  limit?: number;
}

/**
 * Nifty 100 Scanner Service for comprehensive market analysis
 * Efficiently scans all 100 stocks for entry opportunities
 */
class Nifty100ScannerService {
  private entryService: EntrySignalService;
  private srService: SupportResistanceService;

  constructor() {
    this.entryService = new EntrySignalService();
    this.srService = new SupportResistanceService();
  }

  /**
   * Scan all Nifty 100 stocks for entry opportunities
   */
  async scanNifty100(filters?: ScanFilters, exchange: ExchangeCode = 'NSE'): Promise<{
    results: ScanResult[];
    summary: Nifty100ScanSummary;
  }> {
    console.log('🚀 Starting Nifty 100 scan...');
    const startTime = Date.now();
    
    const results: ScanResult[] = [];
    // let successCount = 0;
    // let failCount = 0;

    // Process stocks in batches to avoid overwhelming the API
    const batchSize = 5;
    const batches = this.createBatches(ALL_SYMBOLS, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📊 Processing batch ${i + 1}/${batches.length}: ${batch.join(', ')}`);

      // Process batch with delay to avoid rate limits
      const batchResults = await this.processBatch(batch, exchange);
      results.push(...batchResults);

      // Update counts (for potential logging)
      // successCount += batchResults.filter(r => r.signal !== 'ERROR').length;
      // failCount += batchResults.filter(r => r.signal === 'ERROR').length;

      // Small delay between batches
      if (i < batches.length - 1) {
        await this.delay(1000); // 1 second delay
      }
    }

    console.log(`✅ Scan completed in ${(Date.now() - startTime) / 1000}s`);

    // Apply filters if provided
    const filteredResults = this.applyFilters(results, filters);

    // Generate comprehensive summary
    const summary = this.generateSummary(results);

    return {
      results: filteredResults,
      summary
    };
  }

  /**
   * Process a batch of symbols
   */
  private async processBatch(symbols: string[], exchange: ExchangeCode): Promise<ScanResult[]> {
    const batchResults: ScanResult[] = [];

    for (const symbol of symbols) {
      try {
        const entrySignal = await this.entryService.analyzeEntrySignal(symbol, exchange);
        
        batchResults.push({
          symbol: entrySignal.symbol,
          signal: entrySignal.signal,
          confidence: entrySignal.confidence,
          reasoning: entrySignal.reasoning,
          conditions: entrySignal.conditions,
          indicators: entrySignal.indicators,
          resistance_distance: entrySignal.resistance_check.distancePercent ?? undefined,
          histogram_count: entrySignal.histogram_count
        });

      } catch (error) {
        console.error(`❌ Failed to scan ${symbol}:`, error instanceof Error ? error.message : 'Unknown error');
        batchResults.push({
          symbol,
          signal: 'ERROR',
          confidence: 0,
          reasoning: 'Analysis failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return batchResults;
  }

  /**
   * Create batches from symbol array
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Apply filters to scan results
   */
  private applyFilters(results: ScanResult[], filters?: ScanFilters): ScanResult[] {
    if (!filters) return results;

    let filtered = [...results];

    if (filters.minConfidence) {
      filtered = filtered.filter(r => r.confidence >= filters.minConfidence!);
    }

    if (filters.maxHistogramBars) {
      filtered = filtered.filter(r => (r.histogram_count || 0) <= filters.maxHistogramBars!);
    }

    if (filters.minResistanceDistance) {
      filtered = filtered.filter(r => (r.resistance_distance || 0) >= filters.minResistanceDistance!);
    }

    if (filters.signalType && filters.signalType !== 'ALL') {
      filtered = filtered.filter(r => r.signal === filters.signalType);
    }

    // Sort results
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'confidence':
          filtered.sort((a, b) => b.confidence - a.confidence);
          break;
        case 'symbol':
          filtered.sort((a, b) => a.symbol.localeCompare(b.symbol));
          break;
        case 'price':
          filtered.sort((a, b) => (b.indicators?.close || 0) - (a.indicators?.close || 0));
          break;
        case 'resistance_distance':
          filtered.sort((a, b) => (b.resistance_distance || 0) - (a.resistance_distance || 0));
          break;
      }
    }

    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(results: ScanResult[]): Nifty100ScanSummary {
    const successful = results.filter(r => r.signal !== 'ERROR');
    const entries = results.filter(r => r.signal === 'ENTRY');
    const noEntries = results.filter(r => r.signal === 'NO_ENTRY');
    const failed = results.filter(r => r.signal === 'ERROR');

    // Calculate average confidence
    const avgConfidence = successful.length > 0 
      ? Math.round(successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length)
      : 0;

    // Determine market condition
    let marketCondition: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED' = 'NEUTRAL';
    const entryPercentage = (entries.length / successful.length) * 100;
    
    if (entryPercentage > 30) marketCondition = 'BULLISH';
    else if (entryPercentage < 10) marketCondition = 'BEARISH';
    else if (avgConfidence > 60) marketCondition = 'MIXED';

    // Top opportunities (highest confidence entry signals)
    const topOpportunities = entries
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(r => ({
        symbol: r.symbol,
        confidence: r.confidence,
        reasoning: r.reasoning,
        current_price: r.indicators?.close || 0,
        resistance_distance: r.resistance_distance || 0
      }));

    // Sector breakdown
    const sectorBreakdown: Record<string, { total: number; entries: number; avg_confidence: number }> = {};
    
    Object.entries(STOCK_CATEGORIES).forEach(([sector, symbols]) => {
      const symbolsList = symbols as readonly string[];
      const sectorResults = results.filter(r => symbolsList.includes(r.symbol) && r.signal !== 'ERROR');
      const sectorEntries = sectorResults.filter(r => r.signal === 'ENTRY');
      const sectorAvgConf = sectorResults.length > 0
        ? Math.round(sectorResults.reduce((sum, r) => sum + r.confidence, 0) / sectorResults.length)
        : 0;

      if (sectorResults.length > 0) {
        sectorBreakdown[sector.toLowerCase()] = {
          total: sectorResults.length,
          entries: sectorEntries.length,
          avg_confidence: sectorAvgConf
        };
      }
    });

    // Failure analysis
    const failureReasons: Record<string, number> = {};
    noEntries.forEach(result => {
      if (result.conditions) {
        if (!result.conditions.aboveEMA) failureReasons['Below EMA50'] = (failureReasons['Below EMA50'] || 0) + 1;
        if (!result.conditions.rsiInRange) failureReasons['RSI Out of Range'] = (failureReasons['RSI Out of Range'] || 0) + 1;
        if (!result.conditions.rsiAboveSMA) failureReasons['RSI Below SMA'] = (failureReasons['RSI Below SMA'] || 0) + 1;
        if (!result.conditions.macdBullish) failureReasons['MACD Bearish'] = (failureReasons['MACD Bearish'] || 0) + 1;
        if (!result.conditions.histogramOk) failureReasons['Late Momentum'] = (failureReasons['Late Momentum'] || 0) + 1;
        if (!result.conditions.resistanceOk) failureReasons['Near Resistance'] = (failureReasons['Near Resistance'] || 0) + 1;
      }
    });

    // Generate recommendations
    const recommendations: string[] = [];
    if (entries.length === 0) {
      recommendations.push('🚨 NO ENTRY OPPORTUNITIES - Wait for better market conditions');
      recommendations.push('📊 Monitor for stocks breaking above EMA50 with healthy RSI');
      recommendations.push('⏰ Check again tomorrow or after market improves');
    } else if (entries.length < 5) {
      recommendations.push('⚠️ LIMITED OPPORTUNITIES - Be selective');
      recommendations.push('🎯 Focus on highest confidence signals only');
    } else {
      recommendations.push('🎉 MULTIPLE OPPORTUNITIES - Good market conditions');
      recommendations.push('💰 Consider position sizing across top signals');
    }

    const now = new Date();
    return {
      scan_date: now.toISOString().split('T')[0],
      scan_time: now.toISOString(),
      total_stocks: results.length,
      successful_scans: successful.length,
      failed_scans: failed.length,
      entry_signals: entries.length,
      no_entry_signals: noEntries.length,
      market_condition: marketCondition,
      avg_confidence: avgConfidence,
      top_opportunities: topOpportunities,
      sector_breakdown: sectorBreakdown,
      failure_analysis: failureReasons,
      recommendations
    };
  }

  /**
   * Quick scan with just entry/no-entry counts
   */
  async quickScan(exchange: ExchangeCode = 'NSE'): Promise<{
    entries: string[];
    noEntries: number;
    errors: string[];
    scanTime: string;
  }> {
    const results: { symbol: string; signal: string; error?: string }[] = [];
    
    // Process in smaller batches for quick scan
    const batchSize = 3;
    const batches = this.createBatches(NIFTY_100_SYMBOLS, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(async (symbol) => {
        try {
          const signal = await this.entryService.analyzeEntrySignal(symbol, exchange);
          return { symbol, signal: signal.signal };
        } catch (error) {
          return { symbol, signal: 'ERROR', error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ symbol: 'UNKNOWN', signal: 'ERROR', error: result.reason });
        }
      });
    }

    const entries = results.filter(r => r.signal === 'ENTRY').map(r => r.symbol);
    const noEntries = results.filter(r => r.signal === 'NO_ENTRY').length;
    const errors = results.filter(r => r.signal === 'ERROR').map(r => r.symbol);

    return {
      entries,
      noEntries,
      errors,
      scanTime: new Date().toISOString()
    };
  }

  /**
   * Scan specific sector
   */
  async scanSector(sectorName: keyof typeof STOCK_CATEGORIES, exchange: ExchangeCode = 'NSE'): Promise<{
    sector: string;
    results: ScanResult[];
    summary: {
      total: number;
      entries: number;
      noEntries: number;
      avgConfidence: number;
      topPicks: ScanResult[];
    };
  }> {
    const sectorSymbols = STOCK_CATEGORIES[sectorName];
    const results: ScanResult[] = [];

    for (const symbol of sectorSymbols) {
      try {
        const entrySignal = await this.entryService.analyzeEntrySignal(symbol, exchange);
        
        results.push({
          symbol: entrySignal.symbol,
          signal: entrySignal.signal,
          confidence: entrySignal.confidence,
          reasoning: entrySignal.reasoning,
          conditions: entrySignal.conditions,
          indicators: entrySignal.indicators,
          resistance_distance: entrySignal.resistance_check.distancePercent ?? undefined,
          histogram_count: entrySignal.histogram_count
        });

      } catch (error) {
        results.push({
          symbol,
          signal: 'ERROR',
          confidence: 0,
          reasoning: 'Analysis failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successful = results.filter(r => r.signal !== 'ERROR');
    const entries = results.filter(r => r.signal === 'ENTRY');
    const avgConfidence = successful.length > 0 
      ? Math.round(successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length)
      : 0;

    const topPicks = entries
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    return {
      sector: sectorName,
      results,
      summary: {
        total: results.length,
        entries: entries.length,
        noEntries: results.filter(r => r.signal === 'NO_ENTRY').length,
        avgConfidence,
        topPicks
      }
    };
  }

  /**
   * Get watchlist of stocks meeting specific criteria
   */
  async getWatchlist(criteria: {
    minConfidence?: number;
    requireAllConditions?: boolean;
    maxHistogramBars?: number;
    minResistanceDistance?: number;
  }, exchange: ExchangeCode = 'NSE'): Promise<ScanResult[]> {
    const scanResults = await this.scanNifty100(undefined, exchange);
    
    return scanResults.results.filter(result => {
      if (result.signal === 'ERROR') return false;
      
      // Apply criteria
      if (criteria.minConfidence && result.confidence < criteria.minConfidence) return false;
      if (criteria.maxHistogramBars && (result.histogram_count || 0) > criteria.maxHistogramBars) return false;
      if (criteria.minResistanceDistance && (result.resistance_distance || 0) < criteria.minResistanceDistance) return false;
      
      if (criteria.requireAllConditions && result.conditions) {
        // All technical conditions must be true except resistance (which we check separately)
        const technicalConditions = [
          result.conditions.aboveEMA,
          result.conditions.rsiInRange,
          result.conditions.rsiAboveSMA,
          result.conditions.macdBullish,
          result.conditions.histogramOk
        ];
        
        if (!technicalConditions.every(condition => condition === true)) return false;
      }
      
      return true;
    });
  }

  /**
   * Utility: Add delay between API calls
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default Nifty100ScannerService;
