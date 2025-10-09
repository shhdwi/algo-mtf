import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const symbol = searchParams.get('symbol');

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Build query for positions (algorithm and user positions)
    let algorithmQuery = supabase
      .from('algorithm_positions')
      .select(`
        id,
        symbol,
        entry_date,
        entry_time,
        entry_price,
        current_price,
        exit_date,
        exit_time,
        exit_price,
        exit_reason,
        pnl_amount,
        pnl_percentage,
        status,
        trailing_level,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    let userQuery = supabase
      .from('user_positions')
      .select(`
        id,
        user_id,
        symbol,
        entry_date,
        entry_time,
        entry_price,
        current_price,
        exit_date,
        exit_time,
        exit_price,
        exit_reason,
        pnl_amount,
        pnl_percentage,
        status,
        trailing_level,
        entry_quantity,
        entry_order_id,
        exit_order_id,
        created_at,
        updated_at,
        users!inner(full_name, phone_number)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (userId) {
      userQuery = userQuery.eq('user_id', userId);
    }

    if (dateFrom) {
      algorithmQuery = algorithmQuery.gte('entry_date', dateFrom);
      userQuery = userQuery.gte('entry_date', dateFrom);
    }

    if (dateTo) {
      algorithmQuery = algorithmQuery.lte('entry_date', dateTo);
      userQuery = userQuery.lte('entry_date', dateTo);
    }

    if (symbol) {
      algorithmQuery = algorithmQuery.eq('symbol', symbol);
      userQuery = userQuery.eq('symbol', symbol);
    }

    // Execute queries
    const [algorithmResult, userResult] = await Promise.all([
      algorithmQuery,
      userQuery
    ]);

    if (algorithmResult.error) {
      console.error('Error fetching algorithm positions:', algorithmResult.error);
    }

    if (userResult.error) {
      console.error('Error fetching user positions:', userResult.error);
    }

    const algorithmTrades = algorithmResult.data || [];
    const userTrades = userResult.data || [];

    // Transform and combine trades
    const allTrades = [
      ...algorithmTrades.map(trade => ({
        ...trade,
        trade_type: 'PAPER',
        user_name: 'Algorithm',
        quantity: 1, // Algorithm positions use 1 share for percentage tracking
        total_investment: trade.entry_price || 0,
        total_exit_value: trade.exit_price || trade.current_price || 0,
        absolute_pnl: trade.pnl_amount || 0,
        percentage_pnl: trade.pnl_percentage || 0
      })),
      ...userTrades.map(trade => ({
        ...trade,
        trade_type: 'REAL',
        user_name: (trade.users as any)?.full_name || 'Unknown User',
        quantity: trade.entry_quantity || 0,
        total_investment: (trade.entry_price || 0) * (trade.entry_quantity || 0),
        total_exit_value: (trade.exit_price || trade.current_price || 0) * (trade.entry_quantity || 0),
        absolute_pnl: trade.pnl_amount ? trade.pnl_amount * (trade.entry_quantity || 0) : 0,
        percentage_pnl: trade.pnl_percentage || 0
      }))
    ];

    // Sort by creation date (newest first)
    allTrades.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Calculate summary statistics
    const summary = {
      total_trades: allTrades.length,
      paper_trades: algorithmTrades.length,
      real_trades: userTrades.length,
      active_trades: allTrades.filter(t => t.status === 'ACTIVE').length,
      exited_trades: allTrades.filter(t => t.status === 'EXITED').length,
      stopped_trades: allTrades.filter(t => t.status === 'STOPPED').length,
      
      // PnL Statistics
      total_pnl: allTrades.reduce((sum, t) => sum + (t.absolute_pnl || 0), 0),
      paper_pnl: algorithmTrades.reduce((sum, t) => sum + (t.pnl_amount || 0), 0),
      real_pnl: userTrades.reduce((sum, t) => sum + ((t.pnl_amount || 0) * (t.entry_quantity || 0)), 0),
      
      // Win/Loss Statistics
      winning_trades: allTrades.filter(t => (t.absolute_pnl || 0) > 0).length,
      losing_trades: allTrades.filter(t => (t.absolute_pnl || 0) < 0).length,
      breakeven_trades: allTrades.filter(t => (t.absolute_pnl || 0) === 0).length,
      
      // Investment Statistics
      total_investment: allTrades.reduce((sum, t) => sum + (t.total_investment || 0), 0),
      total_exit_value: allTrades.reduce((sum, t) => sum + (t.total_exit_value || 0), 0),
      
      // Performance Metrics
      win_rate: allTrades.length > 0 ? (allTrades.filter(t => (t.absolute_pnl || 0) > 0).length / allTrades.length * 100) : 0,
      avg_pnl_per_trade: allTrades.length > 0 ? allTrades.reduce((sum, t) => sum + (t.absolute_pnl || 0), 0) / allTrades.length : 0,
      avg_percentage_pnl: allTrades.length > 0 ? allTrades.reduce((sum, t) => sum + (t.percentage_pnl || 0), 0) / allTrades.length : 0,
      
      // Best and Worst Trades
      best_trade: allTrades.reduce((best, current) => 
        (current.absolute_pnl || 0) > (best?.absolute_pnl || 0) ? current : best, allTrades[0]),
      worst_trade: allTrades.reduce((worst, current) => 
        (current.absolute_pnl || 0) < (worst?.absolute_pnl || 0) ? current : worst, allTrades[0]),
      
      // Symbol Performance
      symbol_performance: allTrades.reduce((acc: any, trade) => {
        if (!acc[trade.symbol]) {
          acc[trade.symbol] = {
            symbol: trade.symbol,
            total_trades: 0,
            total_pnl: 0,
            winning_trades: 0,
            losing_trades: 0
          };
        }
        acc[trade.symbol].total_trades++;
        acc[trade.symbol].total_pnl += trade.absolute_pnl || 0;
        if ((trade.absolute_pnl || 0) > 0) acc[trade.symbol].winning_trades++;
        if ((trade.absolute_pnl || 0) < 0) acc[trade.symbol].losing_trades++;
        return acc;
      }, {}),
      
      // Monthly Performance
      monthly_performance: allTrades.reduce((acc: any, trade) => {
        const month = new Date(trade.created_at).toISOString().slice(0, 7); // YYYY-MM
        if (!acc[month]) {
          acc[month] = {
            month,
            total_trades: 0,
            total_pnl: 0,
            winning_trades: 0,
            losing_trades: 0
          };
        }
        acc[month].total_trades++;
        acc[month].total_pnl += trade.absolute_pnl || 0;
        if ((trade.absolute_pnl || 0) > 0) acc[month].winning_trades++;
        if ((trade.absolute_pnl || 0) < 0) acc[month].losing_trades++;
        return acc;
      }, {})
    };

    // Convert objects to arrays for easier frontend consumption
    summary.symbol_performance = Object.values(summary.symbol_performance);
    summary.monthly_performance = Object.values(summary.monthly_performance);

    return NextResponse.json({
      success: true,
      data: {
        trades: allTrades.slice(0, limit),
        summary,
        pagination: {
          total: allTrades.length,
          limit,
          offset,
          has_more: allTrades.length > offset + limit
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching trade history:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
