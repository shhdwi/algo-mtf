import { NextRequest, NextResponse } from 'next/server';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';
import WhatsAppService from '@/services/whatsappService';
import { createClient } from '@supabase/supabase-js';


/**
 * Execute real trading signals directly (no HTTP call)
 */
async function executeRealTradingSignals(entrySignals: any[], sendWhatsApp: boolean = true) {
  const supabase = createClient(
    process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
  );

  try {
    console.log('🚀 Starting Real Trading Signal Execution (Direct)...');
    console.log(`📊 Using ${entrySignals.length} pre-scanned entry signals for real trading`);

    if (entrySignals.length === 0) {
      return {
        success: true,
        message: 'No entry signals found',
        real_trading_results: {
          eligible_users: 0,
          orders_placed: 0,
          orders_failed: 0,
          signals_processed: 0
        }
      };
    }

    // Get all users eligible for real trading
    const lemonService = new LemonTradingService();
    const eligibleUsers = await lemonService.getEligibleTradingUsers();
    console.log(`👥 Found ${eligibleUsers.length} users eligible for real trading`);
    console.log(`👥 Eligible user IDs:`, eligibleUsers);
    
    if (eligibleUsers.length === 0) {
      console.log('🚨 NO ELIGIBLE USERS FOUND - Real trading will be skipped!');
      return {
        success: true,
        message: 'No eligible users for real trading',
        real_trading_results: {
          eligible_users: 0,
          orders_placed: 0,
          orders_failed: 0,
          signals_processed: entrySignals.length,
          reason: 'No users eligible for real trading'
        }
      };
    }

    let totalOrdersPlaced = 0;
    let totalOrdersFailed = 0;
    const userOrderResults: any[] = [];
    const whatsappService = new WhatsAppService();

    // Initialize results tracking for each user
    const userResultsMap = new Map<string, {
      user_id: string;
      orders_placed: number;
      orders_failed: number;
      signals_processed: number;
      orders: any[];
    }>();
    
    for (const userId of eligibleUsers) {
      userResultsMap.set(userId, {
        user_id: userId,
        orders_placed: 0,
        orders_failed: 0,
        signals_processed: 0,
        orders: []
      });
    }

    // Process each signal - place orders for ALL users in parallel
    for (const signal of entrySignals) {
      console.log(`\n🎯 Processing signal for ${signal.symbol} - Placing orders for ${eligibleUsers.length} users in parallel...`);
      
      // Create parallel order placement tasks for all eligible users
      const orderPromises = eligibleUsers.map(async (userId) => {
        const userResults = userResultsMap.get(userId)!;
        userResults.signals_processed++;

        try {
          console.log(`  📈 User ${userId}: Checking eligibility for ${signal.symbol}...`);
          
          // Check if user can place new orders
          const eligibilityCheck = await lemonService.canPlaceNewOrder(userId);
          if (!eligibilityCheck.canTrade) {
            console.log(`  ⚠️ User ${userId}: Cannot trade - ${eligibilityCheck.reason}`);
            userResults.orders_failed++;
            return; // Skip this user for this signal
          }

          // Check if user already has an active position for this symbol
          const { data: existingUserPosition } = await supabase
            .from('user_positions')
            .select('id')
            .eq('user_id', userId)
            .eq('symbol', signal.symbol)
            .eq('status', 'ACTIVE')
            .single();

          if (existingUserPosition) {
            console.log(`  ⚠️ User ${userId}: Already has active position for ${signal.symbol}, skipping`);
            userResults.orders_failed++;
            return; // Skip this user for this signal
          }

          // Get the algorithm position ID for linking
          const { data: algoPosition } = await supabase
            .from('algorithm_positions')
            .select('id')
            .eq('symbol', signal.symbol)
            .eq('status', 'ACTIVE')
            .single();

          // Calculate position size based on MTF margin for this stock
          const positionSize = await lemonService.calculatePositionSize(userId, signal.symbol, signal.current_price);
          if (!positionSize || positionSize.quantity === 0) {
            console.log(`  ⚠️ User ${userId}: Cannot calculate position size for ${signal.symbol} - price too high for allocation`);
            userResults.orders_failed++;
            return; // Skip this user for this signal
          }

          console.log(`  💰 User ${userId}: Position size for ${signal.symbol}: ${positionSize.quantity} shares (₹${positionSize.amount.toFixed(2)}) | Margin: ₹${positionSize.marginRequired.toFixed(2)} | Leverage: ${positionSize.leverage.toFixed(2)}x`);

          // Place real MTF order via Lemon API
          console.log(`  🔥 User ${userId}: PLACING BUY ORDER for ${signal.symbol} - ${positionSize.quantity} shares at ₹${signal.current_price}`);
          
          const orderResult = await lemonService.placeOrder(userId, {
            symbol: signal.symbol,
            transaction_type: 'BUY',
            quantity: positionSize.quantity,
            // price omitted for MARKET orders (as per Lemon API documentation)
            order_reason: 'ENTRY_SIGNAL_MTF',
            scanner_signal_id: signal.symbol
          });
          
          // Log market status information
          if (orderResult.market_status && orderResult.is_amo) {
            console.log(`  🌙 User ${userId}: ${signal.symbol} order placed as AMO - will execute at ${orderResult.execution_time}`);
          }

          if (orderResult.success) {
            userResults.orders_placed++;
            totalOrdersPlaced++;
            
            // Create user position (order record already created by placeOrder)
            if (orderResult.order_id) {
              try {
                // Get the order record created by attemptOrderPlacement
                const { data: orderRecord, error: fetchOrderError } = await supabase
                  .from('real_orders')
                  .select('id')
                  .eq('lemon_order_id', orderResult.order_id)
                  .eq('user_id', userId)
                  .single();

                if (fetchOrderError || !orderRecord) {
                  console.error(`❌ Order record not found for ${signal.symbol} (Order ID: ${orderResult.order_id}):`, fetchOrderError);
                  return;
                }

                console.log(`🔥 Creating user position for ${signal.symbol}...`);
                
                // Create the user position
                const { error: positionError } = await supabase
                  .from('user_positions')
                  .insert({
                    user_id: userId,
                    symbol: signal.symbol,
                    entry_order_id: orderRecord.id,
                    entry_price: signal.current_price,
                    entry_quantity: positionSize.quantity,
                    entry_value: positionSize.amount,
                    current_price: signal.current_price,
                    pnl_amount: 0,
                    pnl_percentage: 0,
                    status: orderResult.is_amo ? 'PENDING_AMO' : 'ACTIVE', // Different status for AMO orders
                    trailing_level: 0,
                    margin_required: positionSize.marginRequired,
                    leverage: positionSize.leverage,
                    margin_per_share: positionSize.marginRequired / positionSize.quantity,
                    entry_date: new Date().toISOString().split('T')[0],
                    entry_time: new Date().toISOString(),
                    scanner_signal_id: `USER_${userId}_${signal.symbol}_${Date.now()}`,
                    algorithm_position_id: algoPosition?.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });

                if (positionError) {
                  console.error(`  ❌ User ${userId}: Failed to create position for ${signal.symbol}:`, positionError);
                } else {
                  console.log(`  ✅ User ${userId}: Position created for ${signal.symbol} - ${positionSize.quantity} shares (₹${positionSize.amount.toFixed(0)})${orderResult.is_amo ? ' [AMO-PENDING]' : ''}`);
                }

              } catch (positionCreationError) {
                console.error(`  ❌ User ${userId}: Error creating position for ${signal.symbol}:`, positionCreationError);
              }
            }
            
            userResults.orders.push({
              symbol: signal.symbol,
              quantity: positionSize.quantity,
              price: signal.current_price,
              amount: positionSize.amount,
              order_id: orderResult.order_id,
              status: 'success',
              market_status: orderResult.market_status,
              is_amo: orderResult.is_amo,
              execution_time: orderResult.execution_time
            });

          } else {
            userResults.orders_failed++;
            totalOrdersFailed++;
            
            userResults.orders.push({
              symbol: signal.symbol,
              quantity: positionSize.quantity,
              error: orderResult.error,
              status: 'failed'
            });

            console.log(`  ❌ User ${userId}: Order FAILED for ${signal.symbol} - ${orderResult.error}`);
          }

        } catch (error) {
          console.error(`  ❌ User ${userId}: Error processing ${signal.symbol}:`, error);
          userResults.orders_failed++;
          totalOrdersFailed++;
        }
      });

      // Execute all user orders for this signal in parallel
      console.log(`⚡ Executing ${orderPromises.length} parallel order placements for ${signal.symbol}...`);
      const startTime = Date.now();
      await Promise.all(orderPromises);
      const endTime = Date.now();
      console.log(`✅ Completed ${signal.symbol} orders in ${endTime - startTime}ms (parallel execution)`);
    }

    // After all signals processed, compile results and send WhatsApp notifications
    for (const userId of eligibleUsers) {
      const userResults = userResultsMap.get(userId)!;
      userOrderResults.push(userResults);

      // Send WhatsApp notification to user about their orders
      if (sendWhatsApp && userResults.orders_placed > 0) {
        try {
          // Get user's phone number
          const { data: user } = await lemonService['supabase']
            .from('users')
            .select('phone_number, full_name')
            .eq('id', userId)
            .single();

          if (user?.phone_number) {
            const successfulOrders = userResults.orders.filter(o => o.status === 'success');
            const hasAMO = successfulOrders.some(o => o.is_amo);
            
            const ordersList = successfulOrders.map(o => 
              `${o.symbol}: ${o.quantity} shares @ ₹${o.price} (₹${o.amount.toFixed(0)})${o.is_amo ? ' [AMO]' : ''}`
            ).join('\n');

            const executionInfo = hasAMO 
              ? 'AMO orders will execute at market open tomorrow'
              : `Executed immediately | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`;

            await whatsappService.sendMessage({
              phoneNumber: user.phone_number,
              message1: `Hi ${user.full_name}! MTF trading orders ${hasAMO ? 'placed as AMO' : 'executed'} 🎯`,
              message2: `${userResults.orders_placed} MTF positions entered from daily scan`,
              message3: ordersList,
              message4: `Total MTF investment: ₹${successfulOrders.reduce((sum, o) => sum + o.amount, 0).toFixed(0)} | ${executionInfo}`
            });

            console.log(`📱 Real trading WhatsApp sent to user ${userId}`);
          }
        } catch (whatsappError) {
          console.error(`Failed to send WhatsApp to user ${userId}:`, whatsappError);
        }
      }
    }

    console.log(`✅ Real trading execution completed: ${totalOrdersPlaced} orders placed, ${totalOrdersFailed} failed`);

    return {
      success: true,
      message: 'Real trading signals executed',
      real_trading_results: {
        eligible_users: eligibleUsers.length,
        orders_placed: totalOrdersPlaced,
        orders_failed: totalOrdersFailed,
        signals_processed: entrySignals.length,
        user_results: userOrderResults
      }
    };

  } catch (error) {
    console.error('Real trading execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      real_trading_results: {
        eligible_users: 0,
        orders_placed: 0,
        orders_failed: 0,
        signals_processed: 0
      }
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
      console.log('🔍 Auth check failed:', { received: authHeader, expected: expectedAuth, test: testAuth });
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

    // Check if it's within reasonable time (around 3:15 PM IST) - bypass for testing
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    const isTestAuth = authHeader === testAuth;
    
    if (!isTestAuth && (hour !== 15 || minute < 10 || minute > 20)) {
      return NextResponse.json({ 
        success: false, 
        message: `Skipped: Not market close time (${hour}:${minute.toString().padStart(2, '0')} IST)`,
        timestamp: istTime.toISOString()
      });
    }
    
    if (isTestAuth) {
      console.log('🧪 Running daily scan in TEST MODE - bypassing time restrictions');
    }

    console.log('🕒 Cron: Starting daily scan at 3:15 PM IST...');
    
    // Execute algorithm scan (source of truth) - now uses algorithm_positions table
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement('NSE', true);
    
    // Get entry signals for real trading (algorithm positions already created by scanner)
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');
    console.log(`📊 Found ${entrySignals.length} entry signals for real trading`);
    console.log(`📊 Entry signals details:`, entrySignals.map(s => ({ symbol: s.symbol, price: s.current_price, signal: s.signal })));
    
    if (entrySignals.length === 0) {
      console.log('🚨 NO ENTRY SIGNALS FOUND - No real trading to execute!');
    }
    
    // Execute real trading for eligible users using the same scan results
    const realTradingResults = await executeRealTradingSignals(entrySignals, true);
    console.log(`🚀 Real trading execution result:`, realTradingResults);
    
    console.log('✅ Cron: Daily scan completed successfully (paper + real trading)');
    
    return NextResponse.json({
      success: true,
      message: 'Daily scan executed successfully',
      scan_results: {
        summary: scanResults.summary,
        position_management: scanResults.position_management,
        entry_signals: scanResults.results.filter(r => r.signal === 'ENTRY').map(r => ({
          symbol: r.symbol,
          current_price: r.current_price,
          reasoning: r.reasoning
        }))
      },
      real_trading_results: realTradingResults?.success ? realTradingResults.real_trading_results : { error: realTradingResults?.error || 'Real trading execution failed' },
      timestamp: istTime.toISOString()
    });

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
