import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://api.lemon.markets';

export async function POST(request: NextRequest) {
  try {
    const { auth_token, phone_number } = await request.json();

    if (!auth_token) {
      return NextResponse.json({
        success: false,
        error: 'Auth token is required'
      }, { status: 400 });
    }

    console.log(`🔑 Generating API keys with auth token...`);

    // Generate API keys with Lemon API
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/generate_api_key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_token: auth_token,
        ip_whitelist: ['0.0.0.0/0'], // Allow all IPs as requested
        phone_number: phone_number
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ API keys generated successfully`);
      
      return NextResponse.json({
        success: true,
        message: 'API keys generated successfully',
        api_credentials: {
          client_id: result.data.client_id,
          public_key: result.data.public_key,
          private_key: result.data.private_key,
          api_key_expires_at: result.data.expires_at
        },
        ip_whitelist: ['0.0.0.0/0'], // Confirm allow all IPs
        lemon_response: result
      });
    } else {
      console.error('Lemon API key generation failed:', result);
      return NextResponse.json({
        success: false,
        error: result.msg || 'Failed to generate API keys',
        lemon_response: result
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error generating API keys:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Lemon API Key Generation',
    description: 'Generate API keys after successful PIN validation',
    usage: 'POST with { "auth_token": "token", "phone_number": "+91XXXXXXXXXX" }',
    features: [
      'Automatic API key generation',
      'IP whitelist set to allow all (0.0.0.0/0)',
      'Returns client_id, public_key, private_key',
      'Ready for immediate trading use'
    ],
    example: {
      auth_token: 'auth_token_from_pin_validation',
      phone_number: '+911234567890'
    }
  });
}
