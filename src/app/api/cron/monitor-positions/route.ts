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

    // Get all active user positions
    const { data: realPositions, error: positionsError } = await supabase
      .from('user_positions')
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
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 15; // Circuit breaker threshold

    // Monitor each real position for exit conditions
    for (const position of realPositions || []) {
      // Circuit breaker: Stop processing if too many consecutive failures
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.log(`🚨 Circuit breaker activated: ${consecutiveFailures} consecutive failures. Stopping further processing.`);
        break;
      }
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

        // Use the same price monitoring system as algorithm positions
        console.log(`📊 Analyzing exit conditions for ${position.symbol}...`);
        
        const exitMonitor = new ExitMonitoringService();
        
        // Convert real position to algorithm position format for exit analysis
        // The exitMonitor will fetch current price using combinedTradingService (same as algorithm)
        const algorithmPosition = {
          id: position.id,
          symbol: position.symbol,
          entry_price: position.entry_price,
          current_price: position.current_price, // Will be updated by exit analysis
          trailing_level: position.trailing_level,
          entry_date: position.entry_date,
          entry_time: position.entry_time,
          pnl_amount: position.pnl_amount,
          pnl_percentage: position.pnl_percentage,
          status: position.status,
          created_at: position.created_at,
          updated_at: position.updated_at
        };

        // Analyze for exit conditions using user's stop loss percentage
        const exitAnalysis = await exitMonitor['analyzePositionForExit'](algorithmPosition, userStopLossPercentage);
        
        // Update user position P&L with the fresh price from exit analysis
        if (exitAnalysis.currentPrice !== position.current_price) {
          console.log(`💰 ${position.symbol}: Entry ₹${position.entry_price} → Current ₹${exitAnalysis.currentPrice} (${exitAnalysis.pnlPercentage.toFixed(2)}%)`);
          
          await supabase
            .from('user_positions')
            .update({
              current_price: exitAnalysis.currentPrice,
              pnl_amount: exitAnalysis.pnlAmount,
              pnl_percentage: exitAnalysis.pnlPercentage,
              updated_at: new Date().toISOString()
            })
            .eq('id', position.id);
        }

        if (exitAnalysis.status === 'EXIT' && exitAnalysis.exitSignal) {
          console.log(`🚨 Exit condition detected for ${position.symbol}: ${exitAnalysis.exitSignal.exitReason}`);

          // Prevent exits within 1 hour of entry
          const entryTime = new Date(position.entry_time);
          const now = new Date();
          const hoursSinceEntry = (now.getTime() - entryTime.getTime()) / (1000 * 60 * 60); // Convert ms to hours
          
          if (hoursSinceEntry < 1) {
            const minutesSinceEntry = Math.floor((now.getTime() - entryTime.getTime()) / (1000 * 60));
            console.log(`⚠️ 1-hour exit window active for ${position.symbol} (entered ${minutesSinceEntry} minutes ago, need 60 minutes)`);
            consecutiveFailures = 0; // Reset since this is expected behavior
            continue; // Skip to next position
          }

          // Place real exit order via Lemon API (handles AMO automatically)
          const exitOrderResult = await lemonService.exitRealPosition(
            position.user_id,
            position.symbol,
            exitAnalysis.exitSignal.exitType
          );
          
          // Log market status for exit order
          if (exitOrderResult.market_status) {
            console.log(`📊 Exit order market status: ${exitOrderResult.market_status}`);
            if (exitOrderResult.is_amo) {
              console.log(`🌙 Exit order placed as AMO - will execute at: ${exitOrderResult.execution_time}`);
            }
          }

          if (exitOrderResult.success) {
            totalExitsExecuted++;
            consecutiveFailures = 0; // Reset failure counter on success
            
            exitResults.push({
              user_id: position.user_id,
              symbol: position.symbol,
              exit_reason: exitAnalysis.exitSignal.exitReason,
              exit_price: exitOrderResult.actual_exit_price || exitAnalysis.currentPrice, // Use actual execution price if available
              pnl_amount: exitOrderResult.actual_pnl_amount || exitAnalysis.pnlAmount,
              pnl_percentage: exitOrderResult.actual_pnl_percentage || exitAnalysis.pnlPercentage,
              order_id: exitOrderResult.order_id,
              status: 'success'
            });

            // Send WhatsApp notification about the exit
            if (sendWhatsApp && position.users?.phone_number) {
              try {
                const executionInfo = exitOrderResult.is_amo 
                  ? `AMO placed - will execute at market open (${new Date(exitOrderResult.execution_time || '').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST)`
                  : `Executed immediately | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`;
                
                await whatsappService.sendMessage({
                  phoneNumber: position.users.phone_number,
                  message1: `Hi ${position.users.full_name}! Real trading exit ${exitOrderResult.is_amo ? 'AMO placed' : 'executed'} 📈`,
                  message2: `${position.symbol}: ₹${exitAnalysis.currentPrice} - ${exitOrderResult.is_amo ? 'AMO SELL ORDER PLACED' : 'POSITION EXITED'}`,
                  message3: exitAnalysis.exitSignal.exitReason,
                  message4: `Final PnL: ${exitAnalysis.pnlPercentage >= 0 ? '+' : ''}${exitAnalysis.pnlPercentage.toFixed(2)}% (₹${exitAnalysis.pnlAmount.toFixed(0)}) | ${executionInfo}`
                });

                console.log(`📱 Real exit WhatsApp sent to user ${position.user_id}`);
              } catch (whatsappError) {
                console.error(`Failed to send exit WhatsApp to user ${position.user_id}:`, whatsappError);
              }
            }

            console.log(`✅ Real position exited: ${position.symbol} for user ${position.user_id}`);

            // Check if all users have exited this symbol, if so, update algorithm position
            try {
              const { data: remainingUserPositions, error: checkError } = await supabase
                .from('user_positions')
                .select('id')
                .eq('symbol', position.symbol)
                .eq('status', 'ACTIVE');

              if (!checkError && (!remainingUserPositions || remainingUserPositions.length === 0)) {
                console.log(`🔄 All users exited ${position.symbol}, syncing algorithm position...`);
                
                // Update algorithm position to EXITED
                const { error: algoUpdateError } = await supabase
                  .from('algorithm_positions')
                  .update({
                    status: 'EXITED',
                    exit_date: new Date().toISOString().split('T')[0],
                    exit_time: new Date().toISOString(),
                    exit_price: exitAnalysis.currentPrice,
                    exit_reason: exitAnalysis.exitSignal.exitType,
                    current_price: exitAnalysis.currentPrice,
                    pnl_amount: exitAnalysis.pnlAmount,
                    pnl_percentage: exitAnalysis.pnlPercentage,
                    updated_at: new Date().toISOString()
                  })
                  .eq('symbol', position.symbol)
                  .eq('status', 'ACTIVE');

                if (algoUpdateError) {
                  console.error(`❌ Failed to sync algorithm position for ${position.symbol}:`, algoUpdateError);
                } else {
                  console.log(`✅ Algorithm position synced for ${position.symbol}`);
                }
              } else if (remainingUserPositions && remainingUserPositions.length > 0) {
                console.log(`📊 ${position.symbol}: ${remainingUserPositions.length} user(s) still have active positions`);
              }
            } catch (syncError) {
              console.error(`❌ Error syncing algorithm position for ${position.symbol}:`, syncError);
            }

          } else {
            totalExitsFailed++;
            consecutiveFailures++; // Increment failure counter
            
            exitResults.push({
              user_id: position.user_id,
              symbol: position.symbol,
              exit_reason: exitAnalysis.exitSignal.exitReason,
              error: exitOrderResult.error,
              status: 'failed'
            });

            console.log(`❌ Real exit order failed: ${position.symbol} for user ${position.user_id} - ${exitOrderResult.error}`);
            console.log(`⚠️ Consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
          }
        } else {
          // No exit condition, just update trailing levels
          if (exitAnalysis.trailingStopLevel !== undefined && exitAnalysis.trailingStopLevel > position.trailing_level) {
            await supabase
              .from('user_positions')
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
        consecutiveFailures++; // Increment failure counter for system errors too
        console.log(`⚠️ Consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
      }
    }

    console.log(`✅ Real trading exit monitoring completed: ${totalExitsExecuted} exits executed, ${totalExitsFailed} failed`);

    // Alert on high failure rate
    const totalPositions = realPositions?.length || 0;
    if (totalPositions > 0 && totalExitsFailed > totalExitsExecuted && totalExitsFailed > 2) {
      console.log(`🚨 HIGH FAILURE RATE ALERT: ${totalExitsFailed} failures vs ${totalExitsExecuted} successes out of ${totalPositions} positions`);
      
      // Send alert to eligible users about system issues
      try {
        const { data: eligibleUsers } = await supabase
          .from('trading_preferences')
          .select('user_id, users!inner(full_name, phone_number)')
          .eq('is_real_trading_enabled', true)
          .eq('users.is_active', true);

        if (eligibleUsers?.length) {
          for (const user of eligibleUsers) {
            await whatsappService.sendMessage({
              phoneNumber: (user as any).users.phone_number,
              message1: `Hi ${(user as any).users.full_name}! System Alert 🚨`,
              message2: `High failure rate in exit monitoring detected`,
              message3: `${totalExitsFailed} exits failed vs ${totalExitsExecuted} successful`,
              message4: `Please monitor your positions manually | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
            });
          }
        }
      } catch (alertError) {
        console.error('Failed to send high failure rate alert:', alertError);
      }
    }

    return {
      success: true,
      message: 'Real trading exit monitoring completed',
      monitoring_results: {
        positions_monitored: realPositions?.length || 0,
        exits_executed: totalExitsExecuted,
        exits_failed: totalExitsFailed,
        consecutive_failures: consecutiveFailures,
        circuit_breaker_activated: consecutiveFailures >= maxConsecutiveFailures,
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
    // Verify the request is from Vercel Cron (bypass for local testing)
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    const testAuth = 'Bearer e74e4ba1e2e10c5798d164485bc9fecbdc58ab3eecc15429b266425827603991';
    
    if (authHeader !== expectedAuth && authHeader !== testAuth) {
      console.log('🔍 Monitor Auth check failed:', { received: authHeader, expected: expectedAuth, test: testAuth });
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

    // Check if it's within market hours (9:15 AM to 3:30 PM IST) - bypass for testing
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    const currentTimeMinutes = hour * 60 + minute;
    const isTestAuth = authHeader === testAuth;
    
    const marketOpenMinutes = 9 * 60 + 15; // 9:15 AM
    const marketCloseMinutes = 15 * 60 + 30; // 3:30 PM
    
    if (!isTestAuth && (currentTimeMinutes < marketOpenMinutes || currentTimeMinutes > marketCloseMinutes)) {
      return NextResponse.json({ 
        success: false, 
        message: `Skipped: Outside market hours (${hour}:${minute.toString().padStart(2, '0')} IST)`,
        timestamp: istTime.toISOString()
      });
    }
    
    if (isTestAuth) {
      console.log('🧪 Running position monitoring in TEST MODE - bypassing market hours restrictions');
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
