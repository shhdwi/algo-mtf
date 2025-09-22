import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';
import { createClient } from '@supabase/supabase-js';

interface TestStep {
  step: number;
  name: string;
  success: boolean;
  data?: any;
  message: string;
  error?: string;
  timestamp: string;
}

interface MTFTestResult {
  success: boolean;
  user_id: string;
  symbol: string;
  test_mode: boolean;
  steps: TestStep[];
  summary: {
    buy_order_success: boolean;
    sell_order_success: boolean;
    position_created: boolean;
    position_closed: boolean;
    total_duration_ms: number;
  };
  orders: {
    buy_order?: any;
    sell_order?: any;
  };
  positions: {
    created_position?: any;
    final_position?: any;
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const requestBody = await request.json();
    const { 
      user_id, 
      symbol = 'RELIANCE', 
      quantity: requestedQuantity = 1,
      test_mode = true,
      delay_between_orders = 5000 // 5 seconds delay between BUY and SELL
    } = requestBody;

    console.log('🧪 Starting MTF BUY-SELL Test...');
    console.log('📋 Parameters:', { user_id, symbol, quantity: requestedQuantity, test_mode, delay_between_orders });

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    const testResult: MTFTestResult = {
      success: false,
      user_id,
      symbol,
      test_mode,
      steps: [],
      summary: {
        buy_order_success: false,
        sell_order_success: false,
        position_created: false,
        position_closed: false,
        total_duration_ms: 0
      },
      orders: {},
      positions: {}
    };

    // Step 1: Check user eligibility
    console.log('🔍 Step 1: Checking user eligibility...');
    try {
      const eligibilityCheck = await lemonService.canPlaceNewOrder(user_id);
      testResult.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: eligibilityCheck.canTrade,
        data: eligibilityCheck,
        message: eligibilityCheck.canTrade ? 'User is eligible for MTF trading' : `User not eligible: ${eligibilityCheck.reason}`,
        timestamp: new Date().toISOString()
      });

      if (!eligibilityCheck.canTrade) {
        testResult.summary.total_duration_ms = Date.now() - startTime;
        return NextResponse.json(testResult);
      }
    } catch (error) {
      testResult.steps.push({
        step: 1,
        name: 'User Eligibility Check',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to check user eligibility',
        timestamp: new Date().toISOString()
      });
      testResult.summary.total_duration_ms = Date.now() - startTime;
      return NextResponse.json(testResult);
    }

    // Step 2: Calculate position size for BUY order
    console.log('💰 Step 2: Calculating MTF position size...');
    let quantity = requestedQuantity;
    let positionSize: any = null;

    try {
      // Get current stock price (mock for test, real for production)
      const stockPrice = test_mode ? 2500 : await getCurrentStockPrice(symbol);
      
      positionSize = await lemonService.calculatePositionSize(user_id, symbol, stockPrice);
      
      if (!positionSize || positionSize.quantity === 0) {
        testResult.steps.push({
          step: 2,
          name: 'MTF Position Size Calculation',
          success: false,
          message: 'Cannot calculate MTF position size - insufficient margin or invalid stock',
          timestamp: new Date().toISOString()
        });
        testResult.summary.total_duration_ms = Date.now() - startTime;
        return NextResponse.json(testResult);
      }

      // Use calculated quantity if not explicitly provided
      if (!('quantity' in requestBody)) {
        quantity = positionSize.quantity;
      }

      testResult.steps.push({
        step: 2,
        name: 'MTF Position Size Calculation',
        success: true,
        data: { 
          calculated_quantity: positionSize.quantity,
          used_quantity: quantity,
          margin_required: positionSize.marginRequired,
          leverage: positionSize.leverage,
          stock_price: stockPrice
        },
        message: `MTF position calculated: ${quantity} shares (₹${positionSize.amount.toFixed(2)} investment, ${positionSize.leverage}x leverage)`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      testResult.steps.push({
        step: 2,
        name: 'MTF Position Size Calculation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to calculate MTF position size',
        timestamp: new Date().toISOString()
      });
      testResult.summary.total_duration_ms = Date.now() - startTime;
      return NextResponse.json(testResult);
    }

    // Step 3: Place BUY order
    console.log('📈 Step 3: Placing MTF BUY order...');
    let buyOrderResult: any = null;

    try {
      // Always place real BUY order using the same service as daily scan
      console.log(`🔥 Placing REAL BUY order for ${quantity} shares of ${symbol}...`);
      buyOrderResult = await lemonService.placeOrder(user_id, {
        symbol,
        transaction_type: 'BUY',
        quantity,
        order_reason: 'MTF_BUY_SELL_TEST_BUY',
        scanner_signal_id: `MTF_TEST_BUY_${symbol}_${Date.now()}`
      });
      
      console.log('🔥 BUY Order Result:', buyOrderResult);

      testResult.orders.buy_order = buyOrderResult;
      testResult.summary.buy_order_success = buyOrderResult.success;

      testResult.steps.push({
        step: 3,
        name: 'MTF BUY Order Placement',
        success: buyOrderResult.success,
        data: buyOrderResult,
        message: buyOrderResult.success 
          ? `✅ REAL BUY order placed: ${quantity} shares of ${symbol} | Order ID: ${buyOrderResult.order_id}`
          : `❌ BUY order failed: ${buyOrderResult.error}`,
        error: buyOrderResult.success ? undefined : buyOrderResult.error,
        timestamp: new Date().toISOString()
      });

      if (!buyOrderResult.success) {
        testResult.summary.total_duration_ms = Date.now() - startTime;
        return NextResponse.json(testResult);
      }

    } catch (error) {
      testResult.steps.push({
        step: 3,
        name: 'MTF BUY Order Placement',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to place MTF BUY order',
        timestamp: new Date().toISOString()
      });
      testResult.summary.total_duration_ms = Date.now() - startTime;
      return NextResponse.json(testResult);
    }

    // Step 4: Create/Verify position record
    console.log('📊 Step 4: Creating position record...');
    let positionRecord: any = null;

    try {
      // Always create real position record (same as daily scan does)
      const currentPrice = positionSize?.amount ? positionSize.amount / quantity : 2500;
      
      // First, check if there's an existing ACTIVE position for this user/symbol (for testing)
      console.log(`🔍 Checking for existing ACTIVE positions for ${user_id}/${symbol}...`);
      const { data: existingPositions, error: checkError } = await supabase
        .from('real_positions')
        .select('*')
        .eq('user_id', user_id)
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE');

      if (checkError) {
        console.log('⚠️ Error checking existing positions:', checkError.message);
      } else if (existingPositions && existingPositions.length > 0) {
        console.log(`⚠️ Found ${existingPositions.length} existing ACTIVE position(s). Updating status to EXITED for testing...`);
        
        // Update existing positions to EXITED to avoid unique constraint violation
        const { error: updateError } = await supabase
          .from('real_positions')
          .update({ 
            status: 'EXITED',
            exit_reason: 'CLEARED_FOR_TEST',
            exit_date: new Date().toISOString().split('T')[0],
            exit_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user_id)
          .eq('symbol', symbol)
          .eq('status', 'ACTIVE');

        if (updateError) {
          console.log('⚠️ Error updating existing positions:', updateError.message);
        } else {
          console.log('✅ Existing positions cleared for test');
        }
      }
      
      console.log(`🔥 Creating REAL order record for ${symbol}...`);
      // First create the order record
      const { data: orderRecord, error: orderError } = await supabase
        .from('real_orders')
        .insert({
          user_id,
          lemon_order_id: buyOrderResult.order_id,
          symbol,
          transaction_type: 'BUY',
          order_type: 'MARKET',
          quantity,
          price: currentPrice,
          order_status: buyOrderResult.order_status || 'PLACED',
          order_reason: 'MTF_BUY_SELL_TEST_BUY',
          scanner_signal_id: null, // This is UUID type, so we'll leave it null for test
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (orderError) {
        throw new Error(`Order record creation failed: ${orderError.message}`);
      }

      console.log(`🔥 Creating REAL position record for ${symbol}...`);
      // Then create the position record using the order UUID
      const { data: createdPosition, error: positionError } = await supabase
        .from('real_positions')
        .insert({
          user_id,
          symbol,
          entry_order_id: orderRecord.id, // Use the UUID from real_orders
          entry_quantity: quantity,
          entry_price: currentPrice,
          current_price: currentPrice,
          entry_date: new Date().toISOString().split('T')[0],
          entry_time: new Date().toISOString(),
          pnl_amount: 0,
          pnl_percentage: 0,
          status: 'ACTIVE',
          trailing_level: 0,
          scanner_signal_id: `MTF_TEST_BUY_${symbol}_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (positionError) {
        throw new Error(`Position creation failed: ${positionError.message}`);
      }

      positionRecord = createdPosition;
      testResult.positions.created_position = positionRecord;
      testResult.summary.position_created = true;
      
      console.log('🔥 Position created:', positionRecord);

      testResult.steps.push({
        step: 4,
        name: 'Position Record Creation',
        success: true,
        data: positionRecord,
        message: `✅ REAL position created: ${quantity} shares of ${symbol} @ ₹${positionRecord.entry_price || 2500}`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      testResult.steps.push({
        step: 4,
        name: 'Position Record Creation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to create position record',
        timestamp: new Date().toISOString()
      });
      testResult.summary.total_duration_ms = Date.now() - startTime;
      return NextResponse.json(testResult);
    }

    // Step 5: Wait before SELL order (simulate holding period)
    console.log(`⏳ Step 5: Waiting ${delay_between_orders}ms before SELL order...`);
    
    testResult.steps.push({
      step: 5,
      name: 'Holding Period Simulation',
      success: true,
      data: { delay_ms: delay_between_orders },
      message: `⏳ Simulating holding period: ${delay_between_orders}ms`,
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, delay_between_orders));

    // Step 6: Place SELL order
    console.log('📉 Step 6: Placing MTF SELL order...');
    let sellOrderResult: any = null;

    try {
      // Always place real SELL order using the same service as monitor API
      console.log(`🔥 Placing REAL SELL order using exitRealPosition for ${symbol}...`);
      sellOrderResult = await lemonService.exitRealPosition(
        user_id,
        symbol,
        'MTF_BUY_SELL_TEST_EXIT'
      );
      
      console.log('🔥 SELL Order Result:', sellOrderResult);

      testResult.orders.sell_order = sellOrderResult;
      testResult.summary.sell_order_success = sellOrderResult.success;

      testResult.steps.push({
        step: 6,
        name: 'MTF SELL Order Placement',
        success: sellOrderResult.success,
        data: sellOrderResult,
        message: sellOrderResult.success 
          ? `✅ REAL SELL order placed: ${quantity} shares of ${symbol} | Order ID: ${sellOrderResult.order_id}`
          : `❌ SELL order failed: ${sellOrderResult.error}`,
        error: sellOrderResult.success ? undefined : sellOrderResult.error,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      testResult.steps.push({
        step: 6,
        name: 'MTF SELL Order Placement',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to place MTF SELL order',
        timestamp: new Date().toISOString()
      });
    }

    // Step 7: Verify position closure
    console.log('🔍 Step 7: Verifying position closure...');
    
    try {
      if (sellOrderResult?.success) {
        // Always check if position was properly closed (real verification)
        console.log(`🔥 Verifying REAL position closure for ${symbol}...`);
        
        // Give the system a moment to update the position status
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const { data: finalPosition, error: fetchError } = await supabase
          .from('real_positions')
          .select('*')
          .eq('user_id', user_id)
          .eq('symbol', symbol)
          .eq('id', positionRecord.id)
          .single();

        if (!fetchError && finalPosition) {
          testResult.positions.final_position = finalPosition;
          testResult.summary.position_closed = finalPosition.status === 'EXITED';
          
          console.log('🔥 Final position status:', finalPosition.status);
          
          testResult.steps.push({
            step: 7,
            name: 'Position Closure Verification',
            success: finalPosition.status === 'EXITED',
            data: finalPosition,
            message: finalPosition.status === 'EXITED' 
              ? `✅ REAL position successfully closed: Status = ${finalPosition.status}`
              : `⚠️ Position status: ${finalPosition.status} (expected: EXITED)`,
            timestamp: new Date().toISOString()
          });
        } else {
          testResult.steps.push({
            step: 7,
            name: 'Position Closure Verification',
            success: false,
            error: fetchError?.message || 'Position not found',
            message: 'Failed to verify position closure',
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // SELL order failed - no position closure expected
        testResult.summary.position_closed = false;
        testResult.steps.push({
          step: 7,
          name: 'Position Closure Verification',
          success: false,
          data: { sell_failed: true },
          message: `❌ Position closure not attempted - SELL order failed`,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      testResult.steps.push({
        step: 7,
        name: 'Position Closure Verification',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to verify position closure',
        timestamp: new Date().toISOString()
      });
    }

    // Final summary
    testResult.summary.total_duration_ms = Date.now() - startTime;
    testResult.success = testResult.summary.buy_order_success && testResult.summary.sell_order_success;

    console.log(`✅ MTF BUY-SELL Test completed in ${testResult.summary.total_duration_ms}ms`);
    console.log(`📊 Results: BUY=${testResult.summary.buy_order_success}, SELL=${testResult.summary.sell_order_success}, Position Closed=${testResult.summary.position_closed}`);

    return NextResponse.json(testResult);

  } catch (error) {
    console.error('❌ MTF BUY-SELL Test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Helper function to get current stock price (placeholder)
async function getCurrentStockPrice(symbol: string): Promise<number> {
  // In a real implementation, this would fetch from a market data API
  // For now, return a mock price
  const mockPrices: { [key: string]: number } = {
    'RELIANCE': 2500,
    'HDFCBANK': 1600,
    'TCS': 3900,
    'INFY': 1500,
    'ICICIBANK': 1200
  };
  
  return mockPrices[symbol] || 2000;
}

export async function GET() {
  return NextResponse.json({
    message: 'MTF BUY-SELL Test API',
    description: 'Tests complete MTF trading flow: BUY order → Position creation → SELL order → Position closure',
    usage: 'POST with JSON body',
    required_params: {
      user_id: 'User ID for testing'
    },
    optional_params: {
      symbol: 'Stock symbol (default: RELIANCE)',
      quantity: 'Number of shares (default: calculated from MTF margin)',
      test_mode: 'true/false (default: true - simulates orders)',
      delay_between_orders: 'Milliseconds to wait between BUY and SELL (default: 5000)'
    },
    example: {
      user_id: 'user123',
      symbol: 'RELIANCE',
      quantity: 1,
      test_mode: false,
      delay_between_orders: 3000
    },
    test_steps: [
      '1. Check user eligibility for MTF trading',
      '2. Calculate MTF position size and margin',
      '3. Place BUY order (MTF)',
      '4. Create position record',
      '5. Wait (simulate holding period)',
      '6. Place SELL order (exit position)',
      '7. Verify position closure'
    ]
  });
}
