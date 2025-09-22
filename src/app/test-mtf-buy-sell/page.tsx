'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface TestStep {
  step: number;
  name: string;
  success: boolean;
  data?: any;
  message: string;
  error?: string;
  timestamp: string;
}

interface TestResult {
  success: boolean;
  user_id: string;
  symbol: string;
  test_mode: boolean;
  steps: TestStep[];
  summary: {
    buy_order_success: boolean;
    sell_order_success: boolean;
    position_created: boolean;
    position_closed: boolean;
    total_duration_ms: number;
  };
  orders: {
    buy_order?: any;
    sell_order?: any;
  };
  positions: {
    created_position?: any;
    final_position?: any;
  };
}

export default function TestMTFBuySellPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [formData, setFormData] = useState({
    user_id: '',
    symbol: 'RELIANCE',
    quantity: '',
    test_mode: true,
    delay_between_orders: 5000
  });

  const runTest = async () => {
    if (!formData.user_id.trim()) {
      alert('Please enter a User ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/debug/test-mtf-buy-sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: formData.user_id,
          symbol: formData.symbol,
          quantity: formData.quantity ? parseInt(formData.quantity) : undefined,
          test_mode: formData.test_mode,
          delay_between_orders: formData.delay_between_orders
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        user_id: formData.user_id,
        symbol: formData.symbol,
        test_mode: formData.test_mode,
        steps: [],
        summary: {
          buy_order_success: false,
          sell_order_success: false,
          position_created: false,
          position_closed: false,
          total_duration_ms: 0
        },
        orders: {},
        positions: {}
      });
    } finally {
      setLoading(false);
    }
  };

  const getStepIcon = (step: TestStep) => {
    if (step.success) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (step.error) return <XCircle className="w-5 h-5 text-red-500" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusColor = (success: boolean) => {
    return success ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">MTF BUY-SELL Test</h1>
              <p className="text-gray-600 mt-1">Test complete MTF trading flow: BUY → Hold → SELL</p>
            </div>
          </div>

          {/* Test Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID *
              </label>
              <input
                type="text"
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Enter user ID for testing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock Symbol
              </label>
              <select
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="RELIANCE">RELIANCE</option>
                <option value="HDFCBANK">HDFCBANK</option>
                <option value="TCS">TCS</option>
                <option value="INFY">INFY</option>
                <option value="ICICIBANK">ICICIBANK</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity (Optional)
              </label>
              <input
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Auto-calculated from MTF margin"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Mode
              </label>
              <select
                value={formData.test_mode.toString()}
                onChange={(e) => setFormData({ ...formData, test_mode: e.target.value === 'true' })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="true">Simulation (Safe)</option>
                <option value="false">Real Orders (Live)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delay Between Orders (ms)
              </label>
              <input
                type="number"
                value={formData.delay_between_orders}
                onChange={(e) => setFormData({ ...formData, delay_between_orders: parseInt(e.target.value) || 5000 })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                min="1000"
                step="1000"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={runTest}
                disabled={loading || !formData.user_id.trim()}
                className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? 'Running Test...' : 'Start MTF Test'}
              </button>
            </div>
          </div>

          {/* Warning for Real Mode */}
          {!formData.test_mode && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="font-semibold text-red-800">Real Trading Mode</span>
              </div>
              <p className="text-red-700 mt-1">
                This will place actual BUY and SELL orders with real money. Make sure you understand the risks.
              </p>
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className={`p-6 rounded-2xl shadow-lg ${getStatusColor(result.summary.buy_order_success)}`}>
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6" />
                  <div>
                    <p className="font-semibold">BUY Order</p>
                    <p className="text-sm">{result.summary.buy_order_success ? 'Success' : 'Failed'}</p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl shadow-lg ${getStatusColor(result.summary.sell_order_success)}`}>
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-6 h-6" />
                  <div>
                    <p className="font-semibold">SELL Order</p>
                    <p className="text-sm">{result.summary.sell_order_success ? 'Success' : 'Failed'}</p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl shadow-lg ${getStatusColor(result.summary.position_created)}`}>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-6 h-6" />
                  <div>
                    <p className="font-semibold">Position</p>
                    <p className="text-sm">{result.summary.position_created ? 'Created' : 'Failed'}</p>
                  </div>
                </div>
              </div>

              <div className={`p-6 rounded-2xl shadow-lg ${getStatusColor(result.summary.position_closed)}`}>
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6" />
                  <div>
                    <p className="font-semibold">Closure</p>
                    <p className="text-sm">{result.summary.position_closed ? 'Closed' : 'Open'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Result */}
            <div className={`p-6 rounded-2xl shadow-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-3 mb-4">
                {result.success ? (
                  <CheckCircle className="w-8 h-8 text-green-500" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-500" />
                )}
                <div>
                  <h3 className={`text-xl font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                    {result.success ? 'MTF Test Completed Successfully!' : 'MTF Test Failed'}
                  </h3>
                  <p className={`${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    Total Duration: {result.summary.total_duration_ms}ms | Mode: {result.test_mode ? 'Simulation' : 'Real Trading'}
                  </p>
                </div>
              </div>
            </div>

            {/* Detailed Steps */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Test Steps</h3>
              <div className="space-y-4">
                {result.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl">
                    {getStepIcon(step)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900">Step {step.step}: {step.name}</span>
                        <span className="text-xs text-gray-500">{new Date(step.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-gray-700 mb-2">{step.message}</p>
                      {step.error && (
                        <p className="text-red-600 text-sm font-medium">Error: {step.error}</p>
                      )}
                      {step.data && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                            View Details
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs overflow-x-auto">
                            {JSON.stringify(step.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Details */}
            {(result.orders.buy_order || result.orders.sell_order) && (
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Order Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {result.orders.buy_order && (
                    <div>
                      <h4 className="font-semibold text-green-700 mb-3">BUY Order</h4>
                      <pre className="p-4 bg-green-50 rounded-lg text-sm overflow-x-auto">
                        {JSON.stringify(result.orders.buy_order, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.orders.sell_order && (
                    <div>
                      <h4 className="font-semibold text-red-700 mb-3">SELL Order</h4>
                      <pre className="p-4 bg-red-50 rounded-lg text-sm overflow-x-auto">
                        {JSON.stringify(result.orders.sell_order, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Position Details */}
            {(result.positions.created_position || result.positions.final_position) && (
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Position Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {result.positions.created_position && (
                    <div>
                      <h4 className="font-semibold text-blue-700 mb-3">Created Position</h4>
                      <pre className="p-4 bg-blue-50 rounded-lg text-sm overflow-x-auto">
                        {JSON.stringify(result.positions.created_position, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.positions.final_position && (
                    <div>
                      <h4 className="font-semibold text-purple-700 mb-3">Final Position</h4>
                      <pre className="p-4 bg-purple-50 rounded-lg text-sm overflow-x-auto">
                        {JSON.stringify(result.positions.final_position, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
