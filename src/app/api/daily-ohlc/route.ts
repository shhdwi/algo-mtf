import { NextRequest, NextResponse } from 'next/server';
import DailyOHLCService from '@/services/dailyOHLCService';
import { ExchangeCode } from '@/types/chart';
import { ALL_SYMBOLS } from '@/constants/symbols';

interface DailyOHLCRequest {
  symbol: string;
  exchange?: ExchangeCode;
  yearsBack?: number;
}

interface MultipleDailyOHLCRequest {
  symbols: string[];
  exchange?: ExchangeCode;
  yearsBack?: number;
  includeComparison?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: DailyOHLCRequest | MultipleDailyOHLCRequest = await request.json();

    // Check if this is a multiple symbols request
    if ('symbols' in body && Array.isArray(body.symbols)) {
      return handleMultipleSymbols(body as MultipleDailyOHLCRequest);
    }

    // Single symbol request
    const singleBody = body as DailyOHLCRequest;
    
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

    // Validate years back
    const yearsBack = singleBody.yearsBack || 2;
    if (yearsBack < 1 || yearsBack > 10) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'yearsBack must be between 1 and 10' 
        },
        { status: 400 }
      );
    }

    // Initialize service
    const dailyOHLCService = new DailyOHLCService();
    
    // Get daily OHLC data
    const dailyData = await dailyOHLCService.getDailyOHLC({
      symbol: singleBody.symbol,
      exchange: singleBody.exchange || 'NSE',
      yearsBack
    });
    
    return NextResponse.json({
      success: true,
      data: dailyData
    });

  } catch (error) {
    console.error('Daily OHLC API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

async function handleMultipleSymbols(body: MultipleDailyOHLCRequest) {
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

  // Limit number of symbols
  if (body.symbols.length > 20) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Maximum 20 symbols allowed per request for daily OHLC data' 
      },
      { status: 400 }
    );
  }

  const yearsBack = body.yearsBack || 2;
  const exchange = body.exchange || 'NSE';
  const includeComparison = body.includeComparison || false;

  const dailyOHLCService = new DailyOHLCService();

  if (includeComparison) {
    // Get data with performance comparison
    const result = await dailyOHLCService.getDailyOHLCWithComparison(
      body.symbols,
      exchange,
      yearsBack
    );
    
    return NextResponse.json({
      success: true,
      data: result.data,
      comparison: result.comparison,
      summary: {
        totalSymbols: body.symbols.length,
        successful: result.data.length,
        failed: body.symbols.length - result.data.length
      }
    });
  } else {
    // Get data without comparison
    const results = await dailyOHLCService.getMultipleDailyOHLC(
      body.symbols,
      exchange,
      yearsBack
    );
    
    return NextResponse.json({
      success: true,
      data: results,
      summary: {
        totalSymbols: body.symbols.length,
        successful: results.length,
        failed: body.symbols.length - results.length
      }
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'symbols':
        return NextResponse.json({
          success: true,
          data: {
            symbols: ALL_SYMBOLS,
            count: ALL_SYMBOLS.length,
            categories: {
              banking: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
              it: ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM'],
              auto: ['MARUTI', 'TATAMOTORS', 'BAJAJ-AUTO', 'HEROMOTOCO'],
              pharma: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB'],
              fmcg: ['HINDUNILVR', 'BRITANNIA', 'DABUR', 'GODREJCP']
            }
          }
        });

      case 'sample':
        // Get sample daily data for RELIANCE (last 30 days)
        const sampleService = new DailyOHLCService();
        const sampleData = await sampleService.getDailyOHLC({
          symbol: 'RELIANCE',
          exchange: 'NSE',
          yearsBack: 0.1 // ~36 days
        });
        
        return NextResponse.json({
          success: true,
          data: {
            ...sampleData,
            dailyData: sampleData.dailyData.slice(-30) // Last 30 days only
          }
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Daily OHLC API endpoint',
          usage: {
            singleSymbol: {
              method: 'POST',
              endpoint: '/api/daily-ohlc',
              body: {
                symbol: 'string (required) - Stock symbol',
                exchange: 'string (optional) - Exchange code, default: NSE',
                yearsBack: 'number (optional) - Years of data, default: 2, max: 10'
              }
            },
            multipleSymbols: {
              method: 'POST',
              endpoint: '/api/daily-ohlc',
              body: {
                symbols: 'array (required) - Array of stock symbols, max: 20',
                exchange: 'string (optional) - Exchange code, default: NSE',
                yearsBack: 'number (optional) - Years of data, default: 2, max: 10',
                includeComparison: 'boolean (optional) - Include performance comparison, default: false'
              }
            }
          },
          features: [
            'Daily OHLC data with 1-day intervals',
            'Up to 10 years of historical data',
            'Performance analytics and volatility calculation',
            'Weekend/weekday classification',
            'Multi-symbol comparison',
            'Summary statistics'
          ]
        });
    }
  } catch (error) {
    console.error('Daily OHLC GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
