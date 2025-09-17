import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { 
      user_id, 
      symbol = 'RELIANCE', 
      test_mode = true,
      transaction_type = 'BUY',
      price_override 
    } = await request.json();

    console.log('🧪 Starting Order Placement Test...');
    console.log('📋 Test Parameters:', { user_id, symbol, test_mode, transaction_type, price_override });

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required for testing'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const testResults: any = {
      user_id,
      symbol,
      test_mode,
      steps: [],
      final_result: null
    };

    // Step 1: Check if user exists and has trading setup
    console.log('🔍 Step 1: Checking user eligibility...');
    try {
      const eligibilityCheck = await lemonService.canPlaceNewOrder(user_id);
      testResults.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: eligibilityCheck.canTrade,
        data: eligibilityCheck,
        message: eligibilityCheck.canTrade ? 'User is eligible for trading' : `User not eligible: ${eligibilityCheck.reason}`
      });

      if (!eligibilityCheck.canTrade) {
        testResults.final_result = 'FAILED_ELIGIBILITY';
        return NextResponse.json({ success: false, test_results: testResults });
      }
    } catch (error) {
      testResults.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to check user eligibility'
      });
      testResults.final_result = 'ERROR_ELIGIBILITY';
      return NextResponse.json({ success: false, test_results: testResults });
    }

    // Step 2: Get current stock price (or use override)
    console.log('💰 Step 2: Getting stock price...');
    let stockPrice = price_override;
    if (!stockPrice) {
      // For testing, we'll use a mock price since we don't have live market data in test
      const mockPrices: { [key: string]: number } = {
        'RELIANCE': 2500,
        'INFY': 1500,
        'TCS': 3200,
        'HDFCBANK': 1600,
        'ICICIBANK': 1200
      };
      stockPrice = mockPrices[symbol] || 1000;
    }

    testResults.steps.push({
      step: 2,
      name: 'Stock Price Fetch',
      success: true,
      data: { symbol, price: stockPrice, source: price_override ? 'override' : 'mock' },
      message: `Stock price: ₹${stockPrice}`
    });

    // Step 3: Calculate position size based on MTF margin
    console.log('📊 Step 3: Calculating MTF position size...');
    try {
      const positionSize = await lemonService.calculatePositionSize(user_id, symbol, stockPrice);
      testResults.steps.push({
        step: 3,
        name: 'MTF Position Size Calculation',
        success: !!positionSize,
        data: positionSize,
        message: positionSize 
          ? `Position: ${positionSize.quantity} shares, ₹${positionSize.amount.toFixed(2)} (Margin: ₹${positionSize.marginRequired.toFixed(2)}, Leverage: ${positionSize.leverage.toFixed(2)}x)`
          : 'Could not calculate position size'
      });

      if (!positionSize) {
        testResults.final_result = 'FAILED_POSITION_CALC';
        return NextResponse.json({ success: false, test_results: testResults });
      }

      // Step 4: Test API credentials and access token
      console.log('🔑 Step 4: Testing Lemon API credentials...');
      try {
        const { data: credentials } = await lemonService['supabase']
          .from('api_credentials')
          .select('client_id, public_key_encrypted, private_key_encrypted')
          .eq('user_id', user_id)
          .single();
        const accessToken = await lemonService['getAccessToken'](user_id);
        
        testResults.steps.push({
          step: 4,
          name: 'API Credentials & Token Test',
          success: !!(credentials && accessToken),
          data: { 
            has_credentials: !!credentials,
            has_access_token: !!accessToken,
            client_id: credentials?.client_id || 'Not found'
          },
          message: credentials && accessToken ? 'API credentials and token valid' : 'Missing credentials or token'
        });

        if (!credentials || !accessToken) {
          testResults.final_result = 'FAILED_API_CREDENTIALS';
          return NextResponse.json({ success: false, test_results: testResults });
        }

      } catch (error) {
        testResults.steps.push({
          step: 4,
          name: 'API Credentials & Token Test',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Failed to validate API credentials'
        });
        testResults.final_result = 'ERROR_API_CREDENTIALS';
        return NextResponse.json({ success: false, test_results: testResults });
      }

      // Step 5: Place test order (or simulate if test_mode = true)
      console.log('🎯 Step 5: Placing order...');
      try {
        let orderResult;
        
        if (test_mode) {
          // Simulate order placement without actually calling Lemon API
          orderResult = {
            success: true,
            order_id: `TEST_${Date.now()}`,
            order_status: 'SIMULATED',
            lemon_response: {
              message: 'Test order - not actually placed',
              simulated: true
            }
          };
          
          testResults.steps.push({
            step: 5,
            name: 'Order Placement (SIMULATED)',
            success: true,
            data: orderResult,
            message: `✅ SIMULATED: ${transaction_type} order for ${positionSize.quantity} shares of ${symbol} @ ₹${stockPrice}`
          });
        } else {
          // Actually place the order via Lemon API
          orderResult = await lemonService.placeOrder(user_id, {
            symbol,
            transaction_type: transaction_type as 'BUY' | 'SELL',
            quantity: positionSize.quantity,
            price: stockPrice,
            order_reason: 'TEST_ORDER',
            scanner_signal_id: `TEST_${symbol}_${Date.now()}`
          });

          testResults.steps.push({
            step: 5,
            name: 'Order Placement (REAL)',
            success: orderResult.success,
            data: orderResult,
            message: orderResult.success 
              ? `✅ REAL: ${transaction_type} order placed for ${positionSize.quantity} shares of ${symbol} @ ₹${stockPrice}`
              : `❌ Order failed: ${orderResult.error}`
          });
        }

        // Step 6: Create position record (if order successful)
        if (orderResult.success && orderResult.order_id) {
          console.log('📝 Step 6: Creating position record...');
          try {
            if (!test_mode) {
              await lemonService.createRealPosition(user_id, orderResult.order_id, stockPrice);
            }
            
            testResults.steps.push({
              step: 6,
              name: 'Position Record Creation',
              success: true,
              data: { order_id: orderResult.order_id, entry_price: stockPrice },
              message: test_mode ? 'Position record creation skipped (test mode)' : 'Position record created successfully'
            });

            testResults.final_result = test_mode ? 'SUCCESS_SIMULATED' : 'SUCCESS_REAL';

          } catch (error) {
            testResults.steps.push({
              step: 6,
              name: 'Position Record Creation',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              message: 'Failed to create position record'
            });
            testResults.final_result = 'ERROR_POSITION_RECORD';
          }
        } else {
          testResults.final_result = 'FAILED_ORDER_PLACEMENT';
        }

      } catch (error) {
        testResults.steps.push({
          step: 5,
          name: 'Order Placement',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: 'Failed to place order'
        });
        testResults.final_result = 'ERROR_ORDER_PLACEMENT';
      }

    } catch (error) {
      testResults.steps.push({
        step: 3,
        name: 'MTF Position Size Calculation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to calculate position size'
      });
      testResults.final_result = 'ERROR_POSITION_CALC';
    }

    // Generate summary
    const successfulSteps = testResults.steps.filter((s: any) => s.success).length;
    const totalSteps = testResults.steps.length;
    const isOverallSuccess = testResults.final_result?.startsWith('SUCCESS');

    console.log(`🏁 Test completed: ${successfulSteps}/${totalSteps} steps successful`);
    console.log(`📊 Final result: ${testResults.final_result}`);

    return NextResponse.json({
      success: isOverallSuccess,
      message: `Order placement test completed: ${successfulSteps}/${totalSteps} steps successful`,
      test_results: testResults,
      summary: {
        total_steps: totalSteps,
        successful_steps: successfulSteps,
        final_result: testResults.final_result,
        test_mode: test_mode,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Order placement test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      message: 'Test execution failed'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Order Placement Test API',
    usage: {
      method: 'POST',
      required_params: ['user_id'],
      optional_params: {
        symbol: 'Stock symbol (default: RELIANCE)',
        test_mode: 'true/false (default: true - simulates order)',
        transaction_type: 'BUY/SELL (default: BUY)',
        price_override: 'Override stock price for testing'
      },
      example: {
        user_id: 'your-user-id',
        symbol: 'RELIANCE',
        test_mode: true,
        transaction_type: 'BUY',
        price_override: 2500
      }
    },
    test_modes: {
      simulated: 'test_mode: true - Tests all logic without placing real orders',
      real: 'test_mode: false - Places actual orders via Lemon API (USE CAREFULLY!)'
    }
  });
}
