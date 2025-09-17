import { NextRequest, NextResponse } from 'next/server';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';
import WhatsAppService from '@/services/whatsappService';

export async function POST(request: NextRequest) {
  try {
    const { 
      exchange = 'NSE', 
      send_whatsapp = true, 
      test_mode = false,
      entry_signals = null,
      skip_scan = false 
    } = await request.json();

    console.log('🚀 Starting Real Trading Signal Execution...');
    
    let entrySignals;
    let scanResults;

    if (skip_scan && entry_signals) {
      // Use pre-scanned signals from daily scan cron job
      entrySignals = entry_signals;
      scanResults = { summary: { message: 'Using pre-scanned signals from daily scan' } };
      console.log(`📊 Using ${entrySignals.length} pre-scanned entry signals for real trading`);
    } else {
      // Run the ultimate scanner to get entry signals (fallback for direct API calls)
      const scanner = new UltimateScannerService();
      scanResults = await scanner.ultimateScanWithPositionManagement(exchange, false); // Don't send WhatsApp from scanner
      entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');
      console.log(`📊 Found ${entrySignals.length} entry signals for real trading`);
    }

    if (entrySignals.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entry signals found',
        scan_results: scanResults.summary,
        real_trading_results: {
          eligible_users: 0,
          orders_placed: 0,
          orders_failed: 0,
          signals_processed: 0
        }
      });
    }

    // Get all users eligible for real trading
    const lemonService = new LemonTradingService();
    const eligibleUsers = await lemonService.getEligibleTradingUsers();
    console.log(`👥 Found ${eligibleUsers.length} users eligible for real trading`);

    let totalOrdersPlaced = 0;
    let totalOrdersFailed = 0;
    const userOrderResults: any[] = [];
    const whatsappService = new WhatsAppService();

    // Process each eligible user
    for (const userId of eligibleUsers) {
      console.log(`📈 Processing real trading for user: ${userId}`);
      
      const userResults = {
        user_id: userId,
        orders_placed: 0,
        orders_failed: 0,
        signals_processed: 0,
        orders: [] as any[]
      };

      // Process each entry signal for this user
      for (const signal of entrySignals) {
        userResults.signals_processed++;

        try {
          // Check if user can place new orders
          const eligibilityCheck = await lemonService.canPlaceNewOrder(userId);
          if (!eligibilityCheck.canTrade) {
            console.log(`⚠️ User ${userId} cannot trade: ${eligibilityCheck.reason}`);
            userResults.orders_failed++;
            continue;
          }

          // Calculate position size based on MTF margin for this stock
          const positionSize = await lemonService.calculatePositionSize(userId, signal.symbol, signal.current_price);
          if (!positionSize || positionSize.quantity === 0) {
            console.log(`⚠️ Cannot calculate position size for ${signal.symbol} - price too high for allocation`);
            userResults.orders_failed++;
            continue;
          }

          console.log(`💰 MTF Position size for ${signal.symbol}: ${positionSize.quantity} shares (₹${positionSize.amount.toFixed(2)}) | Margin: ₹${positionSize.marginRequired.toFixed(2)} | Leverage: ${positionSize.leverage.toFixed(2)}x`);

          // Place MTF order via Lemon API (real or simulated based on test_mode)
          let orderResult;
          
          if (test_mode) {
            // Simulate order placement for testing
            orderResult = {
              success: true,
              order_id: `TEST_${signal.symbol}_${Date.now()}`,
              order_status: 'SIMULATED'
            };
            console.log(`🧪 SIMULATED: MTF order for ${signal.symbol} (test mode)`);
          } else {
            // Place real MTF order via Lemon API
            orderResult = await lemonService.placeOrder(userId, {
              symbol: signal.symbol,
              transaction_type: 'BUY',
              quantity: positionSize.quantity,
              price: signal.current_price,
              order_reason: 'ENTRY_SIGNAL_MTF',
              scanner_signal_id: signal.symbol // Use symbol as signal ID for now
            });
          }

          if (orderResult.success) {
            userResults.orders_placed++;
            totalOrdersPlaced++;
            
            // Create real position (skip in test mode)
            if (!test_mode && orderResult.order_id) {
              await lemonService.createRealPosition(userId, orderResult.order_id, signal.current_price);
            }
            
            userResults.orders.push({
              symbol: signal.symbol,
              quantity: positionSize.quantity,
              price: signal.current_price,
              amount: positionSize.amount,
              order_id: orderResult.order_id,
              status: 'success',
              test_mode: test_mode
            });

            console.log(`✅ Real order placed: ${signal.symbol} for user ${userId}`);

          } else {
            userResults.orders_failed++;
            totalOrdersFailed++;
            
            userResults.orders.push({
              symbol: signal.symbol,
              quantity: positionSize.quantity,
              error: orderResult.error,
              status: 'failed'
            });

            console.log(`❌ Real order failed: ${signal.symbol} for user ${userId} - ${orderResult.error}`);
          }

        } catch (error) {
          console.error(`Error processing signal ${signal.symbol} for user ${userId}:`, error);
          userResults.orders_failed++;
          totalOrdersFailed++;
        }
      }

      userOrderResults.push(userResults);

      // Send WhatsApp notification to user about their orders
      if (send_whatsapp && userResults.orders_placed > 0) {
        try {
          // Get user's phone number
          const { data: user } = await lemonService['supabase']
            .from('users')
            .select('phone_number, full_name')
            .eq('id', userId)
            .single();

          if (user?.phone_number) {
            const successfulOrders = userResults.orders.filter(o => o.status === 'success');
            const ordersList = successfulOrders.map(o => 
              `${o.symbol}: ${o.quantity} shares @ ₹${o.price} (₹${o.amount.toFixed(0)})`
            ).join('\n');

            await whatsappService.sendMessage({
              phoneNumber: user.phone_number,
              message1: `Hi ${user.full_name}! MTF trading orders placed 🎯`,
              message2: `${userResults.orders_placed} MTF positions entered from daily scan`,
              message3: ordersList,
              message4: `Total MTF investment: ₹${successfulOrders.reduce((sum, o) => sum + o.amount, 0).toFixed(0)} | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
            });

            console.log(`📱 Real trading WhatsApp sent to user ${userId}`);
          }
        } catch (whatsappError) {
          console.error(`Failed to send WhatsApp to user ${userId}:`, whatsappError);
        }
      }
    }

    console.log(`✅ Real trading execution completed: ${totalOrdersPlaced} orders placed, ${totalOrdersFailed} failed`);

    return NextResponse.json({
      success: true,
      message: 'Real trading signals executed',
      scan_results: scanResults.summary,
      real_trading_results: {
        eligible_users: eligibleUsers.length,
        orders_placed: totalOrdersPlaced,
        orders_failed: totalOrdersFailed,
        signals_processed: entrySignals.length,
        user_results: userOrderResults,
        test_mode: test_mode
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Real trading execution error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
