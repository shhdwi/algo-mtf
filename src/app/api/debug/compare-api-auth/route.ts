import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();

    console.log('🔍 Comparing API Authentication...');

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const debugInfo: any = {
      user_id,
      tests: []
    };

    // Get user credentials and access token
    const { data: credentials } = await lemonService['supabase']
      .from('api_credentials')
      .select('client_id, public_key_encrypted, private_key_encrypted')
      .eq('user_id', user_id)
      .single();

    if (!credentials) {
      return NextResponse.json({
        success: false,
        error: 'No credentials found'
      });
    }

    const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
    const accessToken = await lemonService['getAccessToken'](user_id);

    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get access token'
      });
    }

    console.log('🔑 Using credentials:', {
      client_id: credentials.client_id,
      public_key_length: publicKey.length,
      access_token_length: accessToken ? accessToken.length : 0
    });

    // Test 1: Margin Info API (this works)
    console.log('📊 Test 1: Margin Info API...');
    try {
      const marginPayload = {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        transactionType: 'BUY',
        price: '2500',
        quantity: '1',
        productType: 'MARGIN'
      };

      const marginResponse = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v2/margin-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-auth-key': accessToken,
          'x-client-id': credentials.client_id
        },
        body: JSON.stringify(marginPayload)
      });

      const marginResult = await marginResponse.json();

      debugInfo.tests.push({
        test: 1,
        name: 'Margin Info API',
        endpoint: '/api-trading/api/v2/margin-info',
        success: marginResult.status === 'success',
        data: {
          request_headers: {
            'x-api-key': publicKey.substring(0, 10) + '...',
            'x-auth-key': accessToken ? accessToken.substring(0, 10) + '...' : 'null',
            'x-client-id': credentials.client_id
          },
          request_payload: marginPayload,
          response_status: marginResponse.status,
          response_data: marginResult
        },
        error: marginResult.status !== 'success' ? marginResult.msg : undefined
      });

    } catch (error) {
      debugInfo.tests.push({
        test: 1,
        name: 'Margin Info API',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Test 2: Orders API (this fails)
    console.log('🎯 Test 2: Orders API...');
    try {
      const orderPayload = {
        clientId: credentials.client_id,
        transactionType: 'BUY',
        exchangeSegment: 'NSE',
        productType: 'MTF',
        orderType: 'MARKET',
        validity: 'DAY',
        symbol: 'RELIANCE',
        quantity: '1',
        afterMarketOrder: false
      };

      console.log('📤 Order payload:', orderPayload);

      const orderResponse = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v2/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-auth-key': accessToken,
          'x-client-id': credentials.client_id
        },
        body: JSON.stringify(orderPayload)
      });

      const orderResult = await orderResponse.json();

      debugInfo.tests.push({
        test: 2,
        name: 'Orders API',
        endpoint: '/api-trading/api/v2/orders',
        success: orderResult.status === 'success',
        data: {
          request_headers: {
            'x-api-key': publicKey.substring(0, 10) + '...',
            'x-auth-key': accessToken ? accessToken.substring(0, 10) + '...' : 'null',
            'x-client-id': credentials.client_id
          },
          request_payload: orderPayload,
          response_status: orderResponse.status,
          response_data: orderResult
        },
        error: orderResult.status !== 'success' ? orderResult.msg : undefined
      });

    } catch (error) {
      debugInfo.tests.push({
        test: 2,
        name: 'Orders API',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Test 3: Try different order payload format
    console.log('🔄 Test 3: Alternative Order Format...');
    try {
      // Try with different field names or structure
      const altOrderPayload = {
        client_id: credentials.client_id, // Different field name
        transaction_type: 'BUY',
        exchange_segment: 'NSE',
        product_type: 'MTF',
        order_type: 'MARKET',
        validity: 'DAY',
        symbol: 'RELIANCE',
        quantity: 1, // Number instead of string
        after_market_order: false
      };

      const altOrderResponse = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v2/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-auth-key': accessToken,
          'x-client-id': credentials.client_id
        },
        body: JSON.stringify(altOrderPayload)
      });

      const altOrderResult = await altOrderResponse.json();

      debugInfo.tests.push({
        test: 3,
        name: 'Alternative Order Format',
        endpoint: '/api-trading/api/v2/orders',
        success: altOrderResult.status === 'success',
        data: {
          request_payload: altOrderPayload,
          response_status: altOrderResponse.status,
          response_data: altOrderResult
        },
        error: altOrderResult.status !== 'success' ? altOrderResult.msg : undefined
      });

    } catch (error) {
      debugInfo.tests.push({
        test: 3,
        name: 'Alternative Order Format',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const successfulTests = debugInfo.tests.filter((t: any) => t.success).length;
    const totalTests = debugInfo.tests.length;

    return NextResponse.json({
      success: successfulTests > 0,
      message: `API authentication comparison completed: ${successfulTests}/${totalTests} tests successful`,
      debug_info: debugInfo,
      analysis: {
        margin_api_works: debugInfo.tests[0]?.success || false,
        orders_api_works: debugInfo.tests[1]?.success || false,
        alt_format_works: debugInfo.tests[2]?.success || false,
        auth_issue: debugInfo.tests[0]?.success && !debugInfo.tests[1]?.success,
        recommendations: [
          debugInfo.tests[0]?.success ? '✅ Margin API authentication working' : '❌ Margin API authentication failed',
          debugInfo.tests[1]?.success ? '✅ Orders API authentication working' : '❌ Orders API authentication failed - check payload format',
          debugInfo.tests[2]?.success ? '✅ Alternative format works' : '❌ Alternative format also failed'
        ]
      }
    });

  } catch (error) {
    console.error('API comparison error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
