import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const now = new Date();
    const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const dayOfWeek = istTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    const currentTimeMinutes = hour * 60 + minute;
    
    const marketOpenMinutes = 9 * 60 + 15; // 9:15 AM
    const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
    const dailyScanTime = 15 * 60 + 15; // 3:15 PM
    
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isMarketHours = currentTimeMinutes >= marketOpenMinutes && currentTimeMinutes <= marketCloseMinutes;
    const isDailyScanTime = hour === 15 && minute >= 10 && minute <= 20;
    
    return NextResponse.json({
      success: true,
      current_time: {
        ist: istTime.toISOString(),
        formatted: istTime.toLocaleString('en-IN', { 
          timeZone: 'Asia/Kolkata',
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      },
      market_status: {
        is_weekday: isWeekday,
        is_market_hours: isMarketHours,
        is_daily_scan_time: isDailyScanTime,
        next_market_open: isWeekday && !isMarketHours && currentTimeMinutes < marketOpenMinutes 
          ? 'Today at 9:15 AM IST' 
          : 'Next weekday at 9:15 AM IST',
        next_daily_scan: isWeekday && currentTimeMinutes < dailyScanTime
          ? 'Today at 3:15 PM IST'
          : 'Next weekday at 3:15 PM IST'
      },
      cron_schedule: {
        daily_scan: {
          schedule: '15 15 * * 1-5',
          description: '3:15 PM IST on weekdays',
          should_run_now: isWeekday && isDailyScanTime
        },
        position_monitor: {
          schedule: '*/5 9-15 * * 1-5',
          description: 'Every 5 minutes during market hours on weekdays',
          should_run_now: isWeekday && isMarketHours
        }
      },
      endpoints: {
        daily_scan: '/api/cron/daily-scan',
        monitor_positions: '/api/cron/monitor-positions',
        manual_daily_scan: '/api/daily-scan',
        manual_monitor: '/api/monitor-positions'
      },
      testing: {
        test_daily_scan: 'curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://algo-mtf.vercel.app/api/cron/daily-scan',
        test_monitor: 'curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://algo-mtf.vercel.app/api/cron/monitor-positions'
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
