import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json();

    console.log('🔄 Refreshing access token for user:', user_id);

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const debugInfo: any = {
      user_id,
      steps: []
    };

    // Step 1: Get current credentials
    console.log('📋 Step 1: Getting current credentials...');
    try {
      const { data: credentials, error } = await lemonService['supabase']
        .from('api_credentials')
        .select('*')
        .eq('user_id', user_id)
        .single();

      debugInfo.steps.push({
        step: 1,
        name: 'Get Current Credentials',
        success: !error && !!credentials,
        data: credentials ? {
          client_id: credentials.client_id,
          token_expires_at: credentials.token_expires_at,
          is_active: credentials.is_active
        } : null,
        error: error?.message
      });

      if (error || !credentials) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

      // Step 2: Force regenerate access token
      console.log('🔑 Step 2: Force regenerating access token...');
      
      // Clear current token to force regeneration
      await lemonService['supabase']
        .from('api_credentials')
        .update({ 
          access_token_encrypted: null,
          token_expires_at: null 
        })
        .eq('user_id', user_id);

      // Now get new token
      const newAccessToken = await lemonService['getAccessToken'](user_id);
      
      debugInfo.steps.push({
        step: 2,
        name: 'Generate New Access Token',
        success: !!newAccessToken,
        data: { 
          has_new_token: !!newAccessToken,
          token_length: newAccessToken ? newAccessToken.length : 0
        },
        error: !newAccessToken ? 'Failed to generate new access token' : undefined
      });

      if (!newAccessToken) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

      // Step 3: Test the new token with a simple API call
      console.log('🧪 Step 3: Testing new token...');
      try {
        const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
        
        const testResponse = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v2/margin-info', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': newAccessToken,
            'x-client-id': credentials.client_id
          },
          body: JSON.stringify({
            symbol: 'RELIANCE',
            exchange: 'NSE',
            transactionType: 'BUY',
            price: '2500',
            quantity: '1',
            productType: 'MARGIN'
          })
        });

        const testResult = await testResponse.json();
        
        debugInfo.steps.push({
          step: 3,
          name: 'Test New Token',
          success: testResult.status === 'success',
          data: {
            response_status: testResponse.status,
            api_response: testResult
          },
          error: testResult.status !== 'success' ? testResult.message || 'Token test failed' : undefined
        });

      } catch (error) {
        debugInfo.steps.push({
          step: 3,
          name: 'Test New Token',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } catch (error) {
      debugInfo.steps.push({
        step: 1,
        name: 'Get Current Credentials',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const successfulSteps = debugInfo.steps.filter((s: any) => s.success).length;
    const totalSteps = debugInfo.steps.length;

    return NextResponse.json({
      success: successfulSteps === totalSteps,
      message: `Token refresh completed: ${successfulSteps}/${totalSteps} steps successful`,
      debug_info: debugInfo
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
