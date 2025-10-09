'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, BarChart3, ArrowLeft, Filter } from 'lucide-react';

interface UserPnL {
  user_id: string;
  user_name: string;
  email: string;
  phone_number: string;
  is_active: boolean;
  is_real_trading_enabled: boolean;
  total_capital: number;
  total_positions: number;
  active_positions: number;
  exited_positions: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  capital_deployed: number;
  total_investment: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_pnl_per_trade: number;
  best_trade: {
    symbol: string;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_percentage: number;
  } | null;
  worst_trade: {
    symbol: string;
    entry_price: number;
    exit_price: number;
    pnl: number;
    pnl_percentage: number;
  } | null;
  all_positions: Array<{
    symbol: string;
    status: string;
    entry_date: string;
    entry_time: string;
    entry_price: number;
    current_price: number;
    exit_price: number;
    exit_date: string;
    exit_time: string;
    exit_reason: string;
    quantity: number;
    pnl_amount: number;
    pnl_percentage: number;
    margin_pnl_percentage?: number;
    trailing_level: number;
    margin_required?: number;
    leverage?: number;
    position_value?: number;
  }>;
}

interface OverallStats {
  total_users: number;
  active_users: number;
  trading_enabled_users: number;
  total_pnl: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  total_capital_deployed: number;
  total_positions: number;
  best_performing_user: UserPnL;
  worst_performing_user: UserPnL;
}

export default function UsersPnLPage() {
  const [users, setUsers] = useState<UserPnL[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserPnL | null>(null);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'profitable' | 'loss'>('all');

  const fetchUsersPnL = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users/pnl');
      const result = await response.json();
      
      if (result.success) {
        setUsers(result.data.users);
        setOverallStats(result.data.overall_stats);
      } else {
        console.error('Failed to fetch users PnL:', result.error);
      }
    } catch (error) {
      console.error('Error fetching users PnL:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersPnL();
  }, []);

  // Reset filter when user changes
  useEffect(() => {
    setTradeFilter('all');
  }, [selectedUser]);

  // Filter trades based on selected filter
  const filteredTrades = useMemo(() => {
    if (!selectedUser) return [];
    
    switch (tradeFilter) {
      case 'profitable':
        return selectedUser.all_positions.filter(p => p.pnl_amount > 0);
      case 'loss':
        return selectedUser.all_positions.filter(p => p.pnl_amount < 0);
      default:
        return selectedUser.all_positions;
    }
  }, [selectedUser, tradeFilter]);

  // Calculate filtered PnL
  const filteredPnL = useMemo(() => {
    if (!filteredTrades.length) return 0;
    return filteredTrades.reduce((sum, trade) => sum + trade.pnl_amount, 0);
  }, [filteredTrades]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  const getPnLColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-900';
  };

  const getBgPnLColor = (pnl: number) => {
    if (pnl > 0) return 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200';
    if (pnl < 0) return 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200';
    return 'bg-gray-50 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
          <p className="text-gray-600">Loading user PnL data...</p>
        </div>
      </div>
    );
  }

  if (selectedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-sm shadow-xl border-b border-emerald-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="mr-4 p-2 hover:bg-emerald-100 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-emerald-600" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                    {selectedUser.user_name}
                  </h1>
                  <p className="text-sm text-slate-600">{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold ${
                  selectedUser.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedUser.is_active ? '● Active' : '● Inactive'}
                </span>
                <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold ${
                  selectedUser.is_real_trading_enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {selectedUser.is_real_trading_enabled ? '📈 Trading Enabled' : '📊 Trading Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* PnL Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className={`rounded-2xl shadow-xl border p-6 ${getBgPnLColor(selectedUser.total_pnl)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Total P&L</p>
                  <p className={`text-2xl font-bold ${getPnLColor(selectedUser.total_pnl)}`}>
                    {formatCurrency(selectedUser.total_pnl)}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    Realized: {formatCurrency(selectedUser.realized_pnl)}
                  </p>
                </div>
                <DollarSign className={`w-8 h-8 ${getPnLColor(selectedUser.total_pnl)}`} />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-teal-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Win Rate</p>
                  <p className="text-2xl font-bold text-teal-600">
                    {selectedUser.win_rate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    {selectedUser.winning_trades}W / {selectedUser.losing_trades}L
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-teal-600" />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-cyan-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Total Positions</p>
                  <p className="text-2xl font-bold text-cyan-600">
                    {selectedUser.total_positions}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    {selectedUser.active_positions} Active / {selectedUser.exited_positions} Exited
                  </p>
                </div>
                <Activity className="w-8 h-8 text-cyan-600" />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-purple-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Margin Deployed</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(selectedUser.capital_deployed)}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    Avg/Trade: {formatCurrency(selectedUser.avg_pnl_per_trade)}
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Best/Worst Trades */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {selectedUser.best_trade && (
              <div className="bg-white/90 rounded-2xl shadow-xl border border-green-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 text-green-600 mr-2" />
                  Best Trade
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-900">Symbol:</span>
                    <span className="font-bold text-gray-900">{selectedUser.best_trade.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-900">Entry:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(selectedUser.best_trade.entry_price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-900">Exit:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(selectedUser.best_trade.exit_price)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-green-200">
                    <span className="text-gray-900 font-semibold">P&L:</span>
                    <div className="text-right">
                      <div className="font-bold text-green-600">{formatCurrency(selectedUser.best_trade.pnl)}</div>
                      <div className="text-sm text-green-600">{formatPercentage(selectedUser.best_trade.pnl_percentage)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedUser.worst_trade && (
              <div className="bg-white/90 rounded-2xl shadow-xl border border-red-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                  Worst Trade
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-900">Symbol:</span>
                    <span className="font-bold text-gray-900">{selectedUser.worst_trade.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-900">Entry:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(selectedUser.worst_trade.entry_price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-900">Exit:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(selectedUser.worst_trade.exit_price)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-red-200">
                    <span className="text-gray-900 font-semibold">P&L:</span>
                    <div className="text-right">
                      <div className="font-bold text-red-600">{formatCurrency(selectedUser.worst_trade.pnl)}</div>
                      <div className="text-sm text-red-600">{formatPercentage(selectedUser.worst_trade.pnl_percentage)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trade Filters and Overall PnL */}
          <div className="bg-white/90 rounded-2xl shadow-xl border border-emerald-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-800">Trade Filters</h3>
              </div>
              <div className={`text-right px-6 py-3 rounded-xl ${getBgPnLColor(filteredPnL)}`}>
                <p className="text-xs text-gray-900 font-medium">Filtered P&L</p>
                <p className={`text-2xl font-bold ${getPnLColor(filteredPnL)}`}>
                  {formatCurrency(filteredPnL)}
                </p>
                <p className="text-xs text-gray-700">{filteredTrades.length} trades</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setTradeFilter('all')}
                className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                  tradeFilter === 'all'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Trades
                <span className="ml-2 text-sm">({selectedUser.all_positions.length})</span>
              </button>
              
              <button
                onClick={() => setTradeFilter('profitable')}
                className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                  tradeFilter === 'profitable'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Profitable
                <span className="ml-2 text-sm">({selectedUser.all_positions.filter(p => p.pnl_amount > 0).length})</span>
              </button>
              
              <button
                onClick={() => setTradeFilter('loss')}
                className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                  tradeFilter === 'loss'
                    ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Loss Making
                <span className="ml-2 text-sm">({selectedUser.all_positions.filter(p => p.pnl_amount < 0).length})</span>
              </button>
            </div>
          </div>

          {/* All Trades Table */}
          <div className="bg-white/90 rounded-2xl shadow-xl border border-emerald-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-800">
                  {tradeFilter === 'all' ? 'All Trades' : tradeFilter === 'profitable' ? 'Profitable Trades' : 'Loss Making Trades'}
                </h3>
                <span className="text-sm text-gray-900 font-medium">
                  {filteredTrades.length} {filteredTrades.length === 1 ? 'trade' : 'trades'}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Entry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Entry Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Exit Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Exit Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Qty</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Margin Used</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Leverage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Exit Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">P&L</th>
                </tr>
              </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                        No trades found for this filter
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.map((pos, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{pos.symbol}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            pos.status === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {pos.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(pos.entry_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(pos.entry_price)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pos.exit_date ? new Date(pos.exit_date).toLocaleDateString('en-IN') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pos.status === 'EXITED' ? formatCurrency(pos.exit_price) : formatCurrency(pos.current_price)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{pos.quantity}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pos.margin_required ? formatCurrency(pos.margin_required) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pos.leverage ? `${pos.leverage}x` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-900">
                          {pos.exit_reason || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${getPnLColor(pos.pnl_amount)}`}>
                            {formatCurrency(pos.pnl_amount)}
                          </div>
                          <div className={`text-xs ${getPnLColor(pos.pnl_amount)}`}>
                            {pos.margin_pnl_percentage !== undefined 
                              ? formatPercentage(pos.margin_pnl_percentage) 
                              : formatPercentage(pos.pnl_percentage)}
                          </div>
                          {pos.margin_pnl_percentage !== undefined && (
                            <div className="text-xs text-gray-500">
                              (on margin)
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-xl border-b border-emerald-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                👥 User-wise P&L Dashboard
              </h1>
              <p className="text-sm text-slate-600">Comprehensive performance tracking for all users</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex items-center px-4 py-2 border border-emerald-300 rounded-xl shadow-sm text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all duration-300"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Live Dashboard
              </button>
              <button
                onClick={fetchUsersPnL}
                className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 transition-all duration-300 transform hover:scale-105"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overall Statistics */}
        {overallStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/90 rounded-2xl shadow-xl border border-emerald-200 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Total P&L (All Users)</p>
                  <p className={`text-2xl font-bold ${getPnLColor(overallStats.total_pnl)}`}>
                    {formatCurrency(overallStats.total_pnl)}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    Realized: {formatCurrency(overallStats.total_realized_pnl)}
                  </p>
                </div>
                <DollarSign className={`w-8 h-8 ${getPnLColor(overallStats.total_pnl)}`} />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-teal-200 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Total Users</p>
                  <p className="text-2xl font-bold text-teal-600">{overallStats.total_users}</p>
                  <p className="text-xs text-gray-700 mt-1">
                    {overallStats.active_users} Active / {overallStats.trading_enabled_users} Trading
                  </p>
                </div>
                <Users className="w-8 h-8 text-teal-600" />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-cyan-200 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Margin Deployed</p>
                  <p className="text-2xl font-bold text-cyan-600">
                    {formatCurrency(overallStats.total_capital_deployed)}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    {overallStats.total_positions} Total Positions
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-cyan-600" />
              </div>
            </div>

            <div className="bg-white/90 rounded-2xl shadow-xl border border-purple-200 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Best Performer</p>
                  <p className="text-lg font-bold text-purple-600">
                    {overallStats.best_performing_user?.user_name}
                  </p>
                  <p className="text-xs text-green-600 font-semibold mt-1">
                    {formatCurrency(overallStats.best_performing_user?.total_pnl || 0)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white/90 rounded-2xl shadow-xl border border-emerald-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
            <h2 className="text-xl font-semibold text-gray-800">User Performance</h2>
            <p className="text-sm text-gray-900">{users.length} users</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Total P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Realized P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Unrealized P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Positions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Win Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{user.user_name}</div>
                      <div className="text-sm text-gray-700">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-bold ${getPnLColor(user.total_pnl)}`}>
                        {formatCurrency(user.total_pnl)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${getPnLColor(user.realized_pnl)}`}>
                        {formatCurrency(user.realized_pnl)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${getPnLColor(user.unrealized_pnl)}`}>
                        {formatCurrency(user.unrealized_pnl)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.active_positions} / {user.total_positions}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-teal-600">
                        {user.win_rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-700">
                        {user.winning_trades}W / {user.losing_trades}L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="text-emerald-600 hover:text-emerald-900 font-medium"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

