import { NextRequest, NextResponse } from 'next/server';
import ExitMonitoringService from '@/services/exitMonitoringService';
import LemonTradingService from '@/services/lemonTradingService';
import WhatsAppService from '@/services/whatsappService';
import { createClient } from '@supabase/supabase-js';

/**
 * Monitor real trading exits directly (no HTTP call)
 */
async function monitorRealTradingExits(sendWhatsApp: boolean = true) {
  try {
    console.log('🔍 Starting Real Trading Exit Monitoring (Direct)...');
    
    const lemonService = new LemonTradingService();
    const whatsappService = new WhatsAppService();
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Get all active real positions
    const { data: realPositions, error: positionsError } = await supabase
      .from('real_positions')
      .select(`
        *,
        users!inner(full_name, phone_number)
      `)
      .eq('status', 'ACTIVE');

    if (positionsError) {
      console.error('Error fetching real positions:', positionsError);
      return {
        success: false,
        error: 'Failed to fetch real positions'
      };
    }

    console.log(`📊 Monitoring ${realPositions?.length || 0} real trading positions`);

    let totalExitsExecuted = 0;
    let totalExitsFailed = 0;
    const exitResults: any[] = [];

    // Monitor each real position for exit conditions
    for (const position of realPositions || []) {
      try {
        console.log(`🔍 Monitoring real position: ${position.symbol} for user ${position.user_id}`);

        // Get user's trading preferences for stop loss percentage
        const { data: userPrefs } = await supabase
          .from('trading_preferences')
          .select('stop_loss_percentage')
          .eq('user_id', position.user_id)
          .single();

        const userStopLossPercentage = userPrefs?.stop_loss_percentage || 2.5; // Default to 2.5% if not found
        console.log(`⚙️ User stop loss setting: ${userStopLossPercentage}%`);

        // Fetch live current price for accurate monitoring
        console.log(`📊 Fetching live price for ${position.symbol}...`);
        const ltpData = await lemonService.getLTP(position.symbol, 'NSE');
        const livePrice = ltpData?.last_traded_price || position.current_price;
        
        console.log(`💰 ${position.symbol}: Entry ₹${position.entry_price} → Live ₹${livePrice} (${((livePrice - position.entry_price) / position.entry_price * 100).toFixed(2)}%)`);

        // Update current price and P&L with live data
        await lemonService.updateRealPositionPnL(position.user_id, position.symbol, livePrice);

        // Calculate live PnL for exit analysis
        const livePnlAmount = (livePrice - position.entry_price) * position.entry_quantity;
        const livePnlPercentage = ((livePrice - position.entry_price) / position.entry_price) * 100;

        // Check exit conditions using the same logic as paper trading
        const exitMonitor = new ExitMonitoringService();
        
        // Convert real position to paper position format for exit analysis (with live data)
        const paperPosition = {
          id: position.id,
          symbol: position.symbol,
          entry_price: position.entry_price,
          current_price: livePrice,  // Use live price
          trailing_level: position.trailing_level,
          entry_date: position.entry_date,
          entry_time: position.entry_time,
          pnl_amount: livePnlAmount,  // Use live PnL
          pnl_percentage: livePnlPercentage,  // Use live PnL
          status: position.status,
          created_at: position.created_at,
          updated_at: position.updated_at
        };

        // Analyze for exit conditions using user's stop loss percentage
        const exitAnalysis = await exitMonitor['analyzePositionForExit'](paperPosition, userStopLossPercentage);

        if (exitAnalysis.status === 'EXIT' && exitAnalysis.exitSignal) {
          console.log(`🚨 Exit condition detected for ${position.symbol}: ${exitAnalysis.exitSignal.exitReason}`);

          // Place real exit order via Lemon API
          const exitOrderResult = await lemonService.exitRealPosition(
            position.user_id,
            position.symbol,
            exitAnalysis.exitSignal.exitType
          );

          if (exitOrderResult.success) {
            totalExitsExecuted++;
            
            exitResults.push({
              user_id: position.user_id,
              symbol: position.symbol,
              exit_reason: exitAnalysis.exitSignal.exitReason,
              exit_price: exitAnalysis.currentPrice,
              pnl_amount: exitAnalysis.pnlAmount,
              pnl_percentage: exitAnalysis.pnlPercentage,
              order_id: exitOrderResult.order_id,
              status: 'success'
            });

            // Send WhatsApp notification about the exit
            if (sendWhatsApp && position.users?.phone_number) {
              try {
                await whatsappService.sendMessage({
                  phoneNumber: position.users.phone_number,
                  message1: `Hi ${position.users.full_name}! Real trading exit executed 📈`,
                  message2: `${position.symbol}: ₹${exitAnalysis.currentPrice} - POSITION EXITED`,
                  message3: exitAnalysis.exitSignal.exitReason,
                  message4: `Final PnL: ${exitAnalysis.pnlPercentage >= 0 ? '+' : ''}${exitAnalysis.pnlPercentage.toFixed(2)}% (₹${(exitAnalysis.pnlAmount * position.entry_quantity).toFixed(0)}) | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
                });

                console.log(`📱 Real exit WhatsApp sent to user ${position.user_id}`);
              } catch (whatsappError) {
                console.error(`Failed to send exit WhatsApp to user ${position.user_id}:`, whatsappError);
              }
            }

            console.log(`✅ Real position exited: ${position.symbol} for user ${position.user_id}`);

          } else {
            totalExitsFailed++;
            
            exitResults.push({
              user_id: position.user_id,
              symbol: position.symbol,
              exit_reason: exitAnalysis.exitSignal.exitReason,
              error: exitOrderResult.error,
              status: 'failed'
            });

            console.log(`❌ Real exit order failed: ${position.symbol} for user ${position.user_id} - ${exitOrderResult.error}`);
          }
        } else {
          // No exit condition, just update trailing levels
          if (exitAnalysis.trailingStopLevel !== undefined && exitAnalysis.trailingStopLevel > position.trailing_level) {
            await supabase
              .from('real_positions')
              .update({
                trailing_level: exitAnalysis.trailingStopLevel,
                updated_at: new Date().toISOString()
              })
              .eq('id', position.id);

            console.log(`📈 Updated real trailing level: ${position.symbol} → Level ${exitAnalysis.trailingStopLevel}`);
          }
        }

        // Update daily trading summary
        await lemonService.updateDailyTradingSummary(position.user_id);

      } catch (error) {
        console.error(`Error monitoring real position ${position.symbol} for user ${position.user_id}:`, error);
        totalExitsFailed++;
      }
    }

    console.log(`✅ Real trading exit monitoring completed: ${totalExitsExecuted} exits executed, ${totalExitsFailed} failed`);

    return {
      success: true,
      message: 'Real trading exit monitoring completed',
      monitoring_results: {
        positions_monitored: realPositions?.length || 0,
        exits_executed: totalExitsExecuted,
        exits_failed: totalExitsFailed,
        exit_details: exitResults
      }
    };

  } catch (error) {
    console.error('Real trading exit monitoring error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    };
  }
}

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
    
    // Monitor paper trading positions (existing system)
    const exitMonitor = new ExitMonitoringService();
    const monitoringResults = await exitMonitor.monitorActivePositions(true);
    
    // Monitor real trading positions for exits (direct service call)
    const realTradingResults = await monitorRealTradingExits(true);
    
    const exitCount = monitoringResults.exitSignals?.length || 0;
    const trailingCount = monitoringResults.trailingLevelNotifications?.length || 0;
    const realExitCount = realTradingResults.success ? realTradingResults.monitoring_results?.exits_executed || 0 : 0;
    
    console.log(`✅ Cron: Position monitoring completed - Paper: ${exitCount} exits, ${trailingCount} trailing levels | Real: ${realExitCount} exits`);
    
    return NextResponse.json({
      success: true,
      message: 'Position monitoring executed successfully',
      summary: {
        paper_positions_monitored: monitoringResults.totalPositions || 0,
        paper_exit_signals: exitCount,
        paper_trailing_notifications: trailingCount,
        real_positions_monitored: realTradingResults.success ? realTradingResults.monitoring_results?.positions_monitored || 0 : 0,
        real_exits_executed: realExitCount
      },
      paper_trading_results: monitoringResults,
      real_trading_results: realTradingResults.success ? realTradingResults.monitoring_results : { error: realTradingResults.error },
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
