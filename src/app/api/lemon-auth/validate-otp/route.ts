import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';

export async function POST(request: NextRequest) {
  try {
    const { phone_number, otp } = await request.json();

    if (!phone_number || !otp) {
      return NextResponse.json({
        success: false,
        error: 'Phone number and OTP are required'
      }, { status: 400 });
    }

    console.log(`🔐 Validating OTP for phone: ${phone_number}`);

    // Validate OTP with Lemon API (according to documentation)
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/validate_otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: phone_number,
        otp: otp
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ OTP validated successfully for phone: ${phone_number}`);
      
      return NextResponse.json({
        success: true,
        message: 'OTP validated successfully',
        phone_number: phone_number,
        refresh_token: result.data.refresh_token, // According to documentation
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
