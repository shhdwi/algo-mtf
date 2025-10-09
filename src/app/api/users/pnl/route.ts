import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Get all users with their trading preferences
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        phone_number,
        is_active,
        created_at,
        trading_preferences (
          total_capital,
          allocation_percentage,
          max_concurrent_positions,
          daily_loss_limit_percentage,
          stop_loss_percentage,
          is_real_trading_enabled
        )
      `)
      .order('full_name', { ascending: true });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch users'
      }, { status: 500 });
    }

    // For each user, calculate their PnL from user_positions
    const userPnLData = await Promise.all(
      (users || []).map(async (user) => {
        // Get all positions for this user
        const { data: positions, error: positionsError } = await supabase
          .from('user_positions')
          .select('*')
          .eq('user_id', user.id);

        if (positionsError) {
          console.error(`Error fetching positions for user ${user.id}:`, positionsError);
          return {
            user_id: user.id,
            user_name: user.full_name,
            email: user.email,
            is_active: user.is_active,
            error: 'Failed to fetch positions'
          };
        }

        const allPositions = positions || [];
        const activePositions = allPositions.filter(p => p.status === 'ACTIVE');
        const exitedPositions = allPositions.filter(p => p.status === 'EXITED');

        // Calculate PnL
        const realizedPnL = exitedPositions.reduce((sum, p) => {
          const pnl = (p.exit_price - p.entry_price) * p.entry_quantity;
          return sum + pnl;
        }, 0);

        const unrealizedPnL = activePositions.reduce((sum, p) => {
          const pnl = (p.current_price - p.entry_price) * p.entry_quantity;
          return sum + pnl;
        }, 0);

        const totalPnL = realizedPnL + unrealizedPnL;

        // Calculate capital deployed (using margin required, not full position value)
        const capitalDeployed = activePositions.reduce((sum, p) => {
          return sum + (p.margin_required || (p.entry_price * p.entry_quantity * 0.20));
        }, 0);

        // Calculate total investment (including exited positions - based on margin)
        const totalInvestment = allPositions.reduce((sum, p) => {
          return sum + (p.margin_required || (p.entry_price * p.entry_quantity * 0.20));
        }, 0);

        // Win/Loss statistics
        const winningTrades = exitedPositions.filter(p => p.pnl_amount > 0).length;
        const losingTrades = exitedPositions.filter(p => p.pnl_amount < 0).length;
        const winRate = exitedPositions.length > 0 ? (winningTrades / exitedPositions.length * 100) : 0;

        // Average PnL per trade
        const avgPnLPerTrade = exitedPositions.length > 0 
          ? realizedPnL / exitedPositions.length 
          : 0;

        // Best and worst trades
        const bestTrade = exitedPositions.length > 0
          ? exitedPositions.reduce((best, current) => {
              const currentPnL = (current.exit_price - current.entry_price) * current.entry_quantity;
              const bestPnL = (best.exit_price - best.entry_price) * best.entry_quantity;
              return currentPnL > bestPnL ? current : best;
            }, exitedPositions[0])
          : null;

        const worstTrade = exitedPositions.length > 0
          ? exitedPositions.reduce((worst, current) => {
              const currentPnL = (current.exit_price - current.entry_price) * current.entry_quantity;
              const worstPnL = (worst.exit_price - worst.entry_price) * worst.entry_quantity;
              return currentPnL < worstPnL ? current : worst;
            }, exitedPositions[0])
          : null;

        return {
          user_id: user.id,
          user_name: user.full_name,
          email: user.email,
          phone_number: user.phone_number,
          is_active: user.is_active,
          is_real_trading_enabled: (user.trading_preferences as any)?.[0]?.is_real_trading_enabled || false,
          total_capital: (user.trading_preferences as any)?.[0]?.total_capital || 0,
          
          // Position counts
          total_positions: allPositions.length,
          active_positions: activePositions.length,
          exited_positions: exitedPositions.length,
          
          // PnL metrics
          realized_pnl: realizedPnL,
          unrealized_pnl: unrealizedPnL,
          total_pnl: totalPnL,
          
          // Capital metrics
          capital_deployed: capitalDeployed,
          total_investment: totalInvestment,
          
          // Performance metrics
          winning_trades: winningTrades,
          losing_trades: losingTrades,
          win_rate: winRate,
          avg_pnl_per_trade: avgPnLPerTrade,
          
          // Best/Worst trades
          best_trade: bestTrade ? {
            symbol: bestTrade.symbol,
            entry_price: bestTrade.entry_price,
            exit_price: bestTrade.exit_price,
            pnl: (bestTrade.exit_price - bestTrade.entry_price) * bestTrade.entry_quantity,
            pnl_percentage: bestTrade.pnl_percentage
          } : null,
          worst_trade: worstTrade ? {
            symbol: worstTrade.symbol,
            entry_price: worstTrade.entry_price,
            exit_price: worstTrade.exit_price,
            pnl: (worstTrade.exit_price - worstTrade.entry_price) * worstTrade.entry_quantity,
            pnl_percentage: worstTrade.pnl_percentage
          } : null,
          
          // All positions (sorted by entry time, most recent first)
          all_positions: allPositions
            .sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime())
            .map(p => {
              const pnl_amount = p.status === 'EXITED' 
                ? (p.exit_price - p.entry_price) * p.entry_quantity
                : (p.current_price - p.entry_price) * p.entry_quantity;
              
              const margin = p.margin_required || (p.entry_price * p.entry_quantity * 0.20);
              const margin_pnl_percentage = margin > 0 ? (pnl_amount / margin) * 100 : 0;
              
              return {
                symbol: p.symbol,
                status: p.status,
                entry_date: p.entry_date,
                entry_time: p.entry_time,
                entry_price: p.entry_price,
                current_price: p.current_price,
                exit_price: p.exit_price,
                exit_date: p.exit_date,
                exit_time: p.exit_time,
                exit_reason: p.exit_reason,
                quantity: p.entry_quantity,
                pnl_amount: pnl_amount,
                pnl_percentage: p.pnl_percentage, // Original position PnL%
                margin_pnl_percentage: margin_pnl_percentage, // PnL% based on margin
                trailing_level: p.trailing_level,
                margin_required: p.margin_required,
                leverage: p.leverage,
                position_value: p.entry_price * p.entry_quantity
              };
            })
        };
      })
    );

    // Calculate overall statistics
    const overallStats = {
      total_users: userPnLData.length,
      active_users: userPnLData.filter(u => u.is_active).length,
      trading_enabled_users: userPnLData.filter(u => u.is_real_trading_enabled).length,
      total_pnl: userPnLData.reduce((sum, u) => sum + (u.total_pnl || 0), 0),
      total_realized_pnl: userPnLData.reduce((sum, u) => sum + (u.realized_pnl || 0), 0),
      total_unrealized_pnl: userPnLData.reduce((sum, u) => sum + (u.unrealized_pnl || 0), 0),
      total_capital_deployed: userPnLData.reduce((sum, u) => sum + (u.capital_deployed || 0), 0),
      total_positions: userPnLData.reduce((sum, u) => sum + (u.total_positions || 0), 0),
      best_performing_user: userPnLData.reduce((best, current) => 
        (current.total_pnl || 0) > (best?.total_pnl || 0) ? current : best, userPnLData[0]),
      worst_performing_user: userPnLData.reduce((worst, current) => 
        (current.total_pnl || 0) < (worst?.total_pnl || 0) ? current : worst, userPnLData[0])
    };

    return NextResponse.json({
      success: true,
      data: {
        users: userPnLData,
        overall_stats: overallStats
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching user PnL:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

