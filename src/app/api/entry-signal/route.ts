import { NextRequest, NextResponse } from 'next/server';
import EntrySignalService from '@/services/entrySignalService';
import { ExchangeCode } from '@/types/chart';
import { STOCK_CATEGORIES } from '@/constants/symbols';

interface EntrySignalRequest {
  symbol: string;
  exchange?: ExchangeCode;
}

interface MultipleEntrySignalRequest {
  symbols: string[];
  exchange?: ExchangeCode;
  summaryOnly?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: EntrySignalRequest | MultipleEntrySignalRequest = await request.json();

    // Check if this is a multiple symbols request
    if ('symbols' in body && Array.isArray(body.symbols)) {
      return handleMultipleSymbols(body as MultipleEntrySignalRequest);
    }

    // Single symbol request
    const singleBody = body as EntrySignalRequest;
    
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
    const entryService = new EntrySignalService();
    
    // Analyze entry signal
    const entrySignal = await entryService.analyzeEntrySignal(
      singleBody.symbol,
      singleBody.exchange || 'NSE'
    );
    
    return NextResponse.json({
      success: true,
      data: entrySignal,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Entry Signal API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

async function handleMultipleSymbols(body: MultipleEntrySignalRequest) {
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
        error: 'Maximum 10 symbols allowed per request for entry signal analysis' 
      },
      { status: 400 }
    );
  }

  const exchange = body.exchange || 'NSE';
  const summaryOnly = body.summaryOnly || false;

  const entryService = new EntrySignalService();

  if (summaryOnly) {
    // Get summary with top opportunities
    const result = await entryService.getEntrySignalsSummary(body.symbols, exchange);
    
    return NextResponse.json({
      success: true,
      summary: result.summary,
      topOpportunities: result.summary.topOpportunities,
      timestamp: new Date().toISOString()
    });
  } else {
    // Get detailed signals for all symbols
    const signals = await entryService.getMultipleEntrySignals(body.symbols, exchange);
    
    const summary = {
      totalSymbols: body.symbols.length,
      successful: signals.length,
      failed: body.symbols.length - signals.length,
      entrySignals: signals.filter(s => s.signal === 'ENTRY').length,
      noEntrySignals: signals.filter(s => s.signal === 'NO_ENTRY').length,
      avgConfidence: Math.round(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length)
    };

    return NextResponse.json({
      success: true,
      data: signals,
      summary,
      timestamp: new Date().toISOString()
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const symbol = searchParams.get('symbol');

  try {
    switch (action) {
      case 'test':
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Symbol parameter required for test' },
            { status: 400 }
          );
        }

        const entryService = new EntrySignalService();
        const testSignal = await entryService.analyzeEntrySignal(symbol, 'NSE');
        
        return NextResponse.json({
          success: true,
          data: {
            symbol: testSignal.symbol,
            signal: testSignal.signal,
            confidence: testSignal.confidence,
            current_price: testSignal.current_price,
            conditions: testSignal.conditions,
            histogram_count: testSignal.histogram_count,
            resistance_check: testSignal.resistance_check,
            reasoning: testSignal.reasoning
          }
        });

      case 'banking':
        const bankingService = new EntrySignalService();
        const bankingResult = await bankingService.getEntrySignalsSummary([...STOCK_CATEGORIES.BANKING], 'NSE');
        
        return NextResponse.json({
          success: true,
          sector: 'Banking',
          summary: bankingResult.summary,
          topOpportunities: bankingResult.summary.topOpportunities
        });

      case 'it':
        const itService = new EntrySignalService();
        const itResult = await itService.getEntrySignalsSummary([...STOCK_CATEGORIES.IT], 'NSE');
        
        return NextResponse.json({
          success: true,
          sector: 'IT',
          summary: itResult.summary,
          topOpportunities: itResult.summary.topOpportunities
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Algo-MTF Entry Signal Analysis API',
          description: 'Implements complete Algo-MTF entry logic with technical indicators and S/R analysis',
          algorithm: {
            indicators: {
              EMA50: 'Price must be above 50-period Exponential Moving Average',
              RSI14: 'RSI must be between 50-65 (healthy momentum)',
              RSI_SMA14: 'RSI must be above its 14-period Simple Moving Average',
              MACD: 'MACD line must be above signal line (bullish)',
              Histogram: 'Maximum 3 consecutive positive histogram bars'
            },
            supportResistance: {
              pivotDetection: '10-period pivot highs and lows',
              channelFormation: 'Maximum 5% channel width',
              strengthCalculation: '20 points per pivot + historical touches',
              proximityCheck: 'Minimum 1.5% distance from nearest resistance'
            },
            entryConditions: 'ALL technical + resistance conditions must be TRUE'
          },
          endpoints: {
            'POST /api/entry-signal': 'Analyze entry signal for single symbol',
            'POST /api/entry-signal (with symbols array)': 'Analyze multiple symbols',
            'POST /api/entry-signal (with summaryOnly: true)': 'Get summary with top opportunities',
            'GET /api/entry-signal?action=test&symbol=RELIANCE': 'Quick test for any symbol',
            'GET /api/entry-signal?action=banking': 'Banking sector analysis',
            'GET /api/entry-signal?action=it': 'IT sector analysis'
          },
          usage: {
            singleSymbol: {
              symbol: 'RELIANCE',
              exchange: 'NSE'
            },
            multipleSymbols: {
              symbols: ['RELIANCE', 'TCS', 'HDFCBANK'],
              exchange: 'NSE',
              summaryOnly: false
            },
            portfolioScreening: {
              symbols: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'WIPRO'],
              summaryOnly: true
            }
          }
        });
    }
  } catch (error) {
    console.error('Entry Signal GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
