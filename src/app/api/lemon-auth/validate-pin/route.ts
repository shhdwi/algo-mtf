import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://api.lemon.markets';

export async function POST(request: NextRequest) {
  try {
    const { session_token, pin } = await request.json();

    if (!session_token || !pin) {
      return NextResponse.json({
        success: false,
        error: 'Session token and PIN are required'
      }, { status: 400 });
    }

    console.log(`🔑 Validating PIN for session: ${session_token.substring(0, 10)}...`);

    // Validate PIN with Lemon API
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/validate_pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_token: session_token,
        pin: pin
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ PIN validated successfully`);
      
      return NextResponse.json({
        success: true,
        message: 'PIN validated successfully',
        auth_token: result.data.auth_token, // Need this for API key generation
        lemon_response: result
      });
    } else {
      console.error('Lemon API PIN validation failed:', result);
      return NextResponse.json({
        success: false,
        error: result.msg || 'Invalid PIN',
        lemon_response: result
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error validating PIN:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Lemon API PIN Validation',
    description: 'Validate PIN for authenticated session',
    usage: 'POST with { "session_token": "token", "pin": "1234" }',
    example: {
      session_token: 'session_token_from_otp_validation',
      pin: '1234'
    }
  });
}
