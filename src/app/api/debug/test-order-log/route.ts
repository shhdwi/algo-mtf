import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import LemonTradingService from '@/services/lemonTradingService';

/**
 * Debug endpoint to test different Lemon API order endpoints
 * GET /api/debug/test-order-log?user_id=xxx&order_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');
    const order_id = searchParams.get('order_id');

    if (!user_id || !order_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing user_id or order_id'
      }, { status: 400 });
    }

    console.log(`🧪 Testing Lemon API endpoints for order: ${order_id}`);

    // Get credentials
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

    const lemonService = new LemonTradingService();
    const accessToken = await lemonService.getAccessToken(user_id);
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get access token'
      }, { status: 500 });
    }
    
    const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
    const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

    // Test multiple possible endpoint formats
    const endpointsToTest = [
      { name: 'order_log (Documentation)', path: `/api-trading/api/v2/order_log/${order_id}` },
      { name: 'orders (Standard)', path: `/api-trading/api/v2/orders/${order_id}` },
      { name: 'order (Singular)', path: `/api-trading/api/v2/order/${order_id}` },
      { name: 'orderbook', path: `/api-trading/api/v2/orderbook/${order_id}` },
      { name: 'order_status', path: `/api-trading/api/v2/order_status/${order_id}` },
      { name: 'GET orders with query', path: `/api-trading/api/v2/orders?order_id=${order_id}` },
    ];

    const results = [];

    for (const endpoint of endpointsToTest) {
      const url = `${LEMON_BASE_URL}${endpoint.path}`;
      console.log(`\n🔍 Testing: ${endpoint.name}`);
      console.log(`   URL: ${url}`);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': accessToken,
            'x-client-id': credentials.client_id
          }
        });

        const responseText = await response.text();
        
        let parsedResponse = null;
        let isValidJSON = false;
        try {
          parsedResponse = JSON.parse(responseText);
          isValidJSON = true;
        } catch {
          parsedResponse = responseText;
        }

        const result = {
          endpoint: endpoint.name,
          url: endpoint.path,
          status: response.status,
          statusText: response.statusText,
          isValidJSON,
          contentLength: responseText.length,
          response: isValidJSON ? parsedResponse : responseText.substring(0, 200)
        };

        console.log(`   Status: ${response.status}`);
        console.log(`   Valid JSON: ${isValidJSON}`);
        console.log(`   Response: ${responseText.substring(0, 100)}`);

        results.push(result);

      } catch (error) {
        console.log(`   Error: ${error}`);
        results.push({
          endpoint: endpoint.name,
          url: endpoint.path,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Find successful responses
    const successfulEndpoints = results.filter(r => 
      'status' in r && r.status === 200 && 'isValidJSON' in r && r.isValidJSON && !('error' in r)
    );

    return NextResponse.json({
      success: true,
      order_id,
      client_id: credentials.client_id,
      results,
      summary: {
        total_tested: endpointsToTest.length,
        successful: successfulEndpoints.length,
        recommended_endpoint: successfulEndpoints.length > 0 
          ? successfulEndpoints[0].endpoint 
          : 'None found - check order_id or API access'
      },
      successful_responses: successfulEndpoints
    });

  } catch (error) {
    console.error('❌ Debug test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

