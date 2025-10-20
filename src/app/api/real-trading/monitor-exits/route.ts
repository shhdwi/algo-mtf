import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';
import ExitMonitoringService from '@/services/exitMonitoringService';
import WhatsAppService from '@/services/whatsappService';
import PositionManagerService from '@/services/positionManagerService';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { send_whatsapp = true } = await request.json();

    console.log('🔍 Starting Real Trading Exit Monitoring...');
    
    const lemonService = new LemonTradingService();
    const whatsappService = new WhatsAppService();
    const positionManager = new PositionManagerService();
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Get all active real positions
    const { data: realPositions, error: positionsError } = await supabase
      .from('real_positions')
      .select(`
        *,
        users!inner(full_name, phone_number),
        trading_preferences!inner(stop_loss_percentage)
      `)
      .eq('status', 'ACTIVE');

    if (positionsError) {
      console.error('Error fetching real positions:', positionsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch real positions'
      }, { status: 500 });
    }

    console.log(`📊 Monitoring ${realPositions?.length || 0} real trading positions`);

    let totalExitsExecuted = 0;
    let totalExitsFailed = 0;
    const exitResults: any[] = [];

    // Monitor each real position for exit conditions
    for (const position of realPositions || []) {
      try {
        console.log(`🔍 Monitoring real position: ${position.symbol} for user ${position.user_id}`);

        // Update current price and P&L
        await lemonService.updateRealPositionPnL(position.user_id, position.symbol, position.current_price);

        // Check exit conditions using the same logic as paper trading
        const exitMonitor = new ExitMonitoringService();
        
        // Convert real position to paper position format for exit analysis
        const paperPosition = {
          id: position.id,
          symbol: position.symbol,
          entry_price: position.entry_price,
          current_price: position.current_price,
          trailing_level: position.trailing_level,
          entry_date: position.entry_date,
          entry_time: position.entry_time,
          pnl_amount: position.pnl_amount,
          pnl_percentage: position.pnl_percentage,
          status: position.status,
          created_at: position.created_at,
          updated_at: position.updated_at
        };

        // Analyze for exit conditions
        const exitAnalysis = await exitMonitor['analyzePositionForExit'](paperPosition);

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
            if (send_whatsapp && position.users?.phone_number) {
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
          // No exit condition, just update trailing levels (with HIGH-WATER MARK protection)
          if (exitAnalysis.trailingStopLevel !== undefined) {
            // Use positionManager to ensure high-water mark protection
            await positionManager.updateRealTrailingLevel(
              position.id,
              position.symbol,
              exitAnalysis.trailingStopLevel
            );
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

    return NextResponse.json({
      success: true,
      message: 'Real trading exit monitoring completed',
      monitoring_results: {
        positions_monitored: realPositions?.length || 0,
        exits_executed: totalExitsExecuted,
        exits_failed: totalExitsFailed,
        exit_details: exitResults
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Real trading exit monitoring error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
