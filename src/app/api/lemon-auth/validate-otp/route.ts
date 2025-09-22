import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://api.lemon.markets';

export async function POST(request: NextRequest) {
  try {
    const { request_id, otp } = await request.json();

    if (!request_id || !otp) {
      return NextResponse.json({
        success: false,
        error: 'Request ID and OTP are required'
      }, { status: 400 });
    }

    console.log(`🔐 Validating OTP for request: ${request_id}`);

    // Validate OTP with Lemon API
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/validate_otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request_id: request_id,
        otp: otp
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ OTP validated successfully for request: ${request_id}`);
      
      return NextResponse.json({
        success: true,
        message: 'OTP validated successfully',
        request_id: request_id,
        session_token: result.data.session_token, // Need this for PIN validation
        lemon_response: result
      });
    } else {
      console.error('Lemon API OTP validation failed:', result);
      return NextResponse.json({
        success: false,
        error: result.msg || 'Invalid OTP',
        lemon_response: result
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error validating OTP:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Lemon API OTP Validation',
    description: 'Validate OTP received via SMS',
    usage: 'POST with { "request_id": "uuid", "otp": "123456" }',
    example: {
      request_id: 'abc-123-def',
      otp: '123456'
    }
  });
}
