import { NextRequest, NextResponse } from 'next/server';
import Nifty100ScannerService from '@/services/nifty100ScannerService';
import { ExchangeCode } from '@/types/chart';
import { STOCK_CATEGORIES } from '@/constants/symbols';

interface ScanRequest {
  exchange?: ExchangeCode;
  filters?: {
    minConfidence?: number;
    maxHistogramBars?: number;
    minResistanceDistance?: number;
    sectors?: string[];
    signalType?: 'ENTRY' | 'NO_ENTRY' | 'ALL';
    sortBy?: 'confidence' | 'symbol' | 'price' | 'resistance_distance';
    limit?: number;
  };
}

interface WatchlistRequest {
  exchange?: ExchangeCode;
  criteria: {
    minConfidence?: number;
    requireAllConditions?: boolean;
    maxHistogramBars?: number;
    minResistanceDistance?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ScanRequest | WatchlistRequest = await request.json();

    // Check if this is a watchlist request
    if ('criteria' in body) {
      return handleWatchlistRequest(body as WatchlistRequest);
    }

    // Full Nifty 100 scan
    const scanBody = body as ScanRequest;
    const exchange = scanBody.exchange || 'NSE';

    console.log('🚀 Starting Nifty 100 scan...');
    
    const scanner = new Nifty100ScannerService();
    const scanResults = await scanner.scanNifty100(scanBody.filters, exchange);
    
    console.log(`✅ Scan completed: ${scanResults.summary.entry_signals} entries found`);

    return NextResponse.json({
      success: true,
      scan_summary: scanResults.summary,
      results: scanResults.results,
      performance: {
        total_scanned: scanResults.summary.total_stocks,
        successful: scanResults.summary.successful_scans,
        failed: scanResults.summary.failed_scans,
        scan_time: scanResults.summary.scan_time
      }
    });

  } catch (error) {
    console.error('Nifty Scanner API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

async function handleWatchlistRequest(body: WatchlistRequest) {
  const exchange = body.exchange || 'NSE';
  const scanner = new Nifty100ScannerService();
  
  console.log('📋 Generating watchlist...');
  const watchlist = await scanner.getWatchlist(body.criteria, exchange);
  
  return NextResponse.json({
    success: true,
    watchlist,
    criteria: body.criteria,
    count: watchlist.length,
    timestamp: new Date().toISOString()
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'quick-scan':
        const quickScanner = new Nifty100ScannerService();
        const quickResults = await quickScanner.quickScan('NSE');
        
        return NextResponse.json({
          success: true,
          quick_scan: {
            entries: quickResults.entries,
            entry_count: quickResults.entries.length,
            no_entries: quickResults.noEntries,
            errors: quickResults.errors.length,
            scan_time: quickResults.scanTime
          }
        });

      case 'sector':
        const sectorName = searchParams.get('name') as keyof typeof STOCK_CATEGORIES;
        
        if (!sectorName || !STOCK_CATEGORIES[sectorName]) {
          return NextResponse.json(
            { success: false, error: 'Valid sector name required. Available: ' + Object.keys(STOCK_CATEGORIES).join(', ') },
            { status: 400 }
          );
        }

        const sectorScanner = new Nifty100ScannerService();
        const sectorResults = await sectorScanner.scanSector(sectorName, 'NSE');
        
        return NextResponse.json({
          success: true,
          sector_analysis: sectorResults
        });

      case 'status':
        const now = new Date();
        const marketOpen = new Date(now);
        marketOpen.setHours(9, 15, 0, 0);
        const marketClose = new Date(now);
        marketClose.setHours(15, 30, 0, 0);
        
        const isMarketHours = now >= marketOpen && now <= marketClose && now.getDay() !== 0 && now.getDay() !== 6;
        
        return NextResponse.json({
          success: true,
          scanner_status: {
            available: true,
            market_hours: isMarketHours,
            current_time: now.toISOString(),
            next_scan_recommended: isMarketHours ? 'Real-time' : 'Next trading day',
            estimated_scan_time: '3-5 minutes for full Nifty 100'
          }
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Nifty 100 Scanner API',
          description: 'Comprehensive scanning of all Nifty 100 stocks for Algo-MTF entry opportunities',
          endpoints: {
            'POST /api/nifty-scanner': 'Full Nifty 100 scan with optional filters',
            'POST /api/nifty-scanner (with criteria)': 'Generate watchlist with specific criteria',
            'GET /api/nifty-scanner?action=quick-scan': 'Quick scan (entry counts only)',
            'GET /api/nifty-scanner?action=sector&name=BANKING': 'Scan specific sector',
            'GET /api/nifty-scanner?action=status': 'Check scanner availability'
          },
          features: [
            'Complete Nifty 100 analysis (all 100 stocks)',
            'Batch processing with rate limiting',
            'Sector-wise breakdown',
            'Failure pattern analysis',
            'Top opportunities ranking',
            'Watchlist generation',
            'Market condition assessment'
          ],
          filters: {
            minConfidence: 'Minimum confidence percentage (0-100)',
            maxHistogramBars: 'Maximum histogram bars for early entry',
            minResistanceDistance: 'Minimum distance from resistance (%)',
            signalType: 'Filter by ENTRY, NO_ENTRY, or ALL',
            sortBy: 'Sort by confidence, symbol, price, or resistance_distance',
            limit: 'Maximum number of results to return'
          },
          sectors: Object.keys(STOCK_CATEGORIES),
          usage: {
            fullScan: {
              exchange: 'NSE',
              filters: {
                minConfidence: 70,
                signalType: 'ENTRY',
                sortBy: 'confidence',
                limit: 10
              }
            },
            watchlist: {
              criteria: {
                minConfidence: 60,
                requireAllConditions: false,
                maxHistogramBars: 5,
                minResistanceDistance: 2.0
              }
            }
          }
        });
    }
  } catch (error) {
    console.error('Nifty Scanner GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
