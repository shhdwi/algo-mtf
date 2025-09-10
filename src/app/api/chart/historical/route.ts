import { NextRequest, NextResponse } from 'next/server';
import ChartService from '@/services/chartService';
import { ExchangeCode, HistoricalTimeInterval } from '@/types/chart';

interface HistoricalChartRequest {
  symbol: string;
  exchange?: ExchangeCode;
  interval?: HistoricalTimeInterval;
  startDate: string;
  endDate: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: HistoricalChartRequest = await request.json();

    // Validate required fields
    const { symbol, startDate, endDate } = body;
    
    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Symbol, startDate, and endDate are required' 
        },
        { status: 400 }
      );
    }

    // Validate date format (should be YYYY-MM-DDTHH:MM:SS)
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Date format should be YYYY-MM-DDTHH:MM:SS (e.g., 2024-01-01T09:15:00)' 
        },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Start date must be before end date' 
        },
        { status: 400 }
      );
    }

    // Check if date range is not too large (max 1 year)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (end.getTime() - start.getTime() > maxRangeMs) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Date range cannot exceed 1 year' 
        },
        { status: 400 }
      );
    }

    const exchange = body.exchange || 'NSE';
    const interval = body.interval || '1W';

    // Initialize chart service
    const chartService = new ChartService();
    
    // Fetch historical data
    const historicalData = await chartService.getHistoricalData(
      symbol,
      startDate,
      endDate,
      interval,
      exchange
    );
    
    return NextResponse.json({
      success: true,
      data: historicalData
    });

  } catch (error) {
    console.error('Historical Chart API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Historical Chart API endpoint',
    usage: {
      method: 'POST',
      endpoint: '/api/chart/historical',
      body: {
        symbol: 'string (required) - Stock symbol (e.g., RELIANCE)',
        exchange: 'string (optional) - Exchange code (NSE/BSE/NFO/BFO), default: NSE',
        interval: 'string (optional) - Time interval (5s/15s/30s/1m/5m/15m/30m/60m), default: 1d',
        startDate: 'string (required) - Start date in YYYY-MM-DDTHH:MM:SS format',
        endDate: 'string (required) - End date in YYYY-MM-DDTHH:MM:SS format'
      },
      example: {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        interval: '1d',
        startDate: '2024-01-01T09:15:00',
        endDate: '2024-01-31T15:30:00'
      }
    },
    limits: {
      maxDateRange: '1 year',
      supportedIntervals: ['5s', '15s', '30s', '1m', '5m', '15m', '30m', '60m'],
      supportedExchanges: ['NSE', 'BSE', 'NFO', 'BFO']
    }
  });
}
