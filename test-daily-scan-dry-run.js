#!/usr/bin/env node

const https = require('https');

const API_BASE = 'http://localhost:3001'; // Adjust port if needed

async function testDailyScanDryRun(limitUsers = null) {
  const payload = {
    exchange: 'NSE',
    limit_users: limitUsers
  };

  console.log('🧪 Starting Daily Scan Dry Run Test...');
  console.log(`📊 Configuration: ${limitUsers ? `Testing ${limitUsers} users` : 'Testing all users'}`);
  console.log('⏳ This may take a few moments...\n');

  try {
    const response = await fetch(`${API_BASE}/api/debug/test-daily-scan-dry-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ DRY RUN COMPLETED SUCCESSFULLY!\n');
      
      if (result.data) {
        const summary = result.data.summary;
        
        console.log('📊 SUMMARY:');
        console.log(`   Entry Signals Found: ${summary.total_entry_signals}`);
        console.log(`   Users Tested: ${summary.users_tested} (of ${summary.total_users_available} total)`);
        console.log(`   Successful Simulations: ${summary.successful_simulations}`);
        console.log(`   Total Investment Simulated: ₹${summary.total_investment_simulated.toLocaleString('en-IN')}`);
        console.log(`   Errors: ${summary.total_errors}`);
        console.log(`   Timestamp: ${new Date(summary.timestamp).toLocaleString()}\n`);

        if (result.data.entry_signals && result.data.entry_signals.length > 0) {
          console.log('📈 ENTRY SIGNALS:');
          result.data.entry_signals.forEach((signal, index) => {
            console.log(`   ${index + 1}. ${signal.symbol} @ ₹${signal.current_price} (RSI: ${signal.rsi?.toFixed(2)})`);
          });
          console.log('');
        }

        if (result.data.user_simulations && result.data.user_simulations.length > 0) {
          console.log('👥 USER SIMULATIONS:');
          result.data.user_simulations.forEach((userSim, index) => {
            const user = userSim.user;
            const summary = userSim.summary;
            
            console.log(`   ${index + 1}. ${user.full_name}`);
            console.log(`      Capital: ₹${user.total_capital.toLocaleString('en-IN')} | Allocation: ${user.allocation_percentage}%`);
            console.log(`      Simulations: ${summary.successful_simulations}/${summary.attempted_orders} successful`);
            console.log(`      Investment Simulated: ₹${summary.total_investment_simulated.toLocaleString('en-IN')}`);
            
            if (userSim.errors.length > 0) {
              console.log(`      Errors: ${userSim.errors.join(', ')}`);
            }
            
            if (userSim.orders.length > 0) {
              console.log(`      Orders: ${userSim.orders.map(o => `${o.symbol}(${o.quantity})`).join(', ')}`);
            }
            console.log('');
          });
        }
      }
    } else {
      console.log('❌ DRY RUN FAILED!');
      console.log(`Error: ${result.error || result.message}`);
    }

  } catch (error) {
    console.log('❌ REQUEST FAILED!');
    console.log(`Error: ${error.message}`);
    console.log('\n💡 Make sure your development server is running on the correct port.');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const limitUsers = args.length > 0 ? parseInt(args[0]) : null;

if (args.includes('--help') || args.includes('-h')) {
  console.log('Daily Scan Dry Run Test');
  console.log('Usage: node test-daily-scan-dry-run.js [limit_users]');
  console.log('');
  console.log('Examples:');
  console.log('  node test-daily-scan-dry-run.js        # Test all users');
  console.log('  node test-daily-scan-dry-run.js 2      # Test only first 2 users');
  console.log('  node test-daily-scan-dry-run.js --help # Show this help');
  process.exit(0);
}

// Run the test
testDailyScanDryRun(limitUsers);
