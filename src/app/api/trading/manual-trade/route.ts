import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';
import { createClient } from '@supabase/supabase-js';

/**
 * Manual Trading API - Place BUY/SELL orders for any user
 * This endpoint allows you to manually execute trades for accounts in the database
 * 
 * @route POST /api/trading/manual-trade
 * @body {
 *   user_id: string (UUID of user in database),
 *   symbol: string (stock symbol, e.g. "RELIANCE"),
 *   transaction_type: "BUY" | "SELL",
 *   quantity?: number (optional for BUY - auto-calculated, required for SELL),
 *   price?: number (optional - defaults to LTP),
 *   order_reason?: string (optional - reason for the trade),
 *   exchange?: string (optional - defaults to NSE),
 *   calculate_position_size?: boolean (optional - auto-calculate quantity for BUY orders)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      symbol,
      transaction_type,
      quantity,
      price,
      order_reason = 'MANUAL_TRADE',
      exchange = 'NSE',
      calculate_position_size = true
    } = body;

    console.log('🔄 Manual Trade Request:', {
      user_id,
      symbol,
      transaction_type,
      quantity,
      price,
      order_reason,
      exchange
    });

    // Validate required fields
    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'symbol is required'
      }, { status: 400 });
    }

    if (!transaction_type || !['BUY', 'SELL'].includes(transaction_type)) {
      return NextResponse.json({
        success: false,
        error: 'transaction_type must be either BUY or SELL'
      }, { status: 400 });
    }

    // Initialize services
    const lemonService = new LemonTradingService();
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Verify user exists and has credentials
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, is_active')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        error: 'User not found in database'
      }, { status: 404 });
    }

    if (!user.is_active) {
      return NextResponse.json({
        success: false,
        error: 'User account is inactive'
      }, { status: 403 });
    }

    // Check if user has API credentials
    const { data: credentials, error: credError } = await supabase
      .from('api_credentials')
      .select('client_id, is_active')
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials) {
      return NextResponse.json({
        success: false,
        error: 'User does not have API credentials configured. Please complete onboarding first.',
        hint: 'User needs to complete trading setup via /api/onboarding/trading-setup'
      }, { status: 400 });
    }

    if (!credentials.is_active) {
      return NextResponse.json({
        success: false,
        error: 'User API credentials are inactive'
      }, { status: 403 });
    }

    console.log(`✅ User verified: ${user.full_name} (${user.email}) - Client ID: ${credentials.client_id}`);

    // Get stock price if not provided
    let stockPrice = price;
    if (!stockPrice) {
      console.log(`📊 Fetching LTP for ${symbol}...`);
      const ltpData = await lemonService.getLTP(symbol, exchange);
      if (!ltpData || !ltpData.last_traded_price) {
        return NextResponse.json({
          success: false,
          error: `Unable to fetch price for ${symbol}. Please provide price manually.`
        }, { status: 400 });
      }
      stockPrice = ltpData.last_traded_price;
      console.log(`✅ Got LTP for ${symbol}: ₹${stockPrice}`);
    }

    // Handle BUY orders
    if (transaction_type === 'BUY') {
      let orderQuantity = quantity;

      // Auto-calculate position size if requested and quantity not provided
      if (calculate_position_size && !orderQuantity) {
        console.log(`📊 Auto-calculating position size for ${symbol}...`);
        
        const positionSize = await lemonService.calculatePositionSize(user_id, symbol, stockPrice);
        
        if (!positionSize || positionSize.quantity === 0) {
          return NextResponse.json({
            success: false,
            error: `Unable to calculate position size for ${symbol}. Stock price may be too high for user's allocation.`,
            hint: 'Provide quantity manually or adjust user trading preferences'
          }, { status: 400 });
        }

        orderQuantity = positionSize.quantity;
        
        console.log(`💰 Position size calculated:`, {
          quantity: orderQuantity,
          total_amount: positionSize.amount,
          margin_required: positionSize.marginRequired,
          leverage: `${positionSize.leverage.toFixed(2)}x`
        });
      }

      // Validate quantity for BUY
      if (!orderQuantity || orderQuantity <= 0) {
        return NextResponse.json({
          success: false,
          error: 'quantity is required for BUY orders when calculate_position_size is false'
        }, { status: 400 });
      }

      // Check if user can place new orders
      const eligibilityCheck = await lemonService.canPlaceNewOrder(user_id);
      if (!eligibilityCheck.canTrade) {
        return NextResponse.json({
          success: false,
          error: `User cannot place BUY order: ${eligibilityCheck.reason}`
        }, { status: 403 });
      }

      // Place BUY order
      console.log(`🛒 Placing BUY order: ${symbol} x ${orderQuantity} @ ₹${stockPrice}`);
      
      const orderResult = await lemonService.placeOrder(user_id, {
        symbol,
        transaction_type: 'BUY',
        quantity: orderQuantity,
        price: stockPrice,
        order_reason
      });

      if (orderResult.success) {
        // Create position in database
        if (orderResult.order_id) {
          // Note: createRealPosition expects the order to already be in real_orders table
          // The placeOrder method already saves it, so we just need to create the position link
          
          await supabase
            .from('user_positions')
            .insert({
              user_id,
              symbol,
              entry_price: stockPrice,
              entry_quantity: orderQuantity,
              current_price: stockPrice,
              status: 'ACTIVE',
              entry_date: new Date().toISOString().split('T')[0],
              entry_time: new Date().toISOString(),
              pnl_amount: 0,
              pnl_percentage: 0,
              trailing_level: 0
            });

          console.log(`✅ Position created for ${symbol}`);
        }

        return NextResponse.json({
          success: true,
          message: 'BUY order placed successfully',
          data: {
            user: {
              id: user.id,
              name: user.full_name,
              email: user.email,
              client_id: credentials.client_id
            },
            order: {
              symbol,
              transaction_type: 'BUY',
              quantity: orderQuantity,
              price: stockPrice,
              order_id: orderResult.order_id,
              order_status: orderResult.order_status,
              market_status: orderResult.market_status,
              is_amo: orderResult.is_amo,
              execution_time: orderResult.execution_time
            },
            estimated_cost: orderQuantity * stockPrice
          },
          lemon_response: orderResult.lemon_response,
          timestamp: new Date().toISOString()
        });
      } else {
        return NextResponse.json({
          success: false,
          error: `BUY order failed: ${orderResult.error}`,
          lemon_response: orderResult.lemon_response
        }, { status: 400 });
      }
    }

    // Handle SELL orders
    if (transaction_type === 'SELL') {
      // For SELL, we need to know what position to close
      // We can either sell a specific position or all positions for a symbol

      if (!quantity) {
        // If quantity not provided, get active position quantity
        const { data: position, error: posError } = await supabase
          .from('user_positions')
          .select('entry_quantity, entry_price, current_price')
          .eq('user_id', user_id)
          .eq('symbol', symbol)
          .eq('status', 'ACTIVE')
          .single();

        if (posError || !position) {
          return NextResponse.json({
            success: false,
            error: `No active position found for ${symbol}. Cannot determine quantity to sell.`,
            hint: 'Provide quantity manually if you want to short sell'
          }, { status: 400 });
        }

        quantity = position.entry_quantity;
        console.log(`📊 Found active position for ${symbol}: ${quantity} shares @ ₹${position.entry_price}`);
      }

      // Validate quantity for SELL
      if (quantity <= 0) {
        return NextResponse.json({
          success: false,
          error: 'quantity must be greater than 0 for SELL orders'
        }, { status: 400 });
      }

      // Use the exit position method which handles everything
      console.log(`📤 Placing SELL order: ${symbol} x ${quantity} @ ₹${stockPrice}`);
      
      const exitResult = await lemonService.exitRealPosition(user_id, symbol, order_reason);

      if (exitResult.success) {
        return NextResponse.json({
          success: true,
          message: 'SELL order placed successfully',
          data: {
            user: {
              id: user.id,
              name: user.full_name,
              email: user.email,
              client_id: credentials.client_id
            },
            order: {
              symbol,
              transaction_type: 'SELL',
              quantity,
              price: exitResult.actual_exit_price || stockPrice,
              order_id: exitResult.order_id,
              order_status: exitResult.order_status,
              market_status: exitResult.market_status,
              is_amo: exitResult.is_amo,
              execution_time: exitResult.execution_time
            },
            pnl: {
              amount: exitResult.actual_pnl_amount,
              percentage: exitResult.actual_pnl_percentage
            },
            estimated_proceeds: quantity * stockPrice,
            position_updated: exitResult.position_updated
          },
          lemon_response: exitResult.lemon_response,
          timestamp: new Date().toISOString()
        });
      } else {
        return NextResponse.json({
          success: false,
          error: `SELL order failed: ${exitResult.error}`,
          lemon_response: exitResult.lemon_response,
          order_placed: exitResult.order_placed,
          requires_manual_intervention: exitResult.requires_manual_intervention
        }, { status: 400 });
      }
    }

    // Should never reach here
    return NextResponse.json({
      success: false,
      error: 'Invalid transaction type'
    }, { status: 400 });

  } catch (error) {
    console.error('❌ Manual trade error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}

