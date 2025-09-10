import { NextRequest, NextResponse } from 'next/server';
import BulletproofScannerService from '@/services/bulletproofScannerService';
import { ExchangeCode } from '@/types/chart';

export async function POST(request: NextRequest) {
  try {
    const body: { exchange?: ExchangeCode } = await request.json();
    const exchange = body.exchange || 'NSE';

    console.log('🚀 Starting Bulletproof Nifty 100+ Scan...');
    
    const scanner = new BulletproofScannerService();
    const scanResults = await scanner.bulletproofScanAll(exchange);
    
    console.log('✅ Bulletproof scan completed successfully!');

    // Extract entry signals for easy access
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');
    const watchlistSignals = scanResults.results.filter(r => r.signal === 'WATCHLIST');
    const erroredStocks = scanResults.results.filter(r => r.status === 'FAILED');

    return NextResponse.json({
      success: true,
      scan_summary: scanResults.summary,
      entry_signals: entrySignals,
      watchlist_signals: watchlistSignals.slice(0, 10), // Top 10 watchlist
      failed_stocks: erroredStocks.map(r => ({ symbol: r.symbol, error: r.error_details })),
      processing_log: scanResults.processing_log.slice(-50), // Last 50 log entries
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Bulletproof Scanner API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'status':
        return NextResponse.json({
          success: true,
          bulletproof_features: [
            '🔄 5 retry attempts per stock with exponential backoff',
            '🛡️ Graceful degradation (partial success without S/R data)',
            '📊 Safe indicator calculations with fallbacks',
            '⏰ Progressive delays to prevent API overload',
            '📝 Comprehensive logging for every stock',
            '✅ Guaranteed processing of all 110 stocks',
            '🎯 Detailed error reporting and recovery'
          ],
          reliability_guarantees: [
            'Every stock will be processed (success, partial, or logged failure)',
            'No silent failures or missing stocks',
            'Detailed error messages for debugging',
            'Processing time tracking per stock',
            'Retry count reporting',
            'Fallback calculations for missing data'
          ]
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Bulletproof Nifty 100+ Scanner API',
          description: 'Foolproof scanning with guaranteed processing of all stocks and comprehensive error handling',
          features: [
            '🛡️ Maximum reliability with 5-retry logic',
            '📊 Processes all 110 stocks guaranteed',
            '📝 Stock-by-stock detailed logging',
            '⚡ Graceful degradation on partial failures',
            '🎯 Comprehensive error reporting',
            '⏰ Processing time tracking',
            '🔍 Real-time progress updates'
          ],
          usage: {
            endpoint: 'POST /api/bulletproof-scanner',
            body: { exchange: 'NSE' },
            response: {
              scan_summary: 'Overall statistics',
              entry_signals: 'All confirmed entry opportunities',
              watchlist_signals: 'Top 10 near-entry stocks',
              failed_stocks: 'Stocks that could not be processed',
              processing_log: 'Last 50 log entries for debugging'
            }
          }
        });
    }
  } catch (error) {
    console.error('Bulletproof Scanner GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
