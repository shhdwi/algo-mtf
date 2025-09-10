import { NextRequest, NextResponse } from 'next/server';
import SupportResistanceService from '@/services/supportResistanceService';
import { ExchangeCode } from '@/types/chart';

interface SupportResistanceRequest {
  symbol: string;
  exchange?: ExchangeCode;
}

interface MultipleSRRequest {
  symbols: string[];
  exchange?: ExchangeCode;
}

export async function POST(request: NextRequest) {
  try {
    const body: SupportResistanceRequest | MultipleSRRequest = await request.json();

    // Check if this is a multiple symbols request
    if ('symbols' in body && Array.isArray(body.symbols)) {
      return handleMultipleSymbols(body as MultipleSRRequest);
    }

    // Single symbol request
    const singleBody = body as SupportResistanceRequest;
    
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
    const srService = new SupportResistanceService();
    
    // Analyze support/resistance
    const srData = await srService.analyzeSupportResistance(
      singleBody.symbol,
      singleBody.exchange || 'NSE'
    );
    
    return NextResponse.json({
      success: true,
      data: srData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Support/Resistance API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

async function handleMultipleSymbols(body: MultipleSRRequest) {
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
  if (body.symbols.length > 5) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Maximum 5 symbols allowed per request for S/R analysis' 
      },
      { status: 400 }
    );
  }

  const exchange = body.exchange || 'NSE';
  const srService = new SupportResistanceService();
  
  const results = await srService.getMultipleSupportResistance(body.symbols, exchange);

  // Create summary
  const summary = {
    totalSymbols: body.symbols.length,
    successful: results.length,
    failed: body.symbols.length - results.length,
    withSupport: results.filter(r => r.nearest_support).length,
    withResistance: results.filter(r => r.nearest_resistance).length,
    avgChannels: results.reduce((sum, r) => sum + r.all_valid_channels.length, 0) / results.length
  };

  return NextResponse.json({
    success: true,
    data: results,
    summary,
    timestamp: new Date().toISOString()
  });
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

        const srService = new SupportResistanceService();
        const testData = await srService.analyzeSupportResistance(symbol, 'NSE');
        
        return NextResponse.json({
          success: true,
          data: {
            symbol: testData.symbol,
            current_price: testData.current_price,
            nearest_support: testData.nearest_support,
            nearest_resistance: testData.nearest_resistance,
            total_channels: testData.all_valid_channels.length,
            pivot_count: testData.statistics.total_pivots,
            analysis_date: testData.analysis_date
          }
        });

      case 'config':
        return NextResponse.json({
          success: true,
          configuration: {
            prd: 10,
            ppsrc: 'High/Low',
            ChannelW: 5,
            minstrength: 1,
            maxnumsr: 6,
            loopback: 290
          },
          description: {
            prd: 'Pivot period - bars on each side for pivot detection',
            ppsrc: 'Source for pivot detection (High/Low)',
            ChannelW: 'Maximum channel width as % of high-low range',
            minstrength: 'Minimum strength required (×20 internally)',
            maxnumsr: 'Maximum number of channels to detect',
            loopback: 'Number of historical candles to analyze'
          }
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Support/Resistance Analysis API',
          description: 'Implements Pine Script algorithm for pivot detection and channel formation',
          endpoints: {
            'POST /api/support-resistance': 'Analyze S/R for single symbol',
            'POST /api/support-resistance (with symbols array)': 'Analyze S/R for multiple symbols',
            'GET /api/support-resistance?action=test&symbol=RELIANCE': 'Quick test for any symbol',
            'GET /api/support-resistance?action=config': 'View current configuration'
          },
          algorithm: {
            step1: 'Detect pivot points (10-period high/low)',
            step2: 'Form channels within 5% width limit',
            step3: 'Calculate strength (20 per pivot + touches)',
            step4: 'Select top 6 non-overlapping channels',
            step5: 'Classify nearest support/resistance'
          },
          features: [
            'Exact Pine Script pivot detection algorithm',
            'Channel formation with configurable width',
            'Strength-based channel ranking',
            'Non-overlapping channel selection',
            'Nearest support/resistance identification',
            'Distance percentage calculations'
          ]
        });
    }
  } catch (error) {
    console.error('Support/Resistance GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
