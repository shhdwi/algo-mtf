// Test utilities for Chart service
import ChartService from '@/services/chartService';
import { ALL_SYMBOLS, STOCK_CATEGORIES } from '@/constants/symbols';
import { ExchangeCode, TimeInterval } from '@/types/chart';

/**
 * Test single symbol chart data
 */
export const testSingleChart = async (
  symbol: string = 'RELIANCE',
  interval: TimeInterval = '5m',
  duration: string = '1h'
) => {
  console.log(`Testing chart data for ${symbol}...`);
  
  try {
    const response = await fetch('/api/chart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol,
        interval,
        duration,
        exchange: 'NSE'
      }),
    });

    const result = await response.json();
    console.log('Single Chart API Response:', result);
    return result;
  } catch (error) {
    console.error('Single chart test failed:', error);
    throw error;
  }
};

/**
 * Test multiple symbols chart data
 */
export const testMultipleCharts = async (
  symbols: string[] = ['RELIANCE', 'TCS', 'HDFCBANK'],
  interval: TimeInterval = '5m',
  duration: string = '1h'
) => {
  console.log(`Testing multiple chart data for ${symbols.join(', ')}...`);
  
  try {
    const response = await fetch('/api/chart/multiple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols,
        options: {
          interval,
          duration,
          exchange: 'NSE'
        }
      }),
    });

    const result = await response.json();
    console.log('Multiple Chart API Response:', result);
    return result;
  } catch (error) {
    console.error('Multiple charts test failed:', error);
    throw error;
  }
};

/**
 * Test current price API
 */
export const testCurrentPrice = async (symbol: string = 'RELIANCE') => {
  console.log(`Testing current price for ${symbol}...`);
  
  try {
    const response = await fetch(`/api/chart?action=current-price&symbol=${symbol}&exchange=NSE`);
    const result = await response.json();
    console.log('Current Price API Response:', result);
    return result;
  } catch (error) {
    console.error('Current price test failed:', error);
    throw error;
  }
};

/**
 * Test intraday data API
 */
export const testIntradayData = async (
  symbol: string = 'RELIANCE',
  interval: TimeInterval = '5m'
) => {
  console.log(`Testing intraday data for ${symbol}...`);
  
  try {
    const response = await fetch(`/api/chart?action=intraday&symbol=${symbol}&interval=${interval}&exchange=NSE`);
    const result = await response.json();
    console.log('Intraday API Response:', result);
    return result;
  } catch (error) {
    console.error('Intraday test failed:', error);
    throw error;
  }
};

/**
 * Test historical data API
 */
export const testHistoricalData = async (
  symbol: string = 'RELIANCE',
  startDate: string = '2024-01-01T09:15:00',
  endDate: string = '2024-01-31T15:30:00',
  interval: TimeInterval = '1d'
) => {
  console.log(`Testing historical data for ${symbol}...`);
  
  try {
    const response = await fetch('/api/chart/historical', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol,
        exchange: 'NSE',
        interval,
        startDate,
        endDate
      }),
    });

    const result = await response.json();
    console.log('Historical Data API Response:', result);
    return result;
  } catch (error) {
    console.error('Historical data test failed:', error);
    throw error;
  }
};

/**
 * Test historical period data API
 */
export const testHistoricalPeriodData = async (
  symbol: string = 'RELIANCE',
  period: string = '1Month'
) => {
  console.log(`Testing historical period data for ${symbol} (${period})...`);
  
  try {
    const response = await fetch('/api/chart/historical/period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol,
        exchange: 'NSE',
        period
      }),
    });

    const result = await response.json();
    console.log('Historical Period API Response:', result);
    return result;
  } catch (error) {
    console.error('Historical period test failed:', error);
    throw error;
  }
};

/**
 * Test symbols list API
 */
export const testSymbolsList = async () => {
  console.log('Testing symbols list API...');
  
  try {
    const response = await fetch('/api/chart?action=symbols');
    const result = await response.json();
    console.log('Symbols API Response:', result);
    return result;
  } catch (error) {
    console.error('Symbols list test failed:', error);
    throw error;
  }
};

/**
 * Test banking sector stocks
 */
export const testBankingStocks = async () => {
  return testMultipleCharts(STOCK_CATEGORIES.BANKING, '5m', '2h');
};

/**
 * Test IT sector stocks
 */
export const testITStocks = async () => {
  return testMultipleCharts(STOCK_CATEGORIES.IT, '5m', '2h');
};

/**
 * Test 2-year historical data
 */
export const test2YearHistoricalData = async (symbol: string = 'RELIANCE') => {
  return testHistoricalPeriodData(symbol, '2y');
};

/**
 * Run comprehensive test suite
 */
export const runChartTestSuite = async () => {
  console.log('🚀 Starting Chart Service Test Suite...\n');

  const tests = [
    { name: 'Symbols List', fn: testSymbolsList },
    { name: 'Single Chart (RELIANCE)', fn: () => testSingleChart('RELIANCE') },
    { name: 'Current Price (TCS)', fn: () => testCurrentPrice('TCS') },
    { name: 'Intraday Data (HDFCBANK)', fn: () => testIntradayData('HDFCBANK') },
    { name: 'Historical Data (RELIANCE - 1 month)', fn: () => testHistoricalData('RELIANCE', '2024-01-01T09:15:00', '2024-01-31T15:30:00', '1d') },
    { name: 'Historical Period (TCS - 1 week)', fn: () => testHistoricalPeriodData('TCS', '1w') },
    { name: 'Multiple Charts (Top 3)', fn: () => testMultipleCharts(['RELIANCE', 'TCS', 'HDFCBANK']) },
    { name: 'Banking Sector', fn: testBankingStocks }
  ];

  const results = [];

  for (const test of tests) {
    try {
      console.log(`\n📊 Running test: ${test.name}`);
      const result = await test.fn();
      results.push({ name: test.name, status: 'PASSED', result });
      console.log(`✅ ${test.name} - PASSED`);
    } catch (error) {
      results.push({ name: test.name, status: 'FAILED', error: error.message });
      console.log(`❌ ${test.name} - FAILED:`, error.message);
    }
  }

  console.log('\n📈 Test Suite Summary:');
  results.forEach(result => {
    console.log(`${result.status === 'PASSED' ? '✅' : '❌'} ${result.name}`);
  });

  return results;
};

/**
 * cURL examples for testing
 */
export const getCurlExamples = () => {
  const baseUrl = 'http://localhost:3000';
  
  return {
    singleChart: `curl -X POST ${baseUrl}/api/chart \\
  -H "Content-Type: application/json" \\
  -d '{
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "interval": "5m",
    "duration": "1h"
  }'`,

    multipleCharts: `curl -X POST ${baseUrl}/api/chart/multiple \\
  -H "Content-Type: application/json" \\
  -d '{
    "symbols": ["RELIANCE", "TCS", "HDFCBANK"],
    "options": {
      "exchange": "NSE",
      "interval": "5m",
      "duration": "2h"
    }
  }'`,

    historicalData: `curl -X POST ${baseUrl}/api/chart/historical \\
  -H "Content-Type: application/json" \\
  -d '{
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "interval": "1d",
    "startDate": "2024-01-01T09:15:00",
    "endDate": "2024-01-31T15:30:00"
  }'`,

    historicalPeriod: `curl -X POST ${baseUrl}/api/chart/historical/period \\
  -H "Content-Type: application/json" \\
  -d '{
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "period": "1Month"
  }'`,

    currentPrice: `curl "${baseUrl}/api/chart?action=current-price&symbol=RELIANCE&exchange=NSE"`,

    intradayData: `curl "${baseUrl}/api/chart?action=intraday&symbol=RELIANCE&interval=5m&exchange=NSE"`,

    symbolsList: `curl "${baseUrl}/api/chart?action=symbols"`
  };
};

// Example usage in browser console:
// runChartTestSuite().then(console.log).catch(console.error);
// testSingleChart('RELIANCE', '5m', '1h').then(console.log).catch(console.error);
