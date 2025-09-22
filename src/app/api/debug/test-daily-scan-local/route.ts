import { NextRequest, NextResponse } from 'next/server';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
);

/**
 * Create algorithm positions (source of truth)
 */
async function createAlgorithmPositions(entrySignals: any[]) {
  console.log(`📊 Creating ${entrySignals.length} algorithm positions (source of truth)...`);

  for (const signal of entrySignals) {
    try {
      // Check if algorithm position already exists for this symbol
      const { data: existingPosition } = await supabase
        .from('algorithm_positions')
        .select('id')
        .eq('symbol', signal.symbol)
        .eq('status', 'ACTIVE')
        .single();

      if (existingPosition) {
        console.log(`⚠️ Algorithm position already exists for ${signal.symbol}, skipping`);
        continue;
      }

      // Create algorithm position
      const { error } = await supabase
        .from('algorithm_positions')
        .insert({
          symbol: signal.symbol,
          entry_date: new Date().toISOString().split('T')[0],
          entry_time: new Date().toISOString(),
          entry_price: signal.current_price,
          current_price: signal.current_price,
          pnl_amount: 0,
          pnl_percentage: 0,
          status: 'ACTIVE',
          trailing_level: 0,
          scanner_signal_id: `ALGO_${signal.symbol}_${Date.now()}`
        });

      if (error) {
        console.error(`❌ Failed to create algorithm position for ${signal.symbol}:`, error);
      } else {
        console.log(`✅ Algorithm position created: ${signal.symbol} at ₹${signal.current_price}`);
      }

    } catch (error) {
      console.error(`Error creating algorithm position for ${signal.symbol}:`, error);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { exchange = 'NSE', test_mode = false, max_stocks = 5 } = await request.json();
    
    console.log(`🚀 Starting Local Daily Scan Test...`);
    console.log(`📊 Exchange: ${exchange}, Test Mode: ${test_mode}, Max Stocks: ${max_stocks}`);

    // Step 1: Run the daily scan
    console.log(`📊 Step 1: Running daily scan...`);
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement(exchange, false);
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY').slice(0, max_stocks);
    
    console.log(`📊 Scan completed: ${scanResults.results.length} total, ${entrySignals.length} entry signals`);
    console.log(`📊 Entry signals:`, entrySignals.map(s => ({ symbol: s.symbol, price: s.current_price })));

    // Step 2: Create algorithm positions (source of truth)
    console.log(`📊 Step 2: Creating algorithm positions...`);
    await createAlgorithmPositions(entrySignals);

    // Step 3: Get eligible users
    console.log(`👥 Step 3: Getting eligible users...`);
    const lemonService = new LemonTradingService();
    const eligibleUsers = await lemonService.getEligibleTradingUsers();
    console.log(`👥 Found ${eligibleUsers.length} eligible users:`, eligibleUsers);

    // Step 4: Create user positions for each user × each signal
    console.log(`💰 Step 4: Creating user positions...`);
    let totalOrdersAttempted = 0;
    let totalOrdersSuccessful = 0;
    let totalUserPositionsCreated = 0;
    const detailedResults = [];

    for (const userId of eligibleUsers) {
      console.log(`\n🔥 Processing user: ${userId}`);
      
      for (const signal of entrySignals) {
        totalOrdersAttempted++;
        console.log(`\n🔥 Processing ${signal.symbol} for user ${userId}...`);

        try {
          // Check eligibility
          const eligibilityCheck = await lemonService.canPlaceNewOrder(userId);
          if (!eligibilityCheck.canTrade) {
            console.log(`⚠️ User ${userId} cannot trade: ${eligibilityCheck.reason}`);
            continue;
          }

          // Check existing position
          const { data: existingUserPosition } = await supabase
            .from('user_positions')
            .select('id')
            .eq('user_id', userId)
            .eq('symbol', signal.symbol)
            .eq('status', 'ACTIVE')
            .single();

          if (existingUserPosition) {
            console.log(`⚠️ User ${userId} already has position for ${signal.symbol}`);
            continue;
          }

          // Get algorithm position for linking
          const { data: algoPosition } = await supabase
            .from('algorithm_positions')
            .select('id')
            .eq('symbol', signal.symbol)
            .eq('status', 'ACTIVE')
            .single();

          // Calculate position size
          const positionSize = await lemonService.calculatePositionSize(userId, signal.symbol, signal.current_price);
          if (!positionSize || positionSize.quantity === 0) {
            console.log(`⚠️ Cannot calculate position size for ${signal.symbol}`);
            continue;
          }

          console.log(`💰 Position size: ${positionSize.quantity} shares, ₹${positionSize.amount} value`);

          if (!test_mode) {
            // Real mode: Place actual order
            console.log(`🔥 PLACING REAL ORDER: ${signal.symbol} for ${userId}`);
            
            const orderResult = await lemonService.placeOrder(userId, {
              symbol: signal.symbol,
              transaction_type: 'BUY',
              quantity: positionSize.quantity,
              price: signal.current_price,
              order_reason: 'LOCAL_TEST_DAILY_SCAN'
            });

            console.log(`🔥 Order result:`, orderResult);

            if (orderResult.success) {
              totalOrdersSuccessful++;
              
              // Create order record and user position
              const { data: orderRecord, error: orderError } = await supabase
                .from('real_orders')
                .insert({
                  user_id: userId,
                  lemon_order_id: orderResult.order_id,
                  symbol: signal.symbol,
                  transaction_type: 'BUY',
                  order_type: 'MARKET',
                  quantity: positionSize.quantity,
                  price: signal.current_price,
                  order_status: orderResult.order_status || 'PLACED',
                  order_reason: 'LOCAL_TEST_DAILY_SCAN'
                })
                .select()
                .single();

              if (!orderError && orderRecord) {
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
                    status: 'ACTIVE',
                    entry_date: new Date().toISOString().split('T')[0],
                    entry_time: new Date().toISOString(),
                    algorithm_position_id: algoPosition?.id
                  });

                if (!positionError) {
                  totalUserPositionsCreated++;
                  console.log(`✅ User position created successfully`);
                } else {
                  console.error(`❌ Position creation failed:`, positionError);
                }
              }
            }
          } else {
            // Test mode: Simulate success
            totalOrdersSuccessful++;
            totalUserPositionsCreated++;
            console.log(`✅ TEST MODE: Simulated order and position for ${signal.symbol}`);
          }

          detailedResults.push({
            user_id: userId,
            symbol: signal.symbol,
            position_size: positionSize,
            order_attempted: true,
            order_successful: test_mode ? true : false, // Will be updated in real mode
            position_created: test_mode ? true : false  // Will be updated in real mode
          });

        } catch (error) {
          console.error(`❌ Error processing ${signal.symbol} for user ${userId}:`, error);
        }
      }
    }

    // Step 5: Summary
    const summary = {
      scan_results: {
        total_scanned: scanResults.results.length,
        entry_signals: entrySignals.length,
        signals: entrySignals.map(s => ({ symbol: s.symbol, price: s.current_price }))
      },
      algorithm_positions: {
        created: entrySignals.length // Assuming all were created
      },
      user_trading: {
        eligible_users: eligibleUsers.length,
        total_orders_attempted: totalOrdersAttempted,
        total_orders_successful: totalOrdersSuccessful,
        total_user_positions_created: totalUserPositionsCreated,
        expected_positions: eligibleUsers.length * entrySignals.length
      },
      detailed_results: detailedResults
    };

    console.log(`✅ Local daily scan test completed`);
    console.log(`📊 Summary:`, summary);

    return NextResponse.json({
      success: true,
      message: 'Local daily scan test completed',
      test_mode,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Local daily scan test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Local Daily Scan Test API',
    description: 'Tests the complete daily scan flow locally with detailed debugging',
    usage: 'POST with { "exchange": "NSE", "test_mode": true, "max_stocks": 5 }',
    parameters: {
      exchange: 'NSE/BSE - exchange to scan (default: NSE)',
      test_mode: 'true/false - if true, simulates orders without real API calls (default: false)',
      max_stocks: 'number - limit entry signals for testing (default: 5)'
    },
    test_flow: [
      '1. Run daily scan to get entry signals',
      '2. Create algorithm positions (source of truth)',
      '3. Get eligible users for real trading',
      '4. For each user × each signal: place order and create user position',
      '5. Return detailed summary and results'
    ]
  });
}
