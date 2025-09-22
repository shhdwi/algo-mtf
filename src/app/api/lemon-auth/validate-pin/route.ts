import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

export async function POST(request: NextRequest) {
  try {
    const { refresh_token, pin } = await request.json();

    if (!refresh_token || !pin) {
      return NextResponse.json({
        success: false,
        error: 'Refresh token and PIN are required'
      }, { status: 400 });
    }

    console.log(`🔑 Validating PIN with refresh token...`);

    // Validate PIN with Lemon API (according to documentation)
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/validate_pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-refresh-token': refresh_token // Required header according to docs
      },
      body: JSON.stringify({
        pin: pin
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ PIN validated successfully`);
      
      return NextResponse.json({
        success: true,
        message: 'PIN validated successfully',
        access_token: result.data.access_token, // According to documentation
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
