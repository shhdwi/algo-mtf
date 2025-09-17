'use client';

import { useState } from 'react';

export default function TestOrderPage() {
  const [testConfig, setTestConfig] = useState({
    user_id: '',
    symbol: 'RELIANCE',
    test_mode: true,
    transaction_type: 'BUY',
    price_override: 2500
  });
  
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    if (!testConfig.user_id.trim()) {
      alert('Please enter a User ID');
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/test/order-placement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testConfig)
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const getStepIcon = (success: boolean) => success ? '✅' : '❌';
  const getResultColor = (success: boolean) => success ? 'text-green-600' : 'text-red-600';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            🧪 Order Placement Test
          </h1>

          {/* Test Configuration */}
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-blue-800 mb-4">Test Configuration</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User ID *
                </label>
                <input
                  type="text"
                  value={testConfig.user_id}
                  onChange={(e) => setTestConfig({...testConfig, user_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter user ID from database"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Symbol
                </label>
                <select
                  value={testConfig.symbol}
                  onChange={(e) => setTestConfig({...testConfig, symbol: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="RELIANCE">RELIANCE</option>
                  <option value="INFY">INFY</option>
                  <option value="TCS">TCS</option>
                  <option value="HDFCBANK">HDFCBANK</option>
                  <option value="ICICIBANK">ICICIBANK</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transaction Type
                </label>
                <select
                  value={testConfig.transaction_type}
                  onChange={(e) => setTestConfig({...testConfig, transaction_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price Override (₹)
                </label>
                <input
                  type="number"
                  value={testConfig.price_override}
                  onChange={(e) => setTestConfig({...testConfig, price_override: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={testConfig.test_mode}
                  onChange={(e) => setTestConfig({...testConfig, test_mode: e.target.checked})}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  Test Mode (Simulate only - no real orders)
                </span>
              </label>
              {!testConfig.test_mode && (
                <div className="mt-2 p-3 bg-red-100 border border-red-400 rounded-md">
                  <p className="text-red-700 text-sm font-medium">
                    ⚠️ WARNING: Test mode is OFF. This will place REAL orders!
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleTest}
              disabled={loading}
              className="mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition-colors"
            >
              {loading ? '🔄 Testing...' : '🚀 Run Test'}
            </button>
          </div>

          {/* Test Results */}
          {testResult && (
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Test Results</h2>
              
              {/* Overall Status */}
              <div className={`p-4 rounded-lg mb-4 ${testResult.success ? 'bg-green-100 border border-green-400' : 'bg-red-100 border border-red-400'}`}>
                <div className={`font-semibold ${getResultColor(testResult.success)}`}>
                  {testResult.success ? '✅ Test Passed' : '❌ Test Failed'}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {testResult.message}
                </div>
                {testResult.test_results?.final_result && (
                  <div className="text-sm font-medium mt-2">
                    Final Result: {testResult.test_results.final_result}
                  </div>
                )}
              </div>

              {/* Step-by-step Results */}
              {testResult.test_results?.steps && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-700">Step-by-step Results:</h3>
                  {testResult.test_results.steps.map((step: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">
                          {getStepIcon(step.success)} Step {step.step}: {step.name}
                        </div>
                        <div className={`text-sm font-medium ${getResultColor(step.success)}`}>
                          {step.success ? 'SUCCESS' : 'FAILED'}
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {step.message}
                      </div>
                      {step.data && (
                        <div className="bg-gray-100 rounded p-2 text-xs">
                          <pre>{JSON.stringify(step.data, null, 2)}</pre>
                        </div>
                      )}
                      {step.error && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700 mt-2">
                          <strong>Error:</strong> {step.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {testResult.summary && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">Summary</h3>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div>Total Steps: {testResult.summary.total_steps}</div>
                    <div>Successful Steps: {testResult.summary.successful_steps}</div>
                    <div>Test Mode: {testResult.summary.test_mode ? 'Simulated' : 'Real Orders'}</div>
                    <div>Timestamp: {new Date(testResult.summary.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
