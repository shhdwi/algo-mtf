import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { 
      user_id, 
      symbol = 'RELIANCE', 
      quantity: requestedQuantity = 1,
      price = 2500,
      transaction_type = 'BUY',
      test_mode = true 
    } = requestBody;

    let quantity = requestedQuantity;
    const quantityExplicitlyProvided = 'quantity' in requestBody;

    console.log('🧪 Testing Direct Order Placement...');
    console.log('📋 Parameters:', { user_id, symbol, quantity, price, transaction_type, test_mode });

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const debugInfo: any = {
      user_id,
      symbol,
      quantity,
      price,
      transaction_type,
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

    // Step 2: Calculate position size (only if quantity was not explicitly provided)
    if (!quantityExplicitlyProvided) {
      console.log('📊 Step 2: Calculating position size...');
      try {
        const positionSize = await lemonService.calculatePositionSize(user_id, symbol, price);
        if (positionSize) {
          quantity = positionSize.quantity;
          debugInfo.calculated_position = positionSize;
        }
        
        debugInfo.steps.push({
          step: 2,
          name: 'Position Size Calculation',
          success: !!positionSize,
          data: positionSize,
          message: positionSize 
            ? `Calculated position: ${positionSize.quantity} shares, ₹${positionSize.amount.toFixed(2)}`
            : 'Could not calculate position size'
        });

        if (!positionSize) {
          return NextResponse.json({ success: false, debug_info: debugInfo });
        }
      } catch (error) {
        debugInfo.steps.push({
          step: 2,
          name: 'Position Size Calculation',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }
    } else {
      debugInfo.steps.push({
        step: 2,
        name: 'Position Size Calculation',
        success: true,
        data: { quantity, note: 'Using provided quantity' },
        message: `Using provided quantity: ${quantity} shares`
      });
    }

    // Step 3: Place order (simulated or real)
    console.log('🎯 Step 3: Placing order...');
    try {
      let orderResult;
      
      if (test_mode) {
        // Simulate order placement
        orderResult = {
          success: true,
          order_id: `TEST_${Date.now()}`,
          order_status: 'SIMULATED',
          lemon_response: {
            message: 'Test order - not actually placed',
            simulated: true
          }
        };
        
        debugInfo.steps.push({
          step: 3,
          name: 'Order Placement (SIMULATED)',
          success: true,
          data: orderResult,
          message: `✅ SIMULATED: ${transaction_type} order for ${quantity} shares of ${symbol} @ ₹${price}`
        });
      } else {
        // Actually place the order via Lemon API
        orderResult = await lemonService.placeOrder(user_id, {
          symbol,
          transaction_type: transaction_type as 'BUY' | 'SELL',
          quantity,
          price,
          order_reason: 'DIRECT_TEST_ORDER',
          scanner_signal_id: `DIRECT_TEST_${symbol}_${Date.now()}`
        });

        debugInfo.steps.push({
          step: 3,
          name: 'Order Placement (REAL)',
          success: orderResult.success,
          data: orderResult,
          message: orderResult.success 
            ? `✅ REAL: ${transaction_type} order placed for ${quantity} shares of ${symbol} @ ₹${price} | Order ID: ${orderResult.order_id}`
            : `❌ Order failed: ${orderResult.error}`
        });
      }

      // Step 4: Create position record (if order successful)
      if (orderResult.success && orderResult.order_id) {
        console.log('📝 Step 4: Creating position record...');
        try {
          if (!test_mode) {
            await lemonService.createRealPosition(user_id, orderResult.order_id, price);
          }
          
          debugInfo.steps.push({
            step: 4,
            name: 'Position Record Creation',
            success: true,
            data: { order_id: orderResult.order_id, entry_price: price },
            message: test_mode ? 'Position record creation skipped (test mode)' : 'Position record created successfully'
          });

        } catch (error) {
          debugInfo.steps.push({
            step: 4,
            name: 'Position Record Creation',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to create position record'
          });
        }
      }

      debugInfo.final_order_result = orderResult;

    } catch (error) {
      debugInfo.steps.push({
        step: 3,
        name: 'Order Placement',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to place order'
      });
    }

    const successfulSteps = debugInfo.steps.filter((s: any) => s.success).length;
    const totalSteps = debugInfo.steps.length;
    const isOverallSuccess = debugInfo.final_order_result?.success || false;

    return NextResponse.json({
      success: isOverallSuccess,
      message: `Direct order placement test completed: ${successfulSteps}/${totalSteps} steps successful`,
      debug_info: debugInfo,
      summary: {
        total_steps: totalSteps,
        successful_steps: successfulSteps,
        order_placed: isOverallSuccess,
        test_mode: test_mode,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Direct order placement test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
