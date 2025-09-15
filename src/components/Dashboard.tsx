'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw } from 'lucide-react';

interface Position {
  symbol: string;
  status: string;
  current_price: number;
  pnl_percentage: number;
  pnl_amount: number;
  trailing_level: number;
  next_target: number;
  entry_price?: number;
}

interface PnLSummary {
  totalPositions: number;
  profitablePositions: number;
  totalPnL: number;
  totalPnLPercentage: number;
  bestPerformer: { symbol: string; pnl: number } | null;
  worstPerformer: { symbol: string; pnl: number } | null;
}

export default function Dashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PnLSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/monitor-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_whatsapp: true })
      });
      
      if (response.ok) {
        const data = await response.json();
        const positionData = data.position_status || [];
        setPositions(positionData);
        
        // Calculate summary with 1 lakh investment per position
        const investmentPerPosition = 100000; // 1 lakh
        
        // Calculate entry prices for each position
        const enrichedPositions = positionData.map((pos: Position) => ({
          ...pos,
          entry_price: pos.current_price / (1 + pos.pnl_percentage / 100)
        }));
        
        const totalPnL = enrichedPositions.reduce((sum: number, pos: Position) => {
          const pnlAmount = (pos.pnl_percentage / 100) * investmentPerPosition;
          return sum + pnlAmount;
        }, 0);
        const profitableCount = enrichedPositions.filter((pos: Position) => pos.pnl_percentage > 0).length;
        const bestPerformer = enrichedPositions.reduce((best: Position | null, pos: Position) => 
          !best || pos.pnl_percentage > best.pnl_percentage ? pos : best, null);
        const worstPerformer = enrichedPositions.reduce((worst: Position | null, pos: Position) => 
          !worst || pos.pnl_percentage < worst.pnl_percentage ? pos : worst, null);
        
        setPositions(enrichedPositions);
        setSummary({
          totalPositions: enrichedPositions.length,
          profitablePositions: profitableCount,
          totalPnL,
          totalPnLPercentage: enrichedPositions.length > 0 ? totalPnL / (enrichedPositions.length * investmentPerPosition) * 100 : 0,
          bestPerformer: bestPerformer ? { symbol: bestPerformer.symbol, pnl: bestPerformer.pnl_percentage } : null,
          worstPerformer: worstPerformer ? { symbol: worstPerformer.symbol, pnl: worstPerformer.pnl_percentage } : null
        });
        
        setLastUpdated(new Date());
      } else {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm shadow-xl border-b border-emerald-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">Trading Dashboard</h1>
              <p className="text-sm text-slate-600">
                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
              </p>
            </div>
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl shadow-lg text-sm font-medium text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 rounded-2xl p-6 shadow-lg">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-rose-800">
                  Error loading data
                </h3>
                <div className="mt-2 text-sm text-rose-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={fetchPositions}
                    className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all duration-300 transform hover:scale-105 shadow-md"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PnL Summary Cards */}
        {loading && !error ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-6">
                <div className="animate-pulse">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 bg-gradient-to-r from-emerald-200 to-teal-200 rounded-xl"></div>
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="h-4 bg-emerald-200 rounded-lg w-20 mb-2"></div>
                      <div className="h-6 bg-emerald-200 rounded-lg w-16 mb-1"></div>
                      <div className="h-3 bg-emerald-200 rounded-lg w-12"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : summary && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 rounded-xl shadow-lg">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600">Total Positions</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.totalPositions}</p>
                  <p className="text-xs text-emerald-600 font-semibold">
                    {summary.profitablePositions} profitable
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`p-3 rounded-xl shadow-lg ${summary.totalPnL >= 0 ? 'bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400' : 'bg-gradient-to-r from-rose-400 via-pink-400 to-red-400'}`}>
                    <DollarSign className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600">Total P&L</p>
                  <p className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(summary.totalPnL)}
                  </p>
                  <p className={`text-xs font-semibold ${summary.totalPnLPercentage >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatPercentage(summary.totalPnLPercentage)} avg
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 rounded-xl shadow-lg">
                    <TrendingUp className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600">Best Performer</p>
                  <p className="text-lg font-bold text-slate-900">
                    {summary.bestPerformer?.symbol || 'N/A'}
                  </p>
                  <p className="text-xs text-emerald-600 font-semibold">
                    {summary.bestPerformer ? formatPercentage(summary.bestPerformer.pnl) : '--'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="p-3 bg-gradient-to-r from-rose-400 via-pink-400 to-red-400 rounded-xl shadow-lg">
                    <TrendingDown className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-600">Worst Performer</p>
                  <p className="text-lg font-bold text-slate-900">
                    {summary.worstPerformer?.symbol || 'N/A'}
                  </p>
                  <p className="text-xs text-rose-600 font-semibold">
                    {summary.worstPerformer ? formatPercentage(summary.worstPerformer.pnl) : '--'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Positions Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
            <h3 className="text-xl font-bold text-slate-900">Active Positions</h3>
            <p className="text-sm text-slate-600 mt-1">P&L calculated on ₹1,00,000 investment per position</p>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="ml-2 text-slate-600">Loading positions...</span>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No active positions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-emerald-100">
                <thead className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Entry Price
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Current Price
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      P&L Amount (₹1L)
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      P&L %
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Trailing Level
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white/50 divide-y divide-emerald-50">
                  {positions.map((position, index) => {
                    const pnlAmount = (position.pnl_percentage / 100) * 100000; // Calculate P&L for 1 lakh
                    return (
                      <tr key={position.symbol} className={`hover:bg-gradient-to-r hover:from-emerald-25 hover:to-teal-25 transition-all duration-200 ${index % 2 === 0 ? 'bg-white/30' : 'bg-emerald-25/30'}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold text-slate-900">
                            {position.symbol}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-700 font-medium">
                            {position.entry_price ? formatCurrency(position.entry_price) : 'N/A'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900 font-semibold">
                            {formatCurrency(position.current_price)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-bold ${
                            pnlAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {formatCurrency(pnlAmount)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm ${
                            position.pnl_percentage >= 0 
                              ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-200' 
                              : 'bg-gradient-to-r from-rose-100 to-red-100 text-rose-800 border border-rose-200'
                          }`}>
                            {formatPercentage(position.pnl_percentage)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900">
                            {position.trailing_level > 0 ? (
                              <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-100 to-teal-100 text-cyan-800 border border-cyan-200 shadow-sm">
                                Level {position.trailing_level}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-slate-100 to-gray-100 text-slate-800 border border-slate-200 shadow-sm">
                            {position.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
