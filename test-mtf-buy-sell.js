#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Configuration
const config = {
  baseUrl: 'http://localhost:3001', // Change to https://algo-mtf.vercel.app for production testing
  testParams: {
    user_id: '053c5dc0-0dce-457c-9051-77dde1e4e5da', // Change this to your test user ID
    symbol: 'RELIANCE',
    quantity: 1, // Optional - will be calculated from MTF margin if not provided
    test_mode: false, // Now places REAL orders through Lemon API!
    delay_between_orders: 3000 // 3 seconds between BUY and SELL
  }
};

console.log('🧪 MTF BUY-SELL Test Script');
console.log('=' .repeat(50));
console.log(`📊 Testing: ${config.testParams.symbol}`);
console.log(`👤 User ID: ${config.testParams.user_id}`);
console.log(`🔧 Mode: ${config.testParams.test_mode ? 'SIMULATION' : '🔥 REAL TRADING 🔥'}`);
console.log(`⏱️  Delay: ${config.testParams.delay_between_orders}ms`);
console.log('=' .repeat(50));

if (!config.testParams.test_mode) {
  console.log('🚨 WARNING: Real trading mode enabled!');
  console.log('🚨 This will place actual BUY and SELL orders with real money!');
  console.log('🚨 Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  
  // 5 second warning for real trading
  setTimeout(() => {
    runTest();
  }, 5000);
} else {
  runTest();
}

function runTest() {
  const postData = JSON.stringify(config.testParams);
  
  const isHttps = config.baseUrl.startsWith('https');
  const hostname = config.baseUrl.replace('https://', '').replace('http://', '').split(':')[0];
  
  const options = {
    hostname: hostname,
    port: isHttps ? 443 : 3001,
    path: '/api/debug/test-mtf-buy-sell',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log(`🚀 Starting MTF test at ${new Date().toLocaleTimeString()}...`);
  console.log('');

  const requestModule = isHttps ? https : http;
  const req = requestModule.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        displayResults(result);
      } catch (error) {
        console.error('❌ Failed to parse response:', error.message);
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.write(postData);
  req.end();
}

function displayResults(result) {
  console.log('📊 MTF BUY-SELL Test Results');
  console.log('=' .repeat(50));
  
  // Overall result
  if (result.success) {
    console.log('✅ Overall Result: SUCCESS');
  } else {
    console.log('❌ Overall Result: FAILED');
  }
  
  console.log(`⏱️  Total Duration: ${result.summary?.total_duration_ms || 0}ms`);
  console.log('');

  // Summary
  if (result.summary) {
    console.log('📈 Summary:');
    console.log(`   BUY Order:      ${result.summary.buy_order_success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   SELL Order:     ${result.summary.sell_order_success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`   Position Created: ${result.summary.position_created ? '✅ YES' : '❌ NO'}`);
    console.log(`   Position Closed:  ${result.summary.position_closed ? '✅ YES' : '❌ NO'}`);
    console.log('');
  }

  // Steps
  if (result.steps && result.steps.length > 0) {
    console.log('🔍 Test Steps:');
    result.steps.forEach((step, index) => {
      const status = step.success ? '✅' : '❌';
      const timestamp = new Date(step.timestamp).toLocaleTimeString();
      console.log(`   ${status} Step ${step.step}: ${step.name}`);
      console.log(`      ${step.message}`);
      if (step.error) {
        console.log(`      ❌ Error: ${step.error}`);
      }
      console.log(`      🕐 ${timestamp}`);
      console.log('');
    });
  }

  // Orders
  if (result.orders) {
    if (result.orders.buy_order) {
      console.log('📈 BUY Order Details:');
      console.log(`   Order ID: ${result.orders.buy_order.order_id || 'N/A'}`);
      console.log(`   Status: ${result.orders.buy_order.order_status || 'N/A'}`);
      console.log(`   Success: ${result.orders.buy_order.success ? 'YES' : 'NO'}`);
      if (result.orders.buy_order.error) {
        console.log(`   Error: ${result.orders.buy_order.error}`);
      }
      console.log('');
    }

    if (result.orders.sell_order) {
      console.log('📉 SELL Order Details:');
      console.log(`   Order ID: ${result.orders.sell_order.order_id || 'N/A'}`);
      console.log(`   Status: ${result.orders.sell_order.order_status || 'N/A'}`);
      console.log(`   Success: ${result.orders.sell_order.success ? 'YES' : 'NO'}`);
      if (result.orders.sell_order.error) {
        console.log(`   Error: ${result.orders.sell_order.error}`);
      }
      console.log('');
    }
  }

  // Positions
  if (result.positions) {
    if (result.positions.created_position) {
      console.log('💼 Position Created:');
      const pos = result.positions.created_position;
      console.log(`   Symbol: ${pos.symbol || 'N/A'}`);
      console.log(`   Quantity: ${pos.entry_quantity || 'N/A'}`);
      console.log(`   Entry Price: ₹${pos.entry_price || 'N/A'}`);
      console.log(`   Status: ${pos.status || 'N/A'}`);
      console.log('');
    }

    if (result.positions.final_position) {
      console.log('🏁 Final Position:');
      const pos = result.positions.final_position;
      console.log(`   Status: ${pos.status || 'N/A'}`);
      console.log(`   Exit Price: ₹${pos.exit_price || 'N/A'}`);
      console.log(`   PnL: ${pos.pnl_percentage ? pos.pnl_percentage.toFixed(2) + '%' : 'N/A'}`);
      console.log('');
    }
  }

  // Error details
  if (result.error) {
    console.log('❌ Error Details:');
    console.log(`   ${result.error}`);
    console.log('');
  }

  console.log('=' .repeat(50));
  console.log(`🏁 Test completed at ${new Date().toLocaleTimeString()}`);
  
  // Final recommendation
  if (result.success) {
    console.log('✅ MTF BUY-SELL functionality is working correctly!');
  } else {
    console.log('❌ MTF BUY-SELL functionality has issues. Check the logs above.');
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Test cancelled by user');
  process.exit(0);
});
