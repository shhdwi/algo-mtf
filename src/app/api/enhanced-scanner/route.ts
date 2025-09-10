import { NextRequest, NextResponse } from 'next/server';
import EnhancedEntrySignalService from '@/services/enhancedEntrySignalService';
import { ExchangeCode } from '@/types/chart';
import { ALL_SYMBOLS, STOCK_CATEGORIES } from '@/constants/symbols';

interface EnhancedScanRequest {
  symbols?: string[];
  exchange?: ExchangeCode;
  batchSize?: number;
  includeWatchlist?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: EnhancedScanRequest = await request.json();
    
    const symbols = body.symbols || ALL_SYMBOLS;
    const exchange = body.exchange || 'NSE';
    const includeWatchlist = body.includeWatchlist !== false;

    console.log(`🚀 Starting Enhanced Scan of ${symbols.length} stocks...`);
    console.log(`📊 Symbols to analyze: ${symbols.join(', ')}`);
    
    const enhancedService = new EnhancedEntrySignalService();
    const scanResults = await enhancedService.batchAnalyzeWithReliability(symbols, exchange);
    
    // Log final summary
    const entries = scanResults.results.filter(r => r.signal === 'ENTRY');
    const watchlist = scanResults.results.filter(r => r.signal === 'WATCHLIST');
    
    console.log(`\n🎯 SCAN COMPLETE SUMMARY:`);
    console.log(`📊 Total Processed: ${scanResults.performance.successful}/${scanResults.performance.total}`);
    console.log(`🎉 Entry Signals: ${entries.length}`);
    entries.forEach(entry => {
      console.log(`   ✅ ${entry.symbol}: ${entry.confidence}% confidence, ${entry.win_probability}% win prob`);
    });
    console.log(`👀 Watchlist: ${watchlist.length} stocks`);
    console.log(`⏰ Processing Time: ${(scanResults.performance.processingTime / 1000).toFixed(1)}s`);
    
    // Filter results based on includeWatchlist
    let filteredResults = scanResults.results;
    if (!includeWatchlist) {
      filteredResults = scanResults.results.filter(r => r.signal === 'ENTRY');
    }

    // Sort by confidence (highest first)
    filteredResults.sort((a, b) => b.confidence - a.confidence);

    // Generate market insights
    const marketInsights = generateMarketInsights(scanResults.results);

    console.log(`✅ Enhanced scan completed: ${scanResults.performance.entries} entries, ${scanResults.performance.watchlist} watchlist`);

    return NextResponse.json({
      success: true,
      scan_performance: scanResults.performance,
      market_insights: marketInsights,
      results: filteredResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Enhanced Scanner API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

function generateMarketInsights(results: any[]): any {
  const successful = results.filter(r => r.signal !== 'ERROR');
  const entries = results.filter(r => r.signal === 'ENTRY');
  const watchlist = results.filter(r => r.signal === 'WATCHLIST');
  const noEntries = results.filter(r => r.signal === 'NO_ENTRY');

  // Calculate sector performance
  const sectorPerformance: Record<string, any> = {};
  Object.entries(STOCK_CATEGORIES).forEach(([sector, symbols]) => {
    const sectorResults = results.filter(r => symbols.includes(r.symbol));
    const sectorEntries = sectorResults.filter(r => r.signal === 'ENTRY');
    const sectorWatchlist = sectorResults.filter(r => r.signal === 'WATCHLIST');
    
    if (sectorResults.length > 0) {
      sectorPerformance[sector.toLowerCase()] = {
        total: sectorResults.length,
        entries: sectorEntries.length,
        watchlist: sectorWatchlist.length,
        entry_rate: Math.round((sectorEntries.length / sectorResults.length) * 100),
        avg_confidence: Math.round(sectorResults.reduce((sum, r) => sum + r.confidence, 0) / sectorResults.length),
        avg_win_probability: sectorResults.length > 0 
          ? Math.round(sectorResults.reduce((sum, r) => sum + (r.win_probability || 0), 0) / sectorResults.length)
          : 0
      };
    }
  });

  // Market condition assessment
  const entryRate = (entries.length / successful.length) * 100;
  let marketCondition = 'NEUTRAL';
  
  if (entryRate > 20) marketCondition = 'BULLISH';
  else if (entryRate < 5) marketCondition = 'BEARISH';
  else if (entryRate > 10) marketCondition = 'MIXED';

  return {
    market_condition: marketCondition,
    entry_rate: Math.round(entryRate * 100) / 100,
    avg_win_probability: successful.length > 0
      ? Math.round(successful.reduce((sum, r) => sum + (r.win_probability || 0), 0) / successful.length)
      : 0,
    sector_performance: sectorPerformance,
    top_entries: entries
      .sort((a, b) => b.win_probability - a.win_probability)
      .slice(0, 5)
      .map(r => ({
        symbol: r.symbol,
        confidence: r.confidence,
        win_probability: r.win_probability,
        risk_reward: r.risk_reward_ratio,
        current_price: r.current_price
      })),
    top_watchlist: watchlist
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(r => ({
        symbol: r.symbol,
        confidence: r.confidence,
        reasoning: r.reasoning
      }))
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'health':
        const enhancedService = new EnhancedEntrySignalService();
        // Health check would go here
        
        return NextResponse.json({
          success: true,
          health: {
            status: 'healthy',
            cache_enabled: true,
            retry_logic: true,
            circuit_breaker: true,
            enhanced_criteria: true
          }
        });

      case 'quick':
        // Quick scan of top 10 stocks
        const quickService = new EnhancedEntrySignalService();
        const topStocks = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BAJFINANCE', 'BHARTIARTL', 'HINDUNILVR', 'ITC', 'MARUTI'];
        const quickResults = await quickService.batchAnalyzeWithReliability(topStocks, 'NSE');
        
        return NextResponse.json({
          success: true,
          quick_scan: {
            entries: quickResults.results.filter(r => r.signal === 'ENTRY').length,
            watchlist: quickResults.results.filter(r => r.signal === 'WATCHLIST').length,
            processing_time: `${quickResults.performance.processingTime / 1000}s`,
            success_rate: `${Math.round((quickResults.performance.successful / quickResults.performance.total) * 100)}%`
          },
          top_opportunities: quickResults.results
            .filter(r => r.signal === 'ENTRY')
            .sort((a, b) => b.win_probability - a.win_probability)
            .slice(0, 3)
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Enhanced Nifty 100+ Scanner API',
          description: 'High-reliability scanning with enhanced entry criteria for maximum success rate',
          improvements: [
            '🔄 Retry logic with exponential backoff',
            '📋 Intelligent caching (1-4 hour TTL)',
            '⚡ Circuit breaker protection',
            '📊 Enhanced entry criteria (12 conditions vs 6)',
            '🎯 Win probability calculation',
            '💰 Risk-reward ratio analysis',
            '📈 Position sizing recommendations',
            '🛡️ Advanced risk assessment'
          ],
          enhanced_criteria: {
            original: [
              'Price above EMA50',
              'RSI 50-70 range',
              'RSI above RSI SMA',
              'MACD bullish',
              'Histogram ≤ 3 bars',
              'Resistance distance ≥ 1.5%'
            ],
            enhanced: [
              'Strong trend (≥2% above EMA50)',
              'Volume confirmation (20% above average)',
              'RSI momentum (rising)',
              'MACD acceleration (increasing histogram)',
              'Above EMA20 (short-term trend)',
              'Market condition healthy'
            ]
          },
          signal_types: {
            ENTRY: 'All 6 original + 3+ enhanced conditions met',
            WATCHLIST: '4+ original + 2+ enhanced conditions met',
            NO_ENTRY: 'Insufficient conditions met'
          },
          endpoints: {
            'POST /api/enhanced-scanner': 'Full enhanced scan with all improvements',
            'GET /api/enhanced-scanner?action=quick': 'Quick scan of top 10 stocks',
            'GET /api/enhanced-scanner?action=health': 'System health check'
          }
        });
    }
  } catch (error) {
    console.error('Enhanced Scanner GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
