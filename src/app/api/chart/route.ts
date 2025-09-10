import { NextRequest, NextResponse } from 'next/server';
import ChartService from '@/services/chartService';
import { ExchangeCode, TimeInterval } from '@/types/chart';
import { GetChartDataOptions } from '@/types/chart';
import { ALL_SYMBOLS } from '@/constants/symbols';

export async function POST(request: NextRequest) {
  try {
    const body: GetChartDataOptions = await request.json();

    // Validate required fields
    if (!body.symbol && !body.token) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Either symbol or token is required' 
        },
        { status: 400 }
      );
    }

    // Initialize chart service
    const chartService = new ChartService();
    
    // Fetch chart data
    const chartData = await chartService.getChartData(body);
    
    return NextResponse.json({
      success: true,
      data: chartData
    });

  } catch (error) {
    console.error('Chart API error:', error);
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
      case 'symbols':
        return NextResponse.json({
          success: true,
          data: {
            symbols: ALL_SYMBOLS,
            count: ALL_SYMBOLS.length
          }
        });

      case 'current-price':
        const symbol = searchParams.get('symbol');
        const exchange = searchParams.get('exchange') || 'NSE';
        
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: 'Symbol is required' },
            { status: 400 }
          );
        }

        const priceChartService = new ChartService();
        const priceData = await priceChartService.getCurrentPrice(symbol, exchange as ExchangeCode);
        
        return NextResponse.json({
          success: true,
          data: priceData
        });

      case 'intraday':
        const intradaySymbol = searchParams.get('symbol');
        const interval = searchParams.get('interval') || '5m';
        const intradayExchange = searchParams.get('exchange') || 'NSE';
        
        if (!intradaySymbol) {
          return NextResponse.json(
            { success: false, error: 'Symbol is required' },
            { status: 400 }
          );
        }

        const intradayChartService = new ChartService();
        const intradayData = await intradayChartService.getIntradayData(
          intradaySymbol, 
          interval as TimeInterval, 
          intradayExchange as ExchangeCode
        );
        
        return NextResponse.json({
          success: true,
          data: intradayData
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'Chart API is working',
          endpoints: {
            'POST /api/chart': 'Get chart data with custom parameters',
            'GET /api/chart?action=symbols': 'Get all available symbols',
            'GET /api/chart?action=current-price&symbol=RELIANCE': 'Get current price',
            'GET /api/chart?action=intraday&symbol=RELIANCE&interval=5m': 'Get intraday data'
          }
        });
    }
  } catch (error) {
    console.error('Chart API GET error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
