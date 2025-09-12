import { NextRequest, NextResponse } from 'next/server';
import ExitMonitoringService from '@/services/exitMonitoringService';

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if it's a weekday (Monday to Friday)
    const now = new Date();
    const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const dayOfWeek = istTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ 
        success: false, 
        message: 'Skipped: Weekend day',
        timestamp: istTime.toISOString()
      });
    }

    // Check if it's within market hours (9:15 AM to 3:30 PM IST)
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    const currentTimeMinutes = hour * 60 + minute;
    
    const marketOpenMinutes = 9 * 60 + 15; // 9:15 AM
    const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
    
    if (currentTimeMinutes < marketOpenMinutes || currentTimeMinutes > marketCloseMinutes) {
      return NextResponse.json({ 
        success: false, 
        message: `Skipped: Outside market hours (${hour}:${minute.toString().padStart(2, '0')} IST)`,
        timestamp: istTime.toISOString()
      });
    }

    console.log('🕒 Cron: Starting position monitoring...');
    
    // Call the exit monitoring service directly
    const exitMonitor = new ExitMonitoringService();
    const monitoringResults = await exitMonitor.monitorActivePositions(true);
    
    const exitCount = monitoringResults.exitSignals?.length || 0;
    const trailingCount = monitoringResults.trailingLevelNotifications?.length || 0;
    
    console.log(`✅ Cron: Position monitoring completed - ${exitCount} exits, ${trailingCount} trailing levels`);
    
    return NextResponse.json({
      success: true,
      message: 'Position monitoring executed successfully',
      summary: {
        positions_monitored: monitoringResults.totalPositions || 0,
        exit_signals: exitCount,
        trailing_notifications: trailingCount
      },
      monitoring_results: monitoringResults,
      timestamp: istTime.toISOString()
    });

  } catch (error) {
    console.error('❌ Cron: Position monitoring error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
