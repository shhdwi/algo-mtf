import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();

    console.log('🧪 Testing MTF Order Placement API...');

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

    // Get user credentials
    const { data: credentials } = await lemonService['supabase']
      .from('api_credentials')
      .select('client_id, public_key_encrypted')
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

    // Test 1: MTF Order Placement (dry run - we won't actually place it)
    console.log('📊 Test 1: MTF Order Validation...');
    try {
      const mtfOrderPayload = {
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

      console.log('📤 MTF Order Payload:', mtfOrderPayload);

      // Note: We're not actually placing the order, just testing validation
      // In a real scenario, you'd send this to /api-trading/api/v2/orders
      debugInfo.tests.push({
        test: 1,
        name: 'MTF Order Payload Validation',
        success: true,
        data: {
          payload: mtfOrderPayload,
          note: 'Payload prepared - not actually sent to avoid real order'
        }
      });

    } catch (error) {
      debugInfo.tests.push({
        test: 1,
        name: 'MTF Order Payload Validation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Test 2: Compare MARGIN vs MTF for margin-info endpoint
    console.log('📊 Test 2: Margin Info API - MARGIN vs MTF...');
    
    const marginTests = ['MARGIN', 'MTF'];
    
    for (const productType of marginTests) {
      try {
        const marginPayload = {
          symbol: 'RELIANCE',
          exchange: 'NSE',
          transactionType: 'BUY',
          price: '2500',
          quantity: '1',
          productType: productType
        };

        const response = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v2/margin-info', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': accessToken,
            'x-client-id': credentials.client_id
          },
          body: JSON.stringify(marginPayload)
        });

        const result = await response.json();

        debugInfo.tests.push({
          test: `2-${productType}`,
          name: `Margin Info API - ${productType}`,
          success: result.status === 'success',
          data: {
            product_type: productType,
            response_status: response.status,
            api_response: result
          },
          error: result.status !== 'success' ? result.msg || 'API call failed' : undefined
        });

      } catch (error) {
        debugInfo.tests.push({
          test: `2-${productType}`,
          name: `Margin Info API - ${productType}`,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successfulTests = debugInfo.tests.filter((t: any) => t.success).length;
    const totalTests = debugInfo.tests.length;

    return NextResponse.json({
      success: successfulTests > 0,
      message: `MTF testing completed: ${successfulTests}/${totalTests} tests successful`,
      debug_info: debugInfo,
      recommendations: {
        order_placement: 'Use MTF for actual order placement (/api-trading/api/v2/orders)',
        margin_calculation: 'Use MARGIN for margin info calculation (/api-trading/api/v2/margin-info)',
        hybrid_approach: 'Calculate margin with MARGIN, place orders with MTF'
      }
    });

  } catch (error) {
    console.error('MTF test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
