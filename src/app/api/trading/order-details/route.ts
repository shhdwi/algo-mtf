import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import LemonTradingService from '@/services/lemonTradingService';

/**
 * GET /api/trading/order-details
 * 
 * Fetches order details from Lemon API using the order log endpoint
 * 
 * Query Parameters:
 * @param {string} user_id - UUID of the user in the database
 * @param {string} order_id - Lemon order ID (from order placement response)
 * 
 * Example:
 * GET /api/trading/order-details?user_id=4c13f9b0-f83a-4fff-9d22-ac819f653950&order_id=ORD123456789
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user": { ... },
 *     "order_details": { ... }
 *   },
 *   "lemon_response": { ... }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Initialize Supabase client inside the function
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');
    const order_id = searchParams.get('order_id');

    // Validate required parameters
    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: user_id'
      }, { status: 400 });
    }

    if (!order_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: order_id'
      }, { status: 400 });
    }

    console.log(`📊 Fetching order details for order_id: ${order_id}, user_id: ${user_id}`);

    // Get user details and API credentials
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Get API credentials
    const { data: credentials, error: credError } = await supabase
      .from('api_credentials')
      .select('client_id, is_active, public_key_encrypted')
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials) {
      return NextResponse.json({
        success: false,
        error: 'API credentials not found'
      }, { status: 404 });
    }

    if (!credentials.is_active) {
      return NextResponse.json({
        success: false,
        error: 'API credentials are not active'
      }, { status: 403 });
    }

    // Initialize Lemon Trading Service
    const lemonService = new LemonTradingService();
    const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
    const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

    // Retry logic with automatic token refresh
    const maxRetries = 3;
    let orderDetails: any = null;
    let lastError = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Fetching order details attempt ${attempt}/${maxRetries}...`);

        // Get access token
        const accessToken = await lemonService.getAccessToken(user_id);
        if (!accessToken) {
          lastError = 'Failed to get access token';
          console.error(`❌ Token generation failed on attempt ${attempt}`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          
          return NextResponse.json({
            success: false,
            error: lastError
          }, { status: 500 });
        }

        // Fetch order log from Lemon API
        const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v2/order_log/${order_id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': accessToken,
            'x-client-id': credentials.client_id
          }
        });

        orderDetails = await response.json();

        // Check for authentication errors
        const isAuthError = 
          orderDetails.error_code === 'AUTHENTICATION_ERROR' ||
          orderDetails.error_code === 'INVALID_ACCESS_TOKEN' ||
          (orderDetails.msg && orderDetails.msg.includes('Access token'));

        if (isAuthError && attempt < maxRetries) {
          console.log(`🔄 Authentication error detected on attempt ${attempt}, forcing token refresh...`);
          
          // Force refresh the access token
          const newToken = await lemonService['forceRefreshAccessToken'](user_id);
          
          if (newToken) {
            console.log(`✅ Token refreshed successfully, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          } else {
            lastError = 'Failed to refresh access token after authentication error';
            console.error(`❌ Token refresh failed on attempt ${attempt}`);
            
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
              continue;
            }
          }
        }

        // If request succeeded or non-auth error, break the loop
        if (orderDetails.status === 'success' || !isAuthError) {
          break;
        }

        lastError = orderDetails.msg || orderDetails.message || 'Unknown error';
        
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Fetch attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
    }

    // If all retries failed
    if (!orderDetails || orderDetails.status !== 'success') {
      console.error(`❌ All ${maxRetries} attempts failed to fetch order details`);
      return NextResponse.json({
        success: false,
        error: `Failed to fetch order details after ${maxRetries} attempts: ${lastError}`,
        error_code: orderDetails?.error_code,
        lemon_response: orderDetails
      }, { status: 400 });
    }

    // Success - return order details
    console.log(`✅ Order details fetched successfully for order: ${order_id}`);
    console.log(`📋 Full Lemon API Response:`, JSON.stringify(orderDetails, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Order details fetched successfully',
      data: {
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
          client_id: credentials.client_id
        },
        order_details: orderDetails.data
      },
      lemon_response: orderDetails, // Full Lemon API response
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Order details API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}

