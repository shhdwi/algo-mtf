'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, DollarSign, BarChart3, Filter, Download, RefreshCw, Activity } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  trade_type: 'PAPER' | 'REAL';
  user_name: string;
  entry_date: string;
  entry_time: string;
  entry_price: number;
  exit_date?: string;
  exit_time?: string;
  exit_price?: number;
  current_price: number;
  quantity: number;
  total_investment: number;
  total_exit_value: number;
  absolute_pnl: number;
  percentage_pnl: number;
  status: 'ACTIVE' | 'EXITED' | 'STOPPED';
  exit_reason?: string;
  trailing_level?: number;
  created_at: string;
  // Calculated fields for ₹1,00,000 capital
  capital_based_quantity?: number;
  capital_based_investment?: number;
  capital_based_pnl?: number;
}

interface TradeSummary {
  total_trades: number;
  paper_trades: number;
  real_trades: number;
  active_trades: number;
  exited_trades: number;
  total_pnl: number;
  paper_pnl: number;
  real_pnl: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_pnl_per_trade: number;
  avg_percentage_pnl: number;
  total_investment: number;
  // Capital-based calculations (₹1,00,000 per trade)
  capital_based_total_pnl: number;
  capital_based_avg_pnl: number;
  capital_based_total_investment: number;
  best_trade?: Trade;
  worst_trade?: Trade;
  symbol_performance: Array<{
    symbol: string;
    total_trades: number;
    total_pnl: number;
    capital_based_pnl: number;
    winning_trades: number;
    losing_trades: number;
  }>;
  monthly_performance: Array<{
    month: string;
    total_trades: number;
    total_pnl: number;
    capital_based_pnl: number;
    winning_trades: number;
    losing_trades: number;
  }>;
}

export default function TradesDashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<TradeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'EXITED' | 'ACTIVE' | 'ALL'>('EXITED');
  const [filters, setFilters] = useState({
    symbol: '',
    trade_type: '',
    date_from: '',
    date_to: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Capital allocation per trade
  const CAPITAL_PER_TRADE = 100000; // ₹1,00,000

  const calculateCapitalBasedMetrics = (trade: Trade): Trade => {
    // Calculate quantity that could be bought with ₹1,00,000
    const capitalBasedQuantity = Math.floor(CAPITAL_PER_TRADE / trade.entry_price);
    const capitalBasedInvestment = capitalBasedQuantity * trade.entry_price;
    
    // Calculate PnL based on capital allocation
    const exitPrice = trade.exit_price || trade.current_price;
    const capitalBasedPnl = (exitPrice - trade.entry_price) * capitalBasedQuantity;
    
    return {
      ...trade,
      capital_based_quantity: capitalBasedQuantity,
      capital_based_investment: capitalBasedInvestment,
      capital_based_pnl: capitalBasedPnl
    };
  };

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.symbol) params.append('symbol', filters.symbol);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      
      const response = await fetch(`/api/trades/history?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        let filteredTrades = result.data.trades;
        
        // Apply capital-based calculations to all trades
        filteredTrades = filteredTrades.map((trade: Trade) => calculateCapitalBasedMetrics(trade));
        
        // Apply frontend filters
        if (filters.trade_type) {
          filteredTrades = filteredTrades.filter((t: Trade) => t.trade_type === filters.trade_type);
        }
        
        // Apply tab filter
        if (activeTab === 'EXITED') {
          filteredTrades = filteredTrades.filter((t: Trade) => t.status === 'EXITED');
        } else if (activeTab === 'ACTIVE') {
          filteredTrades = filteredTrades.filter((t: Trade) => t.status === 'ACTIVE');
        }
        // 'ALL' shows all trades (no additional filter)
        
        setTrades(filteredTrades);
        
        // Calculate filtered summary based on displayed trades
        const filteredSummary = calculateFilteredSummary(filteredTrades);
        setSummary(filteredSummary);
      } else {
        console.error('Failed to fetch trades:', result.error);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters.symbol, filters.trade_type, filters.date_from, filters.date_to]);

  const calculateFilteredSummary = (filteredTrades: Trade[]): TradeSummary => {
    const totalTrades = filteredTrades.length;
    const paperTrades = filteredTrades.filter(t => t.trade_type === 'PAPER').length;
    const realTrades = filteredTrades.filter(t => t.trade_type === 'REAL').length;
    const activeTrades = filteredTrades.filter(t => t.status === 'ACTIVE').length;
    const exitedTrades = filteredTrades.filter(t => t.status === 'EXITED').length;
    
    const totalPnl = filteredTrades.reduce((sum, t) => sum + (t.absolute_pnl || 0), 0);
    const paperPnl = filteredTrades.filter(t => t.trade_type === 'PAPER').reduce((sum, t) => sum + (t.absolute_pnl || 0), 0);
    const realPnl = filteredTrades.filter(t => t.trade_type === 'REAL').reduce((sum, t) => sum + (t.absolute_pnl || 0), 0);
    
    // Capital-based calculations
    const capitalBasedTotalPnl = filteredTrades.reduce((sum, t) => sum + (t.capital_based_pnl || 0), 0);
    const capitalBasedTotalInvestment = filteredTrades.reduce((sum, t) => sum + (t.capital_based_investment || 0), 0);
    const capitalBasedAvgPnl = totalTrades > 0 ? capitalBasedTotalPnl / totalTrades : 0;
    
    const winningTrades = filteredTrades.filter(t => (t.capital_based_pnl || 0) > 0).length;
    const losingTrades = filteredTrades.filter(t => (t.capital_based_pnl || 0) < 0).length;
    const _breakEvenTrades = filteredTrades.filter(t => (t.capital_based_pnl || 0) === 0).length;
    
    const totalInvestment = filteredTrades.reduce((sum, t) => sum + (t.total_investment || 0), 0);
    const _totalExitValue = filteredTrades.reduce((sum, t) => sum + (t.total_exit_value || 0), 0);
    
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
    const avgPnlPerTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const avgPercentagePnl = totalTrades > 0 ? filteredTrades.reduce((sum, t) => sum + (t.percentage_pnl || 0), 0) / totalTrades : 0;
    
    const bestTrade = filteredTrades.reduce((best, current) => 
      (current.capital_based_pnl || 0) > (best?.capital_based_pnl || 0) ? current : best, filteredTrades[0]);
    const worstTrade = filteredTrades.reduce((worst, current) => 
      (current.capital_based_pnl || 0) < (worst?.capital_based_pnl || 0) ? current : worst, filteredTrades[0]);
    
    // Symbol performance for filtered trades
    const symbolPerformance = filteredTrades.reduce((acc: any, trade) => {
      if (!acc[trade.symbol]) {
        acc[trade.symbol] = {
          symbol: trade.symbol,
          total_trades: 0,
          total_pnl: 0,
          capital_based_pnl: 0,
          winning_trades: 0,
          losing_trades: 0
        };
      }
      acc[trade.symbol].total_trades++;
      acc[trade.symbol].total_pnl += trade.absolute_pnl || 0;
      acc[trade.symbol].capital_based_pnl += trade.capital_based_pnl || 0;
      if ((trade.capital_based_pnl || 0) > 0) acc[trade.symbol].winning_trades++;
      if ((trade.capital_based_pnl || 0) < 0) acc[trade.symbol].losing_trades++;
      return acc;
    }, {});
    
    // Monthly performance for filtered trades
    const monthlyPerformance = filteredTrades.reduce((acc: any, trade) => {
      const month = new Date(trade.created_at).toISOString().slice(0, 7);
      if (!acc[month]) {
        acc[month] = {
          month,
          total_trades: 0,
          total_pnl: 0,
          capital_based_pnl: 0,
          winning_trades: 0,
          losing_trades: 0
        };
      }
      acc[month].total_trades++;
      acc[month].total_pnl += trade.absolute_pnl || 0;
      acc[month].capital_based_pnl += trade.capital_based_pnl || 0;
      if ((trade.capital_based_pnl || 0) > 0) acc[month].winning_trades++;
      if ((trade.capital_based_pnl || 0) < 0) acc[month].losing_trades++;
      return acc;
    }, {});

    return {
      total_trades: totalTrades,
      paper_trades: paperTrades,
      real_trades: realTrades,
      active_trades: activeTrades,
      exited_trades: exitedTrades,
      total_pnl: totalPnl,
      paper_pnl: paperPnl,
      real_pnl: realPnl,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      avg_pnl_per_trade: avgPnlPerTrade,
      avg_percentage_pnl: avgPercentagePnl,
      total_investment: totalInvestment,
      // Capital-based calculations
      capital_based_total_pnl: capitalBasedTotalPnl,
      capital_based_avg_pnl: capitalBasedAvgPnl,
      capital_based_total_investment: capitalBasedTotalInvestment,
      best_trade: bestTrade,
      worst_trade: worstTrade,
      symbol_performance: Object.values(symbolPerformance),
      monthly_performance: Object.values(monthlyPerformance)
    };
  };

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-blue-600 bg-blue-100';
      case 'EXITED': return 'text-green-600 bg-green-100';
      case 'STOPPED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPnLColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const exportToCSV = () => {
    const headers = [
      'Symbol', 'Type', 'User', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 
      'Quantity', 'Investment', 'Exit Value', 'PnL Amount', 'PnL %', 'Status', 'Exit Reason'
    ];
    
    const csvData = trades.map(trade => [
      trade.symbol,
      trade.trade_type,
      trade.user_name,
      trade.entry_date,
      trade.entry_price,
      trade.exit_date || '',
      trade.exit_price || '',
      trade.quantity,
      trade.total_investment,
      trade.total_exit_value,
      trade.absolute_pnl,
      trade.percentage_pnl,
      trade.status,
      trade.exit_reason || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading trades...</p>
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">📊 Trading History</h1>
              <p className="text-sm text-slate-600">
                Comprehensive trade analysis and performance metrics
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex items-center px-4 py-2 border border-emerald-300 rounded-xl shadow-sm text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-300"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Live Dashboard
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-4 py-2 border border-teal-300 rounded-xl shadow-sm text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all duration-300"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </button>
              <button
                onClick={exportToCSV}
                className="inline-flex items-center px-4 py-2 border border-cyan-300 rounded-xl shadow-sm text-sm font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-all duration-300"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={fetchTrades}
                className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-200 mb-6">
          <div className="p-6">
            <div className="flex space-x-1 bg-gradient-to-r from-emerald-100 via-teal-100 to-cyan-100 p-1 rounded-xl">
              {[
                { key: 'EXITED', label: 'Exited Trades', icon: '✅' },
                { key: 'ACTIVE', label: 'Active Trades', icon: '🔄' },
                { key: 'ALL', label: 'All Trades', icon: '📊' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as 'EXITED' | 'ACTIVE' | 'ALL')}
                  className={`flex-1 flex items-center justify-center px-6 py-3 text-sm font-medium rounded-lg transition-all duration-300 ${
                    activeTab === tab.key
                      ? 'bg-white text-emerald-700 shadow-lg transform scale-105'
                      : 'text-slate-600 hover:text-emerald-600 hover:bg-white/50'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="border-t border-emerald-200 pt-6">
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 rounded-xl p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <input
                    type="text"
                    placeholder="Symbol (e.g., RELIANCE)"
                    value={filters.symbol}
                    onChange={(e) => setFilters({...filters, symbol: e.target.value})}
                    className="px-4 py-3 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                  />
                  <select
                    value={filters.trade_type}
                    onChange={(e) => setFilters({...filters, trade_type: e.target.value})}
                    className="px-4 py-3 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                  >
                    <option value="">All Types</option>
                    <option value="PAPER">Paper Trading</option>
                    <option value="REAL">Real Trading</option>
                  </select>
                  <input
                    type="date"
                    placeholder="From Date"
                    value={filters.date_from}
                    onChange={(e) => setFilters({...filters, date_from: e.target.value})}
                    className="px-4 py-3 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                  />
                  <input
                    type="date"
                    placeholder="To Date"
                    value={filters.date_to}
                    onChange={(e) => setFilters({...filters, date_to: e.target.value})}
                    className="px-4 py-3 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                  />
                </div>
                <button
                  onClick={fetchTrades}
                  className="mt-4 inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white rounded-xl hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-200 p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total PnL (₹1L Capital)</p>
                  <p className={`text-2xl font-bold ${getPnLColor(summary.capital_based_total_pnl)}`}>
                    {formatCurrency(summary.capital_based_total_pnl)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {activeTab === 'EXITED' ? 'Realized' : activeTab === 'ACTIVE' ? 'Unrealized' : 'Combined'}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${summary.capital_based_total_pnl >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <DollarSign className={`w-6 h-6 ${summary.capital_based_total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-teal-200 p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Win Rate</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                    {summary.win_rate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{summary.winning_trades}W / {summary.losing_trades}L</p>
                </div>
                <div className="p-3 rounded-xl bg-teal-100">
                  <TrendingUp className="w-6 h-6 text-teal-600" />
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-cyan-200 p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Trades</p>
                  <p className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
                    {summary.total_trades}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{summary.paper_trades} Paper / {summary.real_trades} Real</p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-100">
                  <BarChart3 className="w-6 h-6 text-cyan-600" />
                </div>
              </div>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-purple-200 p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg PnL/Trade (₹1L)</p>
                  <p className={`text-2xl font-bold ${getPnLColor(summary.capital_based_avg_pnl)}`}>
                    {formatCurrency(summary.capital_based_avg_pnl)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{formatPercentage(summary.avg_percentage_pnl)}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-100">
                  <Activity className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trades Table */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
            <h2 className="text-xl font-semibold bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 bg-clip-text text-transparent">
              {activeTab === 'EXITED' ? '✅ Exited Trades' : activeTab === 'ACTIVE' ? '🔄 Active Trades' : '📊 All Trades'}
            </h2>
            <p className="text-sm text-slate-600">{trades.length} trades found</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty (₹1L)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Investment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PnL (₹1L Capital)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exit Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{trade.symbol}</div>
                      <div className="text-sm text-gray-500">{trade.user_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        trade.trade_type === 'REAL' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {trade.trade_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{formatCurrency(trade.entry_price)}</div>
                      <div className="text-xs text-gray-500">{trade.entry_date}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{trade.exit_price ? formatCurrency(trade.exit_price) : formatCurrency(trade.current_price)}</div>
                      <div className="text-xs text-gray-500">{trade.exit_date || 'Active'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{trade.capital_based_quantity}</div>
                      <div className="text-xs text-gray-500">Paper: {trade.quantity}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{formatCurrency(trade.capital_based_investment || 0)}</div>
                      <div className="text-xs text-gray-500">Paper: {formatCurrency(trade.total_investment)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${getPnLColor(trade.capital_based_pnl || 0)}`}>
                        {formatCurrency(trade.capital_based_pnl || 0)}
                      </div>
                      <div className={`text-xs ${getPnLColor(trade.percentage_pnl)}`}>
                        {formatPercentage(trade.percentage_pnl)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(trade.status)}`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {trade.exit_reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {trades.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No trades found</p>
            </div>
          )}
        </div>

        {/* Performance Charts Section */}
        {summary && summary.symbol_performance.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Symbol Performance */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Symbol Performance</h3>
              <div className="space-y-3">
                {summary.symbol_performance.slice(0, 10).map((symbol) => (
                  <div key={symbol.symbol} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 w-20">{symbol.symbol}</span>
                      <span className="text-sm text-gray-500">({symbol.total_trades} trades)</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${getPnLColor(symbol.capital_based_pnl)}`}>
                        {formatCurrency(symbol.capital_based_pnl)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {symbol.winning_trades}W / {symbol.losing_trades}L
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Performance */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Monthly Performance</h3>
              <div className="space-y-3">
                {summary.monthly_performance.slice(-6).map((month) => (
                  <div key={month.month} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 w-20">{month.month}</span>
                      <span className="text-sm text-gray-500">({month.total_trades} trades)</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${getPnLColor(month.capital_based_pnl)}`}>
                        {formatCurrency(month.capital_based_pnl)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {month.winning_trades}W / {month.losing_trades}L
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
