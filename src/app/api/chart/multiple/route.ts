import { NextRequest, NextResponse } from 'next/server';
import ChartService from '@/services/chartService';
import { GetChartDataOptions } from '@/types/chart';

interface MultipleChartRequest {
  symbols: string[];
  options: Omit<GetChartDataOptions, 'symbol'>;
}

export async function POST(request: NextRequest) {
  try {
    const body: MultipleChartRequest = await request.json();

    // Validate required fields
    if (!body.symbols || !Array.isArray(body.symbols) || body.symbols.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Symbols array is required and must not be empty' 
        },
        { status: 400 }
      );
    }

    // Limit the number of symbols to prevent API abuse
    if (body.symbols.length > 50) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Maximum 50 symbols allowed per request' 
        },
        { status: 400 }
      );
    }

    // Initialize chart service
    const chartService = new ChartService();
    
    // Fetch chart data for multiple symbols
    const chartDataArray = await chartService.getMultipleChartData(
      body.symbols,
      body.options
    );
    
    return NextResponse.json({
      success: true,
      data: {
        results: chartDataArray,
        requested: body.symbols.length,
        successful: chartDataArray.length,
        failed: body.symbols.length - chartDataArray.length
      }
    });

  } catch (error) {
    console.error('Multiple Chart API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
