import { NextRequest, NextResponse } from 'next/server';

const LEMON_BASE_URL = 'https://api.lemon.markets';

export async function POST(request: NextRequest) {
  try {
    const { phone_number } = await request.json();

    if (!phone_number) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required'
      }, { status: 400 });
    }

    console.log(`📱 Requesting OTP for phone: ${phone_number}`);

    // Request OTP from Lemon API
    const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/request_otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: phone_number
      })
    });

    const result = await response.json();

    if (result.status === 'success') {
      console.log(`✅ OTP requested successfully for ${phone_number}`);
      
      return NextResponse.json({
        success: true,
        message: 'OTP sent successfully',
        request_id: result.data.request_id,
        phone_number: phone_number,
        lemon_response: result
      });
    } else {
      console.error('Lemon API OTP request failed:', result);
      return NextResponse.json({
        success: false,
        error: result.msg || 'Failed to request OTP',
        lemon_response: result
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error requesting OTP:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Lemon API OTP Request',
    description: 'Request OTP for phone number verification',
    usage: 'POST with { "phone_number": "+91XXXXXXXXXX" }',
    example: {
      phone_number: '+911234567890'
    }
  });
}
