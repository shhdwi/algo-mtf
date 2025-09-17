import { NextRequest, NextResponse } from 'next/server';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';
import WhatsAppService from '@/services/whatsappService';

/**
 * Execute real trading signals directly (no HTTP call)
 */
async function executeRealTradingSignals(entrySignals: any[], sendWhatsApp: boolean = true) {
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

          // Place real MTF order via Lemon API
          const orderResult = await lemonService.placeOrder(userId, {
            symbol: signal.symbol,
            transaction_type: 'BUY',
            quantity: positionSize.quantity,
            price: signal.current_price,
            order_reason: 'ENTRY_SIGNAL_MTF',
            scanner_signal_id: signal.symbol
          });

          if (orderResult.success) {
            userResults.orders_placed++;
            totalOrdersPlaced++;
            
            // Create real position
            if (orderResult.order_id) {
              await lemonService.createRealPosition(userId, orderResult.order_id, signal.current_price);
            }
            
            userResults.orders.push({
              symbol: signal.symbol,
              quantity: positionSize.quantity,
              price: signal.current_price,
              amount: positionSize.amount,
              order_id: orderResult.order_id,
              status: 'success'
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
    
    // Execute paper trading (existing system)
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement('NSE', true);
    
    // Execute real trading for eligible users using the same scan results
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');
    const realTradingResults = await executeRealTradingSignals(entrySignals, true);
    
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
      real_trading_results: realTradingResults.success ? realTradingResults.real_trading_results : { error: realTradingResults.error },
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
