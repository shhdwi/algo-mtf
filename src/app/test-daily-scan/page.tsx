'use client';

import React, { useState } from 'react';
import { Play, Users, TrendingUp, DollarSign, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface SimulationResult {
  success: boolean;
  message: string;
  data?: {
    scan_results: any;
    entry_signals: any[];
    user_simulations: any[];
    summary: {
      total_entry_signals: number;
      users_tested: number;
      total_users_available: number;
      successful_simulations: number;
      total_investment_simulated: number;
      total_errors: number;
      dry_run: boolean;
      timestamp: string;
    };
  };
  error?: string;
}

export default function TestDailyScanPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [limitUsers, setLimitUsers] = useState<number | null>(null);

  const runDryRunTest = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/debug/test-daily-scan-dry-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exchange: 'NSE',
          limit_users: limitUsers
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: 'Test failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">
                Daily Scan Dry Run Test
              </h1>
              <p className="text-slate-600">
                Test the complete daily scan and order execution flow without notifications or database writes
              </p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-sm font-medium">
                <AlertCircle className="w-4 h-4 mr-2" />
                DRY RUN MODE
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Test Configuration</h2>
          
          <div className="flex items-center gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Limit Users (optional)
              </label>
              <input
                type="number"
                value={limitUsers || ''}
                onChange={(e) => setLimitUsers(e.target.value ? parseInt(e.target.value) : null)}
                placeholder="All users"
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-32"
              />
              <p className="text-xs text-slate-500 mt-1">Leave empty to test all users</p>
            </div>
          </div>

          <button
            onClick={runDryRunTest}
            disabled={loading}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl shadow-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {loading ? (
              <>
                <Clock className="w-5 h-5 mr-2 animate-spin" />
                Running Simulation...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Run Dry Run Test
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            {result.success && result.data && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Entry Signals</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {result.data.summary.total_entry_signals}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Users Tested</p>
                      <p className="text-2xl font-bold text-indigo-600">
                        {result.data.summary.users_tested}
                      </p>
                      <p className="text-xs text-slate-500">
                        of {result.data.summary.total_users_available} total
                      </p>
                    </div>
                    <Users className="w-8 h-8 text-indigo-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Successful Simulations</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {result.data.summary.successful_simulations}
                      </p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600">Total Investment</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(result.data.summary.total_investment_simulated)}
                      </p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Results */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-xl font-semibold text-slate-800">
                  {result.success ? 'Simulation Results' : 'Error Details'}
                </h3>
              </div>
              
              <div className="p-6">
                {result.success ? (
                  <div className="space-y-6">
                    {/* Entry Signals */}
                    {result.data?.entry_signals && result.data.entry_signals.length > 0 && (
                      <div>
                        <h4 className="text-lg font-medium text-slate-800 mb-3">Entry Signals Found</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {result.data.entry_signals.map((signal, index) => (
                            <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                              <div className="font-medium text-slate-800">{signal.symbol}</div>
                              <div className="text-sm text-slate-600 mt-1">
                                Price: ₹{signal.current_price}
                              </div>
                              <div className="text-sm text-slate-600">
                                RSI: {signal.rsi?.toFixed(2)} | Volume: {signal.volume_ratio?.toFixed(2)}x
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* User Simulations */}
                    {result.data?.user_simulations && result.data.user_simulations.length > 0 && (
                      <div>
                        <h4 className="text-lg font-medium text-slate-800 mb-3">User Simulations</h4>
                        <div className="space-y-4">
                          {result.data.user_simulations.map((userSim, index) => (
                            <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <div className="font-medium text-slate-800">{userSim.user.full_name}</div>
                                  <div className="text-sm text-slate-600">
                                    Capital: {formatCurrency(userSim.user.total_capital)} | 
                                    Allocation: {userSim.user.allocation_percentage}%
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-emerald-600">
                                    {userSim.summary.successful_simulations}/{userSim.summary.attempted_orders} successful
                                  </div>
                                  <div className="text-sm text-slate-600">
                                    {formatCurrency(userSim.summary.total_investment_simulated)} simulated
                                  </div>
                                </div>
                              </div>
                              
                              {userSim.orders.length > 0 && (
                                <div className="mt-3">
                                  <div className="text-sm font-medium text-slate-700 mb-2">Simulated Orders:</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {userSim.orders.map((order: any, orderIndex: number) => (
                                      <div key={orderIndex} className="bg-white rounded p-3 border border-slate-200 text-sm">
                                        <div className="font-medium">{order.symbol}</div>
                                        <div className="text-slate-600">
                                          {order.quantity} shares @ ₹{order.price}
                                        </div>
                                        <div className="text-slate-600">
                                          Total: {formatCurrency(order.amount)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {userSim.errors.length > 0 && (
                                <div className="mt-3">
                                  <div className="text-sm font-medium text-red-700 mb-2">Errors:</div>
                                  <div className="space-y-1">
                                    {userSim.errors.map((error: string, errorIndex: number) => (
                                      <div key={errorIndex} className="text-sm text-red-600 bg-red-50 rounded p-2">
                                        {error}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                      <div className="text-red-800 font-medium">Error</div>
                    </div>
                    <div className="text-red-700 mt-2">
                      {result.error || result.message}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
