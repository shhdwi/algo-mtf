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
        body: JSON.stringify({ send_whatsapp: false })
      });
      
      if (response.ok) {
        const data = await response.json();
        const positionData = data.position_status || [];
        setPositions(positionData);
        
        // Calculate summary
        const totalPnL = positionData.reduce((sum: number, pos: Position) => sum + (pos.pnl_amount || 0), 0);
        const profitableCount = positionData.filter((pos: Position) => pos.pnl_percentage > 0).length;
        const bestPerformer = positionData.reduce((best: Position | null, pos: Position) => 
          !best || pos.pnl_percentage > best.pnl_percentage ? pos : best, null);
        const worstPerformer = positionData.reduce((worst: Position | null, pos: Position) => 
          !worst || pos.pnl_percentage < worst.pnl_percentage ? pos : worst, null);
        
        setSummary({
          totalPositions: positionData.length,
          profitablePositions: profitableCount,
          totalPnL,
          totalPnLPercentage: positionData.length > 0 ? totalPnL / positionData.length : 0,
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
    const interval = setInterval(fetchPositions, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trading Dashboard</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
              </p>
            </div>
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error loading data
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    onClick={fetchPositions}
                    className="bg-red-100 dark:bg-red-800 px-3 py-2 rounded-md text-sm font-medium text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-700"
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
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="animate-pulse">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded"></div>
                    </div>
                    <div className="ml-4 flex-1">
                      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-20 mb-2"></div>
                      <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-16 mb-1"></div>
                      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-12"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : summary && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Activity className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Positions</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalPositions}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {summary.profitablePositions} profitable
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className={`h-8 w-8 ${summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total P&L</p>
                  <p className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary.totalPnL)}
                  </p>
                  <p className={`text-xs ${summary.totalPnLPercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatPercentage(summary.totalPnLPercentage)} avg
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Best Performer</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {summary.bestPerformer?.symbol || 'N/A'}
                  </p>
                  <p className="text-xs text-green-500">
                    {summary.bestPerformer ? formatPercentage(summary.bestPerformer.pnl) : '--'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingDown className="h-8 w-8 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Worst Performer</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {summary.worstPerformer?.symbol || 'N/A'}
                  </p>
                  <p className="text-xs text-red-500">
                    {summary.worstPerformer ? formatPercentage(summary.worstPerformer.pnl) : '--'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Positions Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Active Positions</h3>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">Loading positions...</span>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No active positions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Current Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      P&L Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      P&L %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Trailing Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {positions.map((position) => (
                    <tr key={position.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {position.symbol}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatCurrency(position.current_price)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          position.pnl_amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(position.pnl_amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          position.pnl_percentage >= 0 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {formatPercentage(position.pnl_percentage)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {position.trailing_level > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Level {position.trailing_level}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                          {position.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
