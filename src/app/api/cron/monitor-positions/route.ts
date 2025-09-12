import { NextRequest, NextResponse } from 'next/server';

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
    
    // Call the monitor positions API internally
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/monitor-positions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        send_whatsapp: true
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      const exitCount = result.monitoring_results?.exitSignals?.length || 0;
      const trailingCount = result.monitoring_results?.trailingLevelNotifications?.length || 0;
      
      console.log(`✅ Cron: Position monitoring completed - ${exitCount} exits, ${trailingCount} trailing levels`);
      
      return NextResponse.json({
        success: true,
        message: 'Position monitoring executed successfully',
        summary: {
          positions_monitored: result.monitoring_results?.totalPositions || 0,
          exit_signals: exitCount,
          trailing_notifications: trailingCount
        },
        monitoring_results: result,
        timestamp: istTime.toISOString()
      });
    } else {
      console.error('❌ Cron: Position monitoring failed:', result);
      return NextResponse.json({
        success: false,
        message: 'Position monitoring failed',
        error: result,
        timestamp: istTime.toISOString()
      }, { status: 500 });
    }

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
