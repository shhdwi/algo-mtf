import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    console.log('🔍 Debug - Request Body:', requestBody);
    
    const { client_id, access_token, ip_whitelist = ['0.0.0.0/0'] } = requestBody;

    console.log('🔍 Debug - Extracted client_id:', client_id);
    console.log('🔍 Debug - Extracted access_token:', access_token);

    if (!client_id || !access_token) {
      return NextResponse.json({
        success: false,
        error: 'Client ID and access token are required',
        debug_info: {
          received_client_id: client_id,
          received_access_token: access_token ? 'present' : 'missing',
          request_body: requestBody
        }
      }, { status: 400 });
    }

    console.log(`🔑 Generating API keys for client: ${client_id}...`);

    // Generate API keys with Lemon API (with proper authentication)
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/generate_api_key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-key': access_token // Use x-auth-key header as per Lemon API docs
      },
      body: JSON.stringify({
        client_id: client_id,
        ip_whitelist: ip_whitelist // Allow all IPs as requested
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ API keys generated successfully`);
      
      return NextResponse.json({
        success: true,
        message: 'API keys generated successfully',
        api_credentials: {
          client_id: client_id, // Use the client_id from request
          public_key: result.data.public_key,
          private_key: result.data.private_key,
          api_key_expires_at: result.data.expires_at
        },
        ip_whitelist: result.data.ip_whitelist || ['0.0.0.0/0'], // From response
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
    usage: 'POST with { "client_id": "CLIENT_XXX", "access_token": "token", "ip_whitelist": ["0.0.0.0/0"] }',
    features: [
      'Automatic API key generation',
      'IP whitelist set to allow all (0.0.0.0/0)',
      'Returns client_id, public_key, private_key',
      'Ready for immediate trading use'
    ],
    example: {
      client_id: 'CLIENT_1234567890_1234',
      access_token: 'access_token_from_pin_validation',
      ip_whitelist: ['0.0.0.0/0']
    }
  });
}
