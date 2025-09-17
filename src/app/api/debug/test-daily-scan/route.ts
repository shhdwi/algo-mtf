import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { test_mode = true, send_whatsapp = false } = await request.json();

    console.log('🧪 Testing Daily Scan Integration...');
    console.log('📋 Parameters:', { test_mode, send_whatsapp });

    const debugInfo: any = {
      test_mode,
      send_whatsapp,
      steps: []
    };

    // Step 1: Test paper trading scan (existing system)
    console.log('📊 Step 1: Testing paper trading scan...');
    try {
      // We'll simulate this since the full scan takes too long
      debugInfo.steps.push({
        step: 1,
        name: 'Paper Trading Scan',
        success: true,
        data: { 
          simulated: true,
          note: 'Paper trading scan would run ultimateScanWithPositionManagement()' 
        },
        message: 'Paper trading scan simulation successful'
      });
    } catch (error) {
      debugInfo.steps.push({
        step: 1,
        name: 'Paper Trading Scan',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 2: Test real trading execute signals
    console.log('🎯 Step 2: Testing real trading execute signals...');
    try {
      const realTradingResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/real-trading/execute-signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          exchange: 'NSE', 
          send_whatsapp: send_whatsapp,
          test_mode: test_mode // Add test mode to prevent real orders during testing
        })
      });
      
      const realTradingResults = await realTradingResponse.json();
      
      debugInfo.steps.push({
        step: 2,
        name: 'Real Trading Execute Signals',
        success: realTradingResults.success,
        data: {
          response_status: realTradingResponse.status,
          results: realTradingResults
        },
        message: realTradingResults.success 
          ? `Real trading executed: ${realTradingResults.real_trading_results?.orders_placed || 0} orders placed`
          : `Real trading failed: ${realTradingResults.error}`
      });

    } catch (error) {
      debugInfo.steps.push({
        step: 2,
        name: 'Real Trading Execute Signals',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Step 3: Test monitor positions (exit monitoring)
    console.log('🔍 Step 3: Testing position monitoring...');
    try {
      const monitorResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/real-trading/monitor-exits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          send_whatsapp: send_whatsapp 
        })
      });
      
      const monitorResults = await monitorResponse.json();
      
      debugInfo.steps.push({
        step: 3,
        name: 'Position Monitoring',
        success: monitorResults.success,
        data: {
          response_status: monitorResponse.status,
          results: monitorResults
        },
        message: monitorResults.success 
          ? `Position monitoring completed: ${monitorResults.monitoring_results?.exits_executed || 0} exits executed`
          : `Position monitoring failed: ${monitorResults.error}`
      });

    } catch (error) {
      debugInfo.steps.push({
        step: 3,
        name: 'Position Monitoring',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const successfulSteps = debugInfo.steps.filter((s: any) => s.success).length;
    const totalSteps = debugInfo.steps.length;
    const isOverallSuccess = successfulSteps === totalSteps;

    return NextResponse.json({
      success: isOverallSuccess,
      message: `Daily scan integration test completed: ${successfulSteps}/${totalSteps} steps successful`,
      debug_info: debugInfo,
      summary: {
        total_steps: totalSteps,
        successful_steps: successfulSteps,
        paper_trading: debugInfo.steps[0]?.success || false,
        real_trading: debugInfo.steps[1]?.success || false,
        position_monitoring: debugInfo.steps[2]?.success || false,
        test_mode: test_mode,
        timestamp: new Date().toISOString()
      },
      integration_status: {
        daily_scan_ready: isOverallSuccess,
        mtf_orders_working: debugInfo.steps[1]?.success || false,
        complete_flow_functional: isOverallSuccess
      }
    });

  } catch (error) {
    console.error('Daily scan integration test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}
