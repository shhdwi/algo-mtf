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

    // Check if it's within reasonable time (around 3:15 PM IST)
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    
    if (hour !== 15 || minute < 10 || minute > 20) {
      return NextResponse.json({ 
        success: false, 
        message: `Skipped: Not market close time (${hour}:${minute.toString().padStart(2, '0')} IST)`,
        timestamp: istTime.toISOString()
      });
    }

    console.log('🕒 Cron: Starting daily scan at 3:15 PM IST...');
    
    // Call the daily scan API internally
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://algo-mtf.vercel.app';
    
    const response = await fetch(`${baseUrl}/api/daily-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        exchange: 'NSE',
        send_whatsapp: true
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Cron: Daily scan completed successfully');
      return NextResponse.json({
        success: true,
        message: 'Daily scan executed successfully',
        scan_results: result,
        timestamp: istTime.toISOString()
      });
    } else {
      console.error('❌ Cron: Daily scan failed:', result);
      return NextResponse.json({
        success: false,
        message: 'Daily scan failed',
        error: result,
        timestamp: istTime.toISOString()
      }, { status: 500 });
    }

  } catch (error) {
    console.error('❌ Cron: Daily scan error:', error);
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
