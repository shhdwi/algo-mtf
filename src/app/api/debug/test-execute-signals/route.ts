import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { user_id, test_mode = true } = await request.json();

    console.log('🧪 Testing Execute Signals Flow...');

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const debugInfo: any = {
      user_id,
      test_mode,
      steps: []
    };

    // Step 1: Check user eligibility
    console.log('🔍 Step 1: Checking user eligibility...');
    try {
      const eligibilityCheck = await lemonService.canPlaceNewOrder(user_id);
      debugInfo.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: eligibilityCheck.canTrade,
        data: eligibilityCheck,
        message: eligibilityCheck.canTrade ? 'User is eligible for trading' : `User not eligible: ${eligibilityCheck.reason}`
      });

      if (!eligibilityCheck.canTrade) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }
    } catch (error) {
      debugInfo.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return NextResponse.json({ success: false, debug_info: debugInfo });
    }

    // Step 2: Simulate entry signals (mock scanner results)
    console.log('📊 Step 2: Simulating entry signals...');
    const mockSignals = [
      {
        symbol: 'RELIANCE',
        current_price: 2500,
        signal: 'ENTRY',
        reasoning: 'Mock signal for testing'
      },
      {
        symbol: 'INFY',
        current_price: 1500,
        signal: 'ENTRY',
        reasoning: 'Mock signal for testing'
      }
    ];

    debugInfo.steps.push({
      step: 2,
      name: 'Entry Signals Simulation',
      success: true,
      data: { signals_found: mockSignals.length, signals: mockSignals },
      message: `Found ${mockSignals.length} mock entry signals`
    });

    // Step 3: Process each signal
    console.log('🎯 Step 3: Processing signals...');
    const orderResults: any[] = [];
    let ordersPlaced = 0;
    let ordersFailed = 0;

    for (const signal of mockSignals) {
      try {
        console.log(`📈 Processing ${signal.symbol}...`);

        // Calculate position size
        const positionSize = await lemonService.calculatePositionSize(user_id, signal.symbol, signal.current_price);
        
        if (!positionSize || positionSize.quantity === 0) {
          console.log(`⚠️ Cannot calculate position size for ${signal.symbol}`);
          ordersFailed++;
          orderResults.push({
            symbol: signal.symbol,
            status: 'failed',
            error: 'Position size calculation failed'
          });
          continue;
        }

        console.log(`💰 Position size for ${signal.symbol}: ${positionSize.quantity} shares (₹${positionSize.amount.toFixed(2)})`);

        // Place order (real or simulated based on test_mode)
        let orderResult;
        
        if (test_mode) {
          // Simulate order
          orderResult = {
            success: true,
            order_id: `TEST_${signal.symbol}_${Date.now()}`,
            order_status: 'SIMULATED'
          };
        } else {
          // Place real order
          orderResult = await lemonService.placeOrder(user_id, {
            symbol: signal.symbol,
            transaction_type: 'BUY',
            quantity: positionSize.quantity,
            price: signal.current_price,
            order_reason: 'EXECUTE_SIGNALS_TEST',
            scanner_signal_id: `TEST_${signal.symbol}_${Date.now()}`
          });
        }

        if (orderResult.success) {
          ordersPlaced++;
          
          // Create position record (if not test mode)
          if (!test_mode && orderResult.order_id) {
            await lemonService.createRealPosition(user_id, orderResult.order_id, signal.current_price);
          }
          
          orderResults.push({
            symbol: signal.symbol,
            quantity: positionSize.quantity,
            price: signal.current_price,
            amount: positionSize.amount,
            order_id: orderResult.order_id,
            status: 'success',
            test_mode: test_mode
          });

          console.log(`✅ ${test_mode ? 'Simulated' : 'Real'} order placed: ${signal.symbol}`);
        } else {
          ordersFailed++;
          orderResults.push({
            symbol: signal.symbol,
            error: orderResult.error,
            status: 'failed'
          });
          console.log(`❌ Order failed: ${signal.symbol} - ${orderResult.error}`);
        }

      } catch (error) {
        console.error(`Error processing signal ${signal.symbol}:`, error);
        ordersFailed++;
        orderResults.push({
          symbol: signal.symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'failed'
        });
      }
    }

    debugInfo.steps.push({
      step: 3,
      name: 'Signal Processing',
      success: ordersPlaced > 0,
      data: {
        orders_placed: ordersPlaced,
        orders_failed: ordersFailed,
        order_details: orderResults
      },
      message: `Processed ${mockSignals.length} signals: ${ordersPlaced} orders placed, ${ordersFailed} failed`
    });

    const successfulSteps = debugInfo.steps.filter((s: any) => s.success).length;
    const totalSteps = debugInfo.steps.length;
    const isOverallSuccess = ordersPlaced > 0;

    return NextResponse.json({
      success: isOverallSuccess,
      message: `Execute signals test completed: ${successfulSteps}/${totalSteps} steps successful, ${ordersPlaced} orders placed`,
      debug_info: debugInfo,
      summary: {
        total_steps: totalSteps,
        successful_steps: successfulSteps,
        signals_processed: mockSignals.length,
        orders_placed: ordersPlaced,
        orders_failed: ordersFailed,
        test_mode: test_mode,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Execute signals test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
