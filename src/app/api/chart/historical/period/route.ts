import { NextRequest, NextResponse } from 'next/server';
import ChartService from '@/services/chartService';
import { ExchangeCode, HistoricalTimeInterval } from '@/types/chart';

type HistoricalPeriod = '1d' | '3d' | '1w' | '2w' | '1Month' | '3Month' | '6Month' | '1y' | '2y';

interface HistoricalPeriodRequest {
  symbol: string;
  exchange?: ExchangeCode;
  interval?: HistoricalTimeInterval;
  period: HistoricalPeriod;
}

function getPeriodDates(period: HistoricalPeriod): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now);
  
  // Set end time to market close (15:30 IST) if it's a trading day
  const endDate = new Date(now);
  endDate.setHours(15, 30, 0, 0);
  
  switch (period) {
    case '1d':
      start.setDate(start.getDate() - 1);
      break;
    case '3d':
      start.setDate(start.getDate() - 3);
      break;
    case '1w':
      start.setDate(start.getDate() - 7);
      break;
    case '2w':
      start.setDate(start.getDate() - 14);
      break;
    case '1Month':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3Month':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6Month':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case '2y':
      start.setFullYear(start.getFullYear() - 2);
      break;
    default:
      start.setDate(start.getDate() - 7); // Default to 1 week
  }
  
  // Set start time to market open (09:15 IST)
  start.setHours(9, 15, 0, 0);
  
  return {
    startDate: start.toISOString().slice(0, 19), // Remove milliseconds and Z
    endDate: endDate.toISOString().slice(0, 19)
  };
}

function getRecommendedInterval(period: HistoricalPeriod): HistoricalTimeInterval {
  // Note: Historical API only supports: 1W, 1M, 3M, 1Y, 3Y, 5Y
  // For period-based requests, we need to map to valid historical intervals
  switch (period) {
    case '1d':
    case '3d':
    case '1w':
    case '2w':
      return '1W'; // Weekly data for short periods
    case '1Month':
      return '1M'; // Monthly data
    case '3Month':
      return '3M'; // Quarterly data
    case '6Month':
    case '1y':
      return '1Y'; // Yearly data
    case '2y':
      return '3Y'; // 3-year data for 2-year period (closest available)
    default:
      return '1W';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: HistoricalPeriodRequest = await request.json();

    // Validate required fields
    const { symbol, period } = body;
    
    if (!symbol || !period) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Symbol and period are required' 
        },
        { status: 400 }
      );
    }

    // Validate period
    const validPeriods: HistoricalPeriod[] = ['1d', '3d', '1w', '2w', '1Month', '3Month', '6Month', '1y', '2y'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid period. Valid periods: ${validPeriods.join(', ')}` 
        },
        { status: 400 }
      );
    }

    const exchange = body.exchange || 'NSE';
    const interval = body.interval || getRecommendedInterval(period);
    const { startDate, endDate } = getPeriodDates(period);

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
      data: {
        ...historicalData,
        period,
        requestedInterval: interval,
        actualDataPoints: historicalData.data.length
      }
    });

  } catch (error) {
    console.error('Historical Period API error:', error);
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
    message: 'Historical Chart Period API endpoint',
    usage: {
      method: 'POST',
      endpoint: '/api/chart/historical/period',
      body: {
        symbol: 'string (required) - Stock symbol (e.g., RELIANCE)',
        exchange: 'string (optional) - Exchange code (NSE/BSE/NFO/BFO), default: NSE',
        interval: 'string (optional) - Time interval, default: auto-selected based on period',
        period: 'string (required) - Time period (1d/3d/1w/2w/1Month/3Month/6Month/1y/2y)'
      },
      example: {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        period: '1Month'
      }
    },
    periods: {
      '1d': { description: '1 day', recommendedInterval: '1W' },
      '3d': { description: '3 days', recommendedInterval: '1W' },
      '1w': { description: '1 week', recommendedInterval: '1W' },
      '2w': { description: '2 weeks', recommendedInterval: '1W' },
      '1Month': { description: '1 month', recommendedInterval: '1M' },
      '3Month': { description: '3 months', recommendedInterval: '3M' },
      '6Month': { description: '6 months', recommendedInterval: '1Y' },
      '1y': { description: '1 year', recommendedInterval: '1Y' },
      '2y': { description: '2 years', recommendedInterval: '3Y' }
    }
  });
}
