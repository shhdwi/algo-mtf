import { NextRequest, NextResponse } from 'next/server';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { user_id, symbol = 'RELIANCE', price = 2500 } = await request.json();

    console.log('🔍 Debugging Position Size Calculation...');
    console.log('📋 Parameters:', { user_id, symbol, price });

    if (!user_id) {
      return NextResponse.json({
        success: false,
        error: 'user_id is required'
      }, { status: 400 });
    }

    const lemonService = new LemonTradingService();
    const debugInfo: any = {
      user_id,
      symbol,
      price,
      steps: []
    };

    // Step 1: Check trading preferences
    console.log('📊 Step 1: Checking trading preferences...');
    try {
      const { data: preferences, error } = await lemonService['supabase']
        .from('trading_preferences')
        .select('total_capital, allocation_percentage, is_real_trading_enabled')
        .eq('user_id', user_id)
        .single();

      debugInfo.steps.push({
        step: 1,
        name: 'Trading Preferences',
        success: !error && !!preferences,
        data: preferences,
        error: error?.message
      });

      if (error || !preferences) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

      const allocationAmount = (preferences.total_capital * preferences.allocation_percentage) / 100;
      debugInfo.allocation_amount = allocationAmount;

    } catch (error) {
      debugInfo.steps.push({
        step: 1,
        name: 'Trading Preferences',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return NextResponse.json({ success: false, debug_info: debugInfo });
    }

    // Step 2: Check API credentials
    console.log('🔑 Step 2: Checking API credentials...');
    try {
      const { data: credentials, error } = await lemonService['supabase']
        .from('api_credentials')
        .select('client_id, public_key_encrypted, private_key_encrypted, access_token_encrypted, token_expires_at')
        .eq('user_id', user_id)
        .single();

      debugInfo.steps.push({
        step: 2,
        name: 'API Credentials',
        success: !error && !!credentials,
        data: credentials ? {
          client_id: credentials.client_id,
          has_public_key: !!credentials.public_key_encrypted,
          has_private_key: !!credentials.private_key_encrypted,
          has_access_token: !!credentials.access_token_encrypted,
          token_expires_at: credentials.token_expires_at
        } : null,
        error: error?.message
      });

      if (error || !credentials) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

    } catch (error) {
      debugInfo.steps.push({
        step: 2,
        name: 'API Credentials',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return NextResponse.json({ success: false, debug_info: debugInfo });
    }

    // Step 3: Test access token generation
    console.log('🎫 Step 3: Testing access token...');
    try {
      const accessToken = await lemonService['getAccessToken'](user_id);
      
      debugInfo.steps.push({
        step: 3,
        name: 'Access Token Generation',
        success: !!accessToken,
        data: { 
          has_token: !!accessToken,
          token_length: accessToken ? accessToken.length : 0
        },
        error: !accessToken ? 'Failed to generate access token' : undefined
      });

      if (!accessToken) {
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

    } catch (error) {
      debugInfo.steps.push({
        step: 3,
        name: 'Access Token Generation',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return NextResponse.json({ success: false, debug_info: debugInfo });
    }

    // Step 4: Test MTF margin info API call
    console.log('📊 Step 4: Testing MTF margin info API...');
    try {
      // Get credentials for API call
      const { data: credentials } = await lemonService['supabase']
        .from('api_credentials')
        .select('client_id, public_key_encrypted')
        .eq('user_id', user_id)
        .single();

      if (!credentials) {
        debugInfo.steps.push({
          step: 4,
          name: 'MTF Margin Info API Call',
          success: false,
          error: 'No API credentials found'
        });
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

      const publicKey = lemonService['decrypt'](credentials.public_key_encrypted);
      const accessToken = await lemonService['getAccessToken'](user_id);

      if (!accessToken) {
        debugInfo.steps.push({
          step: 4,
          name: 'MTF Margin Info API Call',
          success: false,
          error: 'Failed to get access token'
        });
        return NextResponse.json({ success: false, debug_info: debugInfo });
      }

      const marginPayload = {
        symbol,
        exchange: 'NSE',
        transactionType: 'BUY',
        price: price.toString(),
        quantity: '1',
          productType: 'MARGIN'
      };

      console.log('📤 Margin API Request:', marginPayload);

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
      console.log('📥 Margin API Response:', result);

      debugInfo.steps.push({
        step: 4,
        name: 'MTF Margin Info API Call',
        success: result.status === 'success',
        data: {
          request_payload: marginPayload,
          response_status: response.status,
          response_data: result
        },
        error: result.status !== 'success' ? result.message || 'API call failed' : undefined
      });

      if (result.status === 'success') {
        // Step 5: Calculate position size
        console.log('🧮 Step 5: Calculating position size...');
        const allocationAmount = debugInfo.allocation_amount;
        const marginPerShare = parseFloat(result.data.approximateMargin);
        const quantity = Math.floor(allocationAmount / marginPerShare);
        const totalAmount = quantity * price;
        const marginRequired = quantity * marginPerShare;
        const leverage = totalAmount / marginRequired;

        const positionCalc = {
          allocation_amount: allocationAmount,
          margin_per_share: marginPerShare,
          quantity,
          total_amount: totalAmount,
          margin_required: marginRequired,
          leverage: leverage.toFixed(2) + 'x'
        };

        debugInfo.steps.push({
          step: 5,
          name: 'Position Size Calculation',
          success: quantity > 0,
          data: positionCalc,
          error: quantity === 0 ? 'Allocation too small for this stock price/margin' : undefined
        });

        debugInfo.final_position = positionCalc;
      }

    } catch (error) {
      debugInfo.steps.push({
        step: 4,
        name: 'MTF Margin Info API Call',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const successfulSteps = debugInfo.steps.filter((s: any) => s.success).length;
    const totalSteps = debugInfo.steps.length;

    return NextResponse.json({
      success: successfulSteps === totalSteps,
      message: `Position size debug completed: ${successfulSteps}/${totalSteps} steps successful`,
      debug_info: debugInfo
    });

  } catch (error) {
    console.error('Position size debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
