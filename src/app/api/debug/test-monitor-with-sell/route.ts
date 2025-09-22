import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';
import ExitMonitoringService from '@/services/exitMonitoringService';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { user_id, execute_sell = false } = await request.json();
    
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    console.log('🔍 Testing monitor with SELL execution for user:', user_id);

    // Get active real positions for this user
    const { data: realPositions, error: positionsError } = await supabase
      .from('real_positions')
      .select('*')
      .eq('user_id', user_id)
      .eq('status', 'ACTIVE');

    if (positionsError) {
      return NextResponse.json({ error: positionsError.message }, { status: 500 });
    }

    const results = [];

    for (const position of realPositions || []) {
      console.log(`🔍 Testing position: ${position.symbol}`);
      
      // Get user's trading preferences for stop loss percentage
      const { data: userPrefs } = await supabase
        .from('trading_preferences')
        .select('stop_loss_percentage')
        .eq('user_id', position.user_id)
        .single();

      const userStopLossPercentage = userPrefs?.stop_loss_percentage || 2.5;
      console.log(`⚙️ User stop loss setting: ${userStopLossPercentage}%`);
      
      // Fetch live current price
      const ltpData = await lemonService.getLTP(position.symbol, 'NSE');
      const livePrice = ltpData?.last_traded_price || position.current_price;
      
      // Calculate live PnL
      const livePnlAmount = (livePrice - position.entry_price) * position.entry_quantity;
      const livePnlPercentage = ((livePrice - position.entry_price) / position.entry_price) * 100;

      // Update position with live data
      await lemonService.updateRealPositionPnL(position.user_id, position.symbol, livePrice);

      // Create paper position for exit analysis
      const paperPosition = {
        id: position.id,
        symbol: position.symbol,
        entry_price: position.entry_price,
        current_price: livePrice,
        trailing_level: position.trailing_level,
        entry_date: position.entry_date,
        entry_time: position.entry_time,
        pnl_amount: livePnlAmount,
        pnl_percentage: livePnlPercentage,
        status: position.status,
        created_at: position.created_at,
        updated_at: position.updated_at
      };

      // Analyze for exit conditions using user's stop loss percentage
      const exitMonitor = new ExitMonitoringService();
      const exitAnalysis = await exitMonitor['analyzePositionForExit'](paperPosition, userStopLossPercentage);

      let sellResult = null;
      
      if (exitAnalysis.status === 'EXIT' && exitAnalysis.exitSignal && execute_sell) {
        console.log(`🚨 Executing SELL order for ${position.symbol} due to: ${exitAnalysis.exitSignal.exitReason}`);
        
        // Execute the SELL order
        sellResult = await lemonService.exitRealPosition(
          position.user_id,
          position.symbol,
          exitAnalysis.exitSignal.exitType
        );
        
        console.log(`📤 SELL order result:`, sellResult);
      }

      results.push({
        symbol: position.symbol,
        entry_price: position.entry_price,
        live_price: livePrice,
        live_pnl_amount: livePnlAmount,
        live_pnl_percentage: livePnlPercentage,
        exit_analysis: {
          status: exitAnalysis.status,
          should_exit: exitAnalysis.status === 'EXIT',
          exit_reason: exitAnalysis.exitSignal?.exitReason || 'No exit signal',
          exit_type: exitAnalysis.exitSignal?.exitType || null
        },
        user_stop_loss_percentage: userStopLossPercentage,
        stop_loss_threshold: -userStopLossPercentage,
        should_trigger_stop_loss: livePnlPercentage <= -userStopLossPercentage,
        sell_executed: execute_sell && exitAnalysis.status === 'EXIT',
        sell_result: sellResult
      });
    }

    return NextResponse.json({
      success: true,
      user_id,
      execute_sell,
      positions_analyzed: results.length,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in monitor test with sell:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Monitor Test with SELL API',
    description: 'Tests the monitor functionality and optionally executes SELL orders',
    usage: 'POST with { "user_id": "uuid", "execute_sell": true/false }',
    example: {
      user_id: '053c5dc0-0dce-457c-9051-77dde1e4e5da',
      execute_sell: true
    }
  });
}
