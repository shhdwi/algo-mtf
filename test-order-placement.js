#!/usr/bin/env node

/**
 * Order Placement Test Script
 * Tests the order placement service with different scenarios
 */

const BASE_URL = 'http://localhost:3000';

async function testOrderPlacement(testConfig) {
  console.log(`\n🧪 Testing: ${testConfig.name}`);
  console.log('📋 Config:', JSON.stringify(testConfig.params, null, 2));
  
  try {
    const response = await fetch(`${BASE_URL}/api/test/order-placement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testConfig.params)
    });

    const result = await response.json();
    
    console.log(`\n📊 Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`📈 Final Status: ${result.test_results?.final_result || 'Unknown'}`);
    
    if (result.test_results?.steps) {
      console.log('\n📝 Step-by-step results:');
      result.test_results.steps.forEach((step, index) => {
        const status = step.success ? '✅' : '❌';
        console.log(`   ${status} Step ${step.step}: ${step.name} - ${step.message}`);
        if (step.error) {
          console.log(`      ⚠️  Error: ${step.error}`);
        }
      });
    }

    if (result.summary) {
      console.log(`\n📊 Summary: ${result.summary.successful_steps}/${result.summary.total_steps} steps successful`);
    }

    return result;

  } catch (error) {
    console.error(`❌ Test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🚀 Starting Order Placement Service Tests...\n');

  // Test configurations
  const tests = [
    {
      name: 'Simulated RELIANCE Buy Order',
      params: {
        user_id: 'test-user-123', // Replace with actual user ID
        symbol: 'RELIANCE',
        test_mode: true,
        transaction_type: 'BUY',
        price_override: 2500
      }
    },
    {
      name: 'Simulated INFY Buy Order',
      params: {
        user_id: 'test-user-123', // Replace with actual user ID
        symbol: 'INFY',
        test_mode: true,
        transaction_type: 'BUY',
        price_override: 1500
      }
    },
    {
      name: 'Invalid User Test',
      params: {
        user_id: 'invalid-user-999',
        symbol: 'RELIANCE',
        test_mode: true,
        transaction_type: 'BUY'
      }
    },
    {
      name: 'High Price Stock Test',
      params: {
        user_id: 'test-user-123', // Replace with actual user ID
        symbol: 'MRF',
        test_mode: true,
        transaction_type: 'BUY',
        price_override: 120000 // Very expensive stock
      }
    }
  ];

  const results = [];
  
  for (const test of tests) {
    const result = await testOrderPlacement(test);
    results.push({ ...test, result });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  results.forEach((test, index) => {
    const status = test.result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${index + 1}. ${test.name}: ${status}`);
  });

  const passedTests = results.filter(t => t.result.success).length;
  console.log(`\n🏁 Overall: ${passedTests}/${results.length} tests passed`);

  if (passedTests === results.length) {
    console.log('🎉 All tests passed! Order placement service is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
  }
}

// Check if we have command line arguments
const args = process.argv.slice(2);

if (args.length > 0) {
  // Single test mode
  const userId = args[0];
  const symbol = args[1] || 'RELIANCE';
  const testMode = args[2] !== 'false'; // Default to true unless explicitly false
  
  console.log('🎯 Single Test Mode');
  testOrderPlacement({
    name: `Custom Test: ${symbol}`,
    params: {
      user_id: userId,
      symbol: symbol,
      test_mode: testMode,
      transaction_type: 'BUY'
    }
  });
} else {
  // Run all tests
  runAllTests();
}

console.log('\n📖 Usage:');
console.log('  node test-order-placement.js                    # Run all tests');
console.log('  node test-order-placement.js USER_ID            # Test specific user');
console.log('  node test-order-placement.js USER_ID SYMBOL     # Test specific user + symbol');
console.log('  node test-order-placement.js USER_ID SYMBOL false # Real order (CAREFUL!)');
console.log('\n⚠️  IMPORTANT: Replace "test-user-123" with actual user ID from your database!');
