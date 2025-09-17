import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import UltimateScannerService from '@/services/ultimateScannerService';
import LemonTradingService from '@/services/lemonTradingService';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

interface UserTradingData {
  user_id: string;
  full_name: string;
  phone_number: string;
  total_capital: number;
  allocation_percentage: number;
  max_concurrent_positions: number;
  daily_loss_limit_percentage: number;
  stop_loss_percentage: number;
  is_real_trading_enabled: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { 
      exchange = 'NSE',
      limit_users = null // Limit to specific number of users for testing
    } = await request.json();

    console.log('🧪 Starting DRY RUN daily scan test...');
    
    // Step 1: Run the daily scan (same as production)
    console.log('📊 Step 1: Running daily scan...');
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement(exchange, false);
    const entrySignals = scanResults.results.filter(r => r.signal === 'ENTRY');
    
    console.log(`📊 Found ${entrySignals.length} entry signals:`, 
      entrySignals.map(s => s.symbol).join(', '));

    if (entrySignals.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entry signals found in daily scan',
        data: {
          scan_results: scanResults,
          entry_signals: [],
          user_simulations: []
        }
      });
    }

    // Step 2: Get eligible users (same as production)
    console.log('👥 Step 2: Fetching eligible users...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        phone_number,
        trading_preferences!inner(
          total_capital,
          allocation_percentage,
          max_concurrent_positions,
          daily_loss_limit_percentage,
          stop_loss_percentage
        ),
        is_real_trading_enabled
      `)
      .eq('is_real_trading_enabled', true);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No eligible users found for real trading',
        data: {
          scan_results: scanResults,
          entry_signals: entrySignals,
          user_simulations: []
        }
      });
    }

    // Limit users for testing if specified
    const testUsers = limit_users ? users.slice(0, limit_users) : users;
    console.log(`👥 Testing with ${testUsers.length} users (out of ${users.length} total)`);

    const lemonService = new LemonTradingService();
    const userSimulations = [];

    // Step 3: Simulate trading for each user
    for (const user of testUsers) {
      console.log(`\n🧪 Simulating trades for user: ${user.full_name} (${user.id})`);
      
      const userData: UserTradingData = {
        user_id: user.id,
        full_name: user.full_name,
        phone_number: user.phone_number,
        total_capital: (user.trading_preferences as any).total_capital,
        allocation_percentage: (user.trading_preferences as any).allocation_percentage,
        max_concurrent_positions: (user.trading_preferences as any).max_concurrent_positions,
        daily_loss_limit_percentage: (user.trading_preferences as any).daily_loss_limit_percentage,
        stop_loss_percentage: (user.trading_preferences as any).stop_loss_percentage,
        is_real_trading_enabled: user.is_real_trading_enabled
      };

      const userSimulation = {
        user: userData,
        orders: [] as any[],
        errors: [] as string[],
        summary: {
          total_signals: entrySignals.length,
          attempted_orders: 0,
          successful_simulations: 0,
          failed_simulations: 0,
          total_investment_simulated: 0
        }
      };

      // Step 4: Check if user can trade (same validation as production)
      try {
        const canTradeResult = await lemonService.canPlaceNewOrder(user.id);
        if (!canTradeResult.canTrade) {
          console.log(`❌ User ${user.full_name} cannot trade: ${canTradeResult.reason}`);
          userSimulation.errors.push(`Cannot trade: ${canTradeResult.reason}`);
          userSimulations.push(userSimulation);
          continue;
        }
      } catch (error) {
        console.log(`❌ Error checking trade eligibility for ${user.full_name}:`, error);
        userSimulation.errors.push(`Trade eligibility check failed: ${error}`);
        userSimulations.push(userSimulation);
        continue;
      }

      // Step 5: Simulate orders for each signal
      for (const signal of entrySignals) {
        userSimulation.summary.attempted_orders++;
        
        try {
          console.log(`  📈 Simulating order for ${signal.symbol}...`);
          
          // Calculate position size (same as production)
          const _allocationAmount = (userData.total_capital * userData.allocation_percentage) / 100;
          const positionSizeResult = await lemonService.calculatePositionSize(
            user.id,
            signal.symbol,
            signal.current_price
          );

          if (!positionSizeResult) {
            throw new Error('Position size calculation failed');
          }

          const quantity = positionSizeResult.quantity;
          const investmentAmount = quantity * signal.current_price;

          // DRY RUN: Simulate the order without actually placing it
          const simulatedOrder = {
            symbol: signal.symbol,
            quantity: quantity,
            price: signal.current_price,
            amount: investmentAmount,
            order_id: `DRY_RUN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            status: 'SIMULATED_SUCCESS',
            dry_run: true,
            signal_data: {
              signal: signal.signal,
              symbol: signal.symbol,
              current_price: signal.current_price,
              entry_reason: 'Entry signal detected'
            },
            mtf_info: {
              margin_required: positionSizeResult.marginRequired,
              leverage_used: positionSizeResult.leverage
            },
            timestamp: new Date().toISOString()
          };

          userSimulation.orders.push(simulatedOrder);
          userSimulation.summary.successful_simulations++;
          userSimulation.summary.total_investment_simulated += investmentAmount;

          console.log(`  ✅ Simulated order: ${quantity} shares of ${signal.symbol} at ₹${signal.current_price} (Total: ₹${investmentAmount.toFixed(2)})`);

        } catch (error) {
          console.log(`  ❌ Simulation failed for ${signal.symbol}:`, error);
          userSimulation.errors.push(`${signal.symbol}: ${error}`);
          userSimulation.summary.failed_simulations++;
        }
      }

      userSimulations.push(userSimulation);
      console.log(`📊 User ${user.full_name} simulation complete: ${userSimulation.summary.successful_simulations}/${userSimulation.summary.attempted_orders} successful`);
    }

    // Step 6: Generate summary
    const totalSimulations = userSimulations.reduce((sum, u) => sum + u.summary.successful_simulations, 0);
    const totalInvestment = userSimulations.reduce((sum, u) => sum + u.summary.total_investment_simulated, 0);
    const totalErrors = userSimulations.reduce((sum, u) => sum + u.errors.length, 0);

    console.log(`\n🎯 DRY RUN COMPLETE:`);
    console.log(`   📊 Entry Signals: ${entrySignals.length}`);
    console.log(`   👥 Users Tested: ${testUsers.length}`);
    console.log(`   ✅ Successful Simulations: ${totalSimulations}`);
    console.log(`   💰 Total Investment Simulated: ₹${totalInvestment.toFixed(2)}`);
    console.log(`   ❌ Total Errors: ${totalErrors}`);

    return NextResponse.json({
      success: true,
      message: `DRY RUN completed: ${totalSimulations} orders simulated for ${testUsers.length} users`,
      data: {
        scan_results: scanResults,
        entry_signals: entrySignals,
        user_simulations: userSimulations,
        summary: {
          total_entry_signals: entrySignals.length,
          users_tested: testUsers.length,
          total_users_available: users.length,
          successful_simulations: totalSimulations,
          total_investment_simulated: totalInvestment,
          total_errors: totalErrors,
          dry_run: true,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ DRY RUN Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      dry_run: true
    }, { status: 500 });
  }
}
