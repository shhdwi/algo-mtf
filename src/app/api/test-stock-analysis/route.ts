import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isinParam = searchParams.get('isin');
    const dateParam = searchParams.get('date');

    console.log('Test Stock Analysis API called');
    console.log('ISIN param:', isinParam);
    console.log('Date param:', dateParam);

    // Test basic functionality
    if (!isinParam || !dateParam) {
      return NextResponse.json({ 
        error: 'Both isin and date parameters are required. Format: ?isin=INE040A01034&date=15-01-2024',
        received: { isin: isinParam, date: dateParam }
      }, { status: 400 });
    }

    // Test Upstox API call
    const isin = 'INE040A01034'; // HDFC Bank
    const instrumentKey = `NSE_EQ|${isin}`;
    const toDate = '2024-01-15';
    const fromDate = '2023-07-15'; // 6 months back
    const url = `https://api.upstox.com/v3/historical-candle/${instrumentKey}/days/1/${toDate}/${fromDate}`;

    console.log('Testing Upstox API call:', url);

    const response = await fetch(url, { 
      method: 'GET', 
      headers: { 'Accept': 'application/json' } 
    });
    
    console.log('Upstox response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Upstox error:', errorText);
      return NextResponse.json({
        error: `Upstox API test failed: ${response.status}`,
        details: errorText,
        url: url
      }, { status: 503 });
    }
    
    const data = await response.json();
    console.log('Upstox response keys:', Object.keys(data));
    console.log('Upstox status:', data.status);
    
    if (data.data && data.data.candles) {
      console.log('Candles count:', data.data.candles.length);
    }

    return NextResponse.json({
      success: true,
      message: 'Stock analysis test successful',
      data: {
        isin: isinParam,
        date: dateParam,
        upstox_status: data.status,
        candles_count: data.data?.candles?.length || 0,
        sample_candle: data.data?.candles?.[0] || null
      }
    });

  } catch (error: any) {
    console.error('Test Stock Analysis API error:', error);
    return NextResponse.json({ 
      error: error.message || 'Test failed',
      stack: error.stack
    }, { status: 500 });
  }
}
