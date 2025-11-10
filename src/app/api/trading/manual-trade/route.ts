import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';
import { createClient } from '@supabase/supabase-js';

/**
 * Manual Trading API - Execute BUY/SELL orders (Equity & Options)
 * No position management, no database updates - just execute trades
 * 
 * @route POST /api/trading/manual-trade
 * 
 * EQUITY ORDERS:
 * @body {
 *   user_id: string (UUID of user in database),
 *   symbol: string (stock symbol, e.g. "RELIANCE"),
 *   transaction_type: "BUY" | "SELL",
 *   quantity: number (REQUIRED - number of shares to buy/sell),
 *   price?: number (optional - for limit orders, omit for market orders),
 *   order_type?: "MARKET" | "LIMIT" | "STOP_LOSS" | "STOP_LOSS_MARKET",
 *   product_type?: "DELIVERY" | "INTRADAY" | "MARGIN" | "MTF",
 *   exchange?: "NSE" | "BSE" (default: NSE),
 *   amo?: boolean (After Market Order - default: false),
 *   order_reason?: string (optional - reason for the trade)
 * }
 * 
 * OPTIONS ORDERS:
 * @body {
 *   user_id: string,
 *   symbol: string (e.g. "NIFTY", "BANKNIFTY"),
 *   transaction_type: "BUY" | "SELL",
 *   quantity: number,
 *   contract_type: "OPT" | "FUT",
 *   expiry: string (dd-mm-yyyy format, e.g. "31-07-2025"),
 *   strike_price?: string (required for options, e.g. "25100"),
 *   option_type?: "CE" | "PE" (required for options),
 *   price?: number (optional),
 *   order_type?: "MARKET" | "LIMIT",
 *   product_type?: "DELIVERY" | "INTRADAY",
 *   exchange?: "NFO" | "BFO" (default: NFO),
 *   amo?: boolean (After Market Order - default: false),
 *   order_reason?: string
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
      order_type = 'MARKET',
      product_type = 'DELIVERY',
      contract_type,
      expiry,
      strike_price,
      option_type,
      amo = false,
      order_reason = 'MANUAL_TRADE',
      exchange
    } = body;

    // Determine if this is a derivative order
    const isDerivative = !!contract_type;
    const defaultExchange = isDerivative ? 'NFO' : 'NSE';
    const finalExchange = exchange || defaultExchange;
    const isAMO = amo === true;

    console.log('🔄 Manual Trade Request:', {
      user_id,
      symbol,
      transaction_type,
      quantity,
      price,
      order_type,
      product_type,
      contract_type,
      expiry,
      strike_price,
      option_type,
      exchange: finalExchange,
      amo: isAMO,
      order_reason,
      is_derivative: isDerivative
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

    if (!quantity || quantity <= 0) {
      return NextResponse.json({
        success: false,
        error: 'quantity is required and must be greater than 0'
      }, { status: 400 });
    }

    // Validate derivative-specific fields
    if (isDerivative) {
      // For NFO/BFO segments: contractType and expiry are required
      if (!expiry) {
        return NextResponse.json({
          success: false,
          error: 'expiry is required for derivatives (format: dd-mm-yyyy, e.g. "31-07-2025")'
        }, { status: 400 });
      }

      // Validate expiry format (dd-mm-yyyy)
      const expiryRegex = /^\d{2}-\d{2}-\d{4}$/;
      if (!expiryRegex.test(expiry)) {
        return NextResponse.json({
          success: false,
          error: 'expiry must be in dd-mm-yyyy format (e.g. "31-07-2025")'
        }, { status: 400 });
      }

      // Validate contract type
      if (!['FUT', 'OPT'].includes(contract_type)) {
        return NextResponse.json({
          success: false,
          error: 'contract_type must be either FUT or OPT for derivatives'
        }, { status: 400 });
      }

      // For options: strikePrice and optionType are required
      if (contract_type === 'OPT') {
        if (!strike_price) {
          return NextResponse.json({
            success: false,
            error: 'strike_price is required for options contracts'
          }, { status: 400 });
        }

        if (!option_type || !['CE', 'PE'].includes(option_type)) {
          return NextResponse.json({
            success: false,
            error: 'option_type must be either CE or PE for options'
          }, { status: 400 });
        }
      }

      // Validate exchange for derivatives
      if (!['NFO', 'BFO'].includes(finalExchange)) {
        return NextResponse.json({
          success: false,
          error: 'exchange must be NFO or BFO for derivatives'
        }, { status: 400 });
      }
    } else {
      // Validate exchange for equity
      if (!['NSE', 'BSE'].includes(finalExchange)) {
        return NextResponse.json({
          success: false,
          error: 'exchange must be NSE or BSE for equity'
        }, { status: 400 });
      }
    }

    // Validate order_type
    const validOrderTypes = ['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_MARKET'];
    if (!validOrderTypes.includes(order_type)) {
      return NextResponse.json({
        success: false,
        error: `order_type must be one of: ${validOrderTypes.join(', ')}`
      }, { status: 400 });
    }

    // Validate product_type
    const validProductTypes = ['DELIVERY', 'INTRADAY', 'MARGIN', 'MTF'];
    if (!validProductTypes.includes(product_type)) {
      return NextResponse.json({
        success: false,
        error: `product_type must be one of: ${validProductTypes.join(', ')}`
      }, { status: 400 });
    }

    // For LIMIT orders, price is required
    if (order_type === 'LIMIT' && !price) {
      return NextResponse.json({
        success: false,
        error: 'price is required for LIMIT orders'
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
      .select('client_id, is_active, public_key_encrypted')
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

    // Get stock price if not provided (for display purposes for MARKET orders)
    let stockPrice = price;
    if (!stockPrice && order_type !== 'LIMIT') {
      console.log(`📊 Fetching LTP for ${symbol}...`);
      const ltpData = await lemonService.getLTP(symbol, finalExchange);
      if (ltpData && ltpData.last_traded_price) {
        stockPrice = ltpData.last_traded_price;
        console.log(`✅ Got LTP for ${symbol}: ₹${stockPrice}`);
      } else {
        stockPrice = 0; // Unknown price, will be market order
        console.log(`⚠️ Could not fetch LTP for ${symbol}, proceeding with market order`);
      }
    }

    // Build order description
    let orderDescription = `${transaction_type} ${quantity}`;
    if (isDerivative) {
      if (contract_type === 'OPT') {
        orderDescription += ` ${symbol} ${expiry} ${strike_price} ${option_type}`;
      } else {
        orderDescription += ` ${symbol} ${expiry} FUT`;
      }
    } else {
      orderDescription += ` ${symbol}`;
    }
    if (stockPrice > 0) {
      orderDescription += ` @ ₹${stockPrice}`;
    }

    console.log(`📤 Placing ${order_type} order: ${orderDescription}${isAMO ? ' (AMO)' : ''}`);
    
    // Prepare order request payload according to Lemon API specification
    const orderPayload: any = {
      clientId: credentials.client_id,
      transactionType: transaction_type,
      exchangeSegment: finalExchange,
      productType: product_type,
      orderType: order_type,
      validity: 'DAY',
      symbol,
      quantity: quantity.toString(),
      tag: `${order_reason}_${Date.now()}`,
      afterMarketOrder: isAMO
    };

    // Add derivative-specific fields
    if (isDerivative) {
      orderPayload.contractType = contract_type;
      orderPayload.expiry = expiry;
      
      if (contract_type === 'OPT') {
        orderPayload.strikePrice = strike_price;
        orderPayload.optionType = option_type;
      }
    }

    // Add price for LIMIT orders
    if (order_type === 'LIMIT' && stockPrice) {
      orderPayload.price = stockPrice.toString();
    }

    console.log(`📤 Order payload:`, JSON.stringify(orderPayload, null, 2));

    const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
    const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

    // Retry logic with automatic token refresh on authentication errors
    const maxRetries = 3;
    let orderResult: any = null;
    let lastError = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Order attempt ${attempt}/${maxRetries}...`);

        // Get access token (will auto-refresh if expired)
        const accessToken = await lemonService.getAccessToken(user_id);
        if (!accessToken) {
          lastError = 'Failed to get access token';
          console.error(`❌ Token generation failed on attempt ${attempt}`);
          
          if (attempt < maxRetries) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          
          return NextResponse.json({
            success: false,
            error: lastError
          }, { status: 500 });
        }

        // Place order with Lemon API
        const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v2/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': accessToken,
            'x-client-id': credentials.client_id
          },
          body: JSON.stringify(orderPayload)
        });

        orderResult = await response.json();

        // Check for authentication errors
        const isAuthError = 
          orderResult.error_code === 'AUTHENTICATION_ERROR' ||
          orderResult.error_code === 'INVALID_ACCESS_TOKEN' ||
          (orderResult.msg && orderResult.msg.includes('Access token'));

        if (isAuthError && attempt < maxRetries) {
          console.log(`🔄 Authentication error detected on attempt ${attempt}, forcing token refresh...`);
          
          // Force refresh the access token
          const newToken = await lemonService['forceRefreshAccessToken'](user_id);
          
          if (newToken) {
            console.log(`✅ Token refreshed successfully, retrying order...`);
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue; // Retry with new token
          } else {
            lastError = 'Failed to refresh access token after authentication error';
            console.error(`❌ Token refresh failed on attempt ${attempt}`);
            
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
              continue;
            }
          }
        }

        // If order succeeded or non-auth error, break the loop
        if (orderResult.status === 'success' || !isAuthError) {
          break;
        }

        lastError = orderResult.msg || orderResult.message || 'Unknown error';
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Order attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
    }

    // If all retries failed
    if (!orderResult || orderResult.status !== 'success') {
      console.error(`❌ All ${maxRetries} order attempts failed`);
      return NextResponse.json({
        success: false,
        error: `Order failed after ${maxRetries} attempts: ${lastError}`,
        error_code: orderResult?.error_code,
        lemon_response: orderResult
      }, { status: 400 });
    }

    // Order succeeded - prepare response
    console.log(`✅ Order placed successfully:`, orderResult);
    
    const estimatedValue = stockPrice > 0 ? quantity * stockPrice : 'Market Price';
    
    // Save order to database for audit trail
    await supabase
      .from('real_orders')
      .insert({
        user_id,
        lemon_order_id: orderResult.data.orderId,
        symbol,
        transaction_type,
        order_type,
        quantity,
        price: stockPrice || 0,
        order_status: orderResult.data.orderStatus,
        order_reason,
        is_amo: isAMO,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    const responseData: any = {
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        client_id: credentials.client_id
      },
      order: {
        symbol,
        transaction_type,
        quantity,
        price: stockPrice > 0 ? stockPrice : 'Market',
        order_type,
        product_type,
        exchange: finalExchange,
        order_id: orderResult.data.orderId,
        order_status: orderResult.data.orderStatus,
        is_amo: isAMO
      },
      estimated_value: estimatedValue
    };

    // Add derivative info to response
    if (isDerivative) {
      responseData.order.contract_type = contract_type;
      responseData.order.expiry = expiry;
      if (contract_type === 'OPT') {
        responseData.order.strike_price = strike_price;
        responseData.order.option_type = option_type;
      }
    }

    console.log(`✅ Order placed successfully: ${orderResult.data.orderId}${isAMO ? ' (AMO - will execute at market open)' : ' (Regular order)'}`);
    console.log(`📋 Full Lemon API Response:`, JSON.stringify(orderResult, null, 2));
    
    return NextResponse.json({
      success: true,
      message: `${transaction_type} order placed successfully`,
      data: responseData,
      lemon_response: orderResult, // Full Lemon API response included
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Manual trade error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}

