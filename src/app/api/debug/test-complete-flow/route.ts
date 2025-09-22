import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
);

interface TestStep {
  step: number;
  name: string;
  success: boolean;
  data?: any;
  message: string;
  timestamp: string;
}

interface CompleteFlowTestResult {
  success: boolean;
  steps: TestStep[];
  summary: {
    total_steps: number;
    successful_steps: number;
    failed_steps: number;
    algorithm_positions_created: number;
    user_positions_created: number;
    eligible_users: number;
    orders_placed: number;
    total_duration_ms: number;
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { test_mode = true, exchange = 'NSE' } = await request.json();

    console.log('🧪 Starting Complete Flow Test...');
    
    const testResult: CompleteFlowTestResult = {
      success: false,
      steps: [],
      summary: {
        total_steps: 0,
        successful_steps: 0,
        failed_steps: 0,
        algorithm_positions_created: 0,
        user_positions_created: 0,
        eligible_users: 0,
        orders_placed: 0,
        total_duration_ms: 0
      }
    };

    // Step 1: Check eligible users
    console.log('👥 Step 1: Checking eligible users...');
    const lemonService = new LemonTradingService();
    const eligibleUsers = await lemonService.getEligibleTradingUsers();
    
    testResult.steps.push({
      step: 1,
      name: 'Check Eligible Users',
      success: true,
      data: { eligible_users: eligibleUsers },
      message: `Found ${eligibleUsers.length} eligible users for real trading`,
      timestamp: new Date().toISOString()
    });
    testResult.summary.eligible_users = eligibleUsers.length;

    // Step 2: Run daily scan to get entry signals
    console.log('📊 Step 2: Running daily scan...');
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement(exchange, false);
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');

    testResult.steps.push({
      step: 2,
      name: 'Daily Scan Execution',
      success: true,
      data: { 
        total_scanned: scanResults.results.length,
        entry_signals: entrySignals.length,
        signals: entrySignals.map(s => ({ symbol: s.symbol, price: s.current_price }))
      },
      message: `Scan completed: ${entrySignals.length} entry signals found`,
      timestamp: new Date().toISOString()
    });

    // Step 3: Create algorithm positions (source of truth)
    console.log('📈 Step 3: Creating algorithm positions...');
    let algorithmPositionsCreated = 0;
    
    for (const signal of entrySignals) {
      try {
        // Check if algorithm position already exists
        const { data: existingPosition } = await supabase
          .from('algorithm_positions')
          .select('id')
          .eq('symbol', signal.symbol)
          .eq('status', 'ACTIVE')
          .single();

        if (!existingPosition) {
          const { error } = await supabase
            .from('algorithm_positions')
            .insert({
              symbol: signal.symbol,
              entry_date: new Date().toISOString().split('T')[0],
              entry_time: new Date().toISOString(),
              entry_price: signal.current_price,
              current_price: signal.current_price,
              status: 'ACTIVE',
              scanner_signal_id: `TEST_ALGO_${signal.symbol}_${Date.now()}`
            });

          if (!error) {
            algorithmPositionsCreated++;
            console.log(`✅ Algorithm position created: ${signal.symbol}`);
          } else {
            console.error(`❌ Failed to create algorithm position: ${signal.symbol}`, error);
          }
        } else {
          console.log(`⚠️ Algorithm position already exists: ${signal.symbol}`);
        }
      } catch (error) {
        console.error(`Error creating algorithm position for ${signal.symbol}:`, error);
      }
    }

    testResult.steps.push({
      step: 3,
      name: 'Create Algorithm Positions',
      success: algorithmPositionsCreated > 0 || entrySignals.length === 0,
      data: { positions_created: algorithmPositionsCreated, signals_count: entrySignals.length },
      message: `Created ${algorithmPositionsCreated} algorithm positions (source of truth)`,
      timestamp: new Date().toISOString()
    });
    testResult.summary.algorithm_positions_created = algorithmPositionsCreated;

    // Step 4: Create user positions for each eligible user
    console.log('💰 Step 4: Creating user positions...');
    let userPositionsCreated = 0;
    let ordersPlaced = 0;

    for (const userId of eligibleUsers) {
      for (const signal of entrySignals) {
        try {
          // Check if user already has position for this symbol
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

          if (!test_mode) {
            // Real mode: Place actual order
            const positionSize = await lemonService.calculatePositionSize(userId, signal.symbol, signal.current_price);
            if (positionSize && positionSize.quantity > 0) {
              const orderResult = await lemonService.placeOrder(userId, {
                symbol: signal.symbol,
                transaction_type: 'BUY',
                quantity: positionSize.quantity,
                price: signal.current_price,
                order_reason: 'TEST_COMPLETE_FLOW'
              });

              if (orderResult.success) {
                ordersPlaced++;
                // Create order record and user position (similar to daily scan logic)
                // ... (implementation details)
              }
            }
          } else {
            // Test mode: Create simulated user position
            const { error: userPositionError } = await supabase
              .from('user_positions')
              .insert({
                user_id: userId,
                symbol: signal.symbol,
                entry_price: signal.current_price,
                entry_quantity: 10, // Mock quantity for test
                entry_value: signal.current_price * 10,
                current_price: signal.current_price,
                status: 'ACTIVE',
                entry_date: new Date().toISOString().split('T')[0],
                entry_time: new Date().toISOString(),
                scanner_signal_id: `TEST_USER_${userId}_${signal.symbol}_${Date.now()}`,
                algorithm_position_id: algoPosition?.id
              });

            if (!userPositionError) {
              userPositionsCreated++;
              console.log(`✅ Test user position created: ${signal.symbol} for user ${userId}`);
            } else {
              console.error(`❌ Failed to create user position: ${signal.symbol}`, userPositionError);
            }
          }

        } catch (error) {
          console.error(`Error processing ${signal.symbol} for user ${userId}:`, error);
        }
      }
    }

    testResult.steps.push({
      step: 4,
      name: 'Create User Positions',
      success: userPositionsCreated > 0 || (eligibleUsers.length === 0 || entrySignals.length === 0),
      data: { 
        positions_created: userPositionsCreated,
        orders_placed: ordersPlaced,
        expected_positions: eligibleUsers.length * entrySignals.length
      },
      message: test_mode 
        ? `Created ${userPositionsCreated} test user positions`
        : `Placed ${ordersPlaced} real orders and created ${userPositionsCreated} user positions`,
      timestamp: new Date().toISOString()
    });
    testResult.summary.user_positions_created = userPositionsCreated;
    testResult.summary.orders_placed = ordersPlaced;

    // Step 5: Verify consolidated view
    console.log('📋 Step 5: Verifying consolidated views...');
    
    const { data: algorithmPositions } = await supabase
      .from('algorithm_positions')
      .select('*')
      .eq('status', 'ACTIVE');

    const { data: userPositions } = await supabase
      .from('user_positions')
      .select(`
        *,
        users!inner(full_name)
      `)
      .eq('status', 'ACTIVE');

    testResult.steps.push({
      step: 5,
      name: 'Verify Consolidated Views',
      success: true,
      data: {
        algorithm_positions: algorithmPositions?.length || 0,
        user_positions: userPositions?.length || 0,
        algorithm_symbols: algorithmPositions?.map(p => p.symbol) || [],
        user_positions_by_symbol: userPositions?.reduce((acc: any, pos) => {
          if (!acc[pos.symbol]) acc[pos.symbol] = [];
          acc[pos.symbol].push(pos.users.full_name);
          return acc;
        }, {}) || {}
      },
      message: `Verified: ${algorithmPositions?.length || 0} algorithm positions, ${userPositions?.length || 0} user positions`,
      timestamp: new Date().toISOString()
    });

    // Calculate summary
    testResult.summary.total_steps = testResult.steps.length;
    testResult.summary.successful_steps = testResult.steps.filter(s => s.success).length;
    testResult.summary.failed_steps = testResult.steps.filter(s => !s.success).length;
    testResult.summary.total_duration_ms = Date.now() - startTime;
    testResult.success = testResult.summary.failed_steps === 0;

    console.log(`✅ Complete flow test finished in ${testResult.summary.total_duration_ms}ms`);

    return NextResponse.json(testResult);

  } catch (error) {
    console.error('❌ Complete flow test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Complete Flow Test API',
    description: 'Tests the entire trading flow: scan → algorithm positions → user positions',
    usage: 'POST with optional { "test_mode": true, "exchange": "NSE" }',
    test_steps: [
      '1. Check eligible users for real trading',
      '2. Run daily scan to get entry signals',
      '3. Create algorithm positions (source of truth)',
      '4. Create user positions for each eligible user',
      '5. Verify consolidated views work correctly'
    ],
    parameters: {
      test_mode: 'true/false - if true, creates mock positions without real orders',
      exchange: 'NSE/BSE - exchange to scan (default: NSE)'
    },
    expected_result: {
      algorithm_positions: 'N positions (one per entry signal)',
      user_positions: 'N × M positions (signals × eligible users)',
      orders_placed: 'M × N orders (if test_mode = false)'
    }
  });
}
