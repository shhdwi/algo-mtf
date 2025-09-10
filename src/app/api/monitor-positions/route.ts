import { NextRequest, NextResponse } from 'next/server';
import ExitMonitoringService from '@/services/exitMonitoringService';

export async function POST(request: NextRequest) {
  try {
    const body: { send_whatsapp?: boolean } = await request.json();
    const sendWhatsApp = body.send_whatsapp !== false; // Default to true

    console.log('🔍 Starting 5-minute position monitoring...');
    
    const exitMonitor = new ExitMonitoringService();
    const monitoringResults = await exitMonitor.monitorActivePositions(sendWhatsApp);
    
    console.log('✅ Position monitoring completed!');

    return NextResponse.json({
      success: true,
      monitoring_results: monitoringResults,
      exit_summary: {
        total_positions_monitored: monitoringResults.totalPositions,
        exit_signals_found: monitoringResults.exitSignals.length,
        positions_updated: monitoringResults.updatedPositions,
        whatsapp_notifications: sendWhatsApp ? 'enabled' : 'disabled'
      },
      exit_signals: monitoringResults.exitSignals.map(signal => ({
        symbol: signal.position.symbol,
        exit_type: signal.exitType,
        exit_reason: signal.exitReason,
        current_price: signal.currentPrice,
        pnl_percentage: signal.pnlPercentage,
        pnl_amount: signal.pnlAmount
      })),
      position_status: monitoringResults.monitoringResults.map(result => ({
        symbol: result.symbol,
        status: result.status,
        current_price: result.currentPrice,
        pnl_percentage: result.pnlPercentage,
        trailing_level: result.trailingStopLevel,
        next_target: result.nextTargetLevel
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Position monitoring API error:', error);
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
    message: 'Position Exit Monitoring API',
    description: 'Monitors active positions every 5 minutes for exit conditions during market hours',
    exit_conditions: [
      {
        priority: 1,
        condition: 'RSI Reversal',
        description: 'RSI current < RSI 14 SMA (trend reversal)',
        action: 'Immediate exit with current PnL'
      },
      {
        priority: 2,
        condition: 'Stop Loss',
        description: 'Price drops 2.5% below entry price',
        action: 'Exit with loss to limit damage'
      },
      {
        priority: 3,
        condition: '14-Level Trailing Stops',
        description: 'Progressive profit locking from 1.5% to 30%',
        action: 'Lock profits at predetermined levels'
      }
    ],
    trailing_stops: {
      level_1: '1.5% profit → Lock 1.0%',
      level_1_5: '2.25% profit → Lock 1.75%',
      level_2: '2.75% profit → Lock 2.0%',
      level_14: '30.0% profit → Lock 23.0%',
      total_levels: 15
    },
    scheduling: {
      frequency: 'Every 5 minutes',
      market_hours: '9:15 AM - 3:30 PM IST',
      timezone: 'Asia/Kolkata'
    },
    whatsapp_notifications: {
      recipients: 5,
      controllable: 'send_whatsapp flag',
      message_format: 'Personalized exit alerts with PnL'
    }
  });
}
