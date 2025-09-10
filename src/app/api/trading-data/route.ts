import { NextRequest, NextResponse } from 'next/server';
import CombinedTradingService from '@/services/combinedTradingService';
import { ExchangeCode } from '@/types/chart';
import { ALL_SYMBOLS, STOCK_CATEGORIES } from '@/constants/symbols';

interface TradingDataRequest {
  symbol: string;
  exchange?: ExchangeCode;
}

interface MultipleTradingDataRequest {
  symbols: string[];
  exchange?: ExchangeCode;
  includeSignals?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: TradingDataRequest | MultipleTradingDataRequest = await request.json();

    // Check if this is a multiple symbols request
    if ('symbols' in body && Array.isArray(body.symbols)) {
      return handleMultipleSymbols(body as MultipleTradingDataRequest);
    }

    // Single symbol request
    const singleBody = body as TradingDataRequest;
    
    // Validate required fields
    if (!singleBody.symbol) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Symbol is required' 
        },
        { status: 400 }
      );
    }

    // Initialize service
    const tradingService = new CombinedTradingService();
    
    // Get combined trading data
    const tradingData = await tradingService.getCombinedTradingData(
      singleBody.symbol,
      singleBody.exchange || 'NSE'
    );

    // Get trading signals
    const signals = tradingService.getTradingSignals(tradingData);
    
    return NextResponse.json({
      success: true,
      data: tradingData,
      signals,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Trading Data API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

async function handleMultipleSymbols(body: MultipleTradingDataRequest) {
  // Validate symbols array
  if (!body.symbols || body.symbols.length === 0) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Symbols array is required and must not be empty' 
      },
      { status: 400 }
    );
  }

  // Limit number of symbols for performance
  if (body.symbols.length > 10) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Maximum 10 symbols allowed per request for combined trading data' 
      },
      { status: 400 }
    );
  }

  const exchange = body.exchange || 'NSE';
  const includeSignals = body.includeSignals !== false; // Default to true

  const tradingService = new CombinedTradingService();
  const results = await tradingService.getMultipleCombinedData(body.symbols, exchange);

  // Add signals if requested
  const resultsWithSignals = results.map(data => {
    const signals = includeSignals ? tradingService.getTradingSignals(data) : null;
    return {
      symbol: data.symbol,
      data,
      signals
    };
  });

  // Create summary
  const summary = {
    totalSymbols: body.symbols.length,
    successful: results.length,
    failed: body.symbols.length - results.length,
    marketStatus: results[0]?.combinedAnalysis.marketContext.tradingSession || 'unknown',
    recommendations: includeSignals ? {
      buy: resultsWithSignals.filter(r => r.signals?.recommendation === 'buy').length,
      sell: resultsWithSignals.filter(r => r.signals?.recommendation === 'sell').length,
      hold: resultsWithSignals.filter(r => r.signals?.recommendation === 'hold').length,
      wait: resultsWithSignals.filter(r => r.signals?.recommendation === 'wait').length
    } : null
  };

  return NextResponse.json({
    success: true,
    data: resultsWithSignals,
    summary,
    timestamp: new Date().toISOString()
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'market-status':
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const dayOfWeek = now.getDay();
        
        let status = 'closed';
        let nextAction = '';
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          status = 'weekend';
          nextAction = 'Market opens Monday 9:15 AM';
        } else if (currentHour < 9 || (currentHour === 9 && currentMinute < 15)) {
          status = 'pre-market';
          nextAction = 'Market opens at 9:15 AM';
        } else if (currentHour < 15 || (currentHour === 15 && currentMinute <= 30)) {
          status = 'market-hours';
          const closeTime = new Date(now);
          closeTime.setHours(15, 30, 0, 0);
          const timeLeft = closeTime.getTime() - now.getTime();
          const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
          const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
          nextAction = `Market closes in ${hoursLeft}h ${minutesLeft}m`;
        } else {
          status = 'post-market';
          nextAction = 'Market opens tomorrow 9:15 AM';
        }

        return NextResponse.json({
          success: true,
          marketStatus: status,
          currentTime: now.toISOString(),
          nextAction,
          cutoffTime: '15:25 (3:25 PM)',
          dataAvailable: status !== 'pre-market'
        });

      case 'symbols':
        return NextResponse.json({
          success: true,
          data: {
            allSymbols: ALL_SYMBOLS,
            categories: STOCK_CATEGORIES,
            totalCount: ALL_SYMBOLS.length
          }
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Combined Trading Data API',
          description: 'Combines 3 years of historical daily data with today\'s intraday data (9:15 AM to current time, max 3:25 PM)',
          endpoints: {
            'POST /api/trading-data': 'Get combined data for single symbol',
            'POST /api/trading-data (with symbols array)': 'Get combined data for multiple symbols',
            'GET /api/trading-data?action=market-status': 'Check current market status',
            'GET /api/trading-data?action=symbols': 'Get all available symbols'
          },
          features: [
            '3 years of historical daily OHLC data',
            'Today\'s intraday data converted to day candle',
            'Technical analysis (MA20, MA50, Support/Resistance)',
            'Trading signals and recommendations',
            'Market timing and session detection',
            'Volume and price change analysis'
          ],
          usage: {
            singleSymbol: {
              symbol: 'RELIANCE',
              exchange: 'NSE'
            },
            multipleSymbols: {
              symbols: ['RELIANCE', 'TCS', 'HDFCBANK'],
              exchange: 'NSE',
              includeSignals: true
            }
          }
        });
    }
  } catch (error) {
    console.error('Trading Data GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
