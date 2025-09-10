import { DailyOHLCData } from '@/services/dailyOHLCService';

/**
 * Calculate moving averages for daily data
 */
export function calculateMovingAverages(prices: number[], periods: number[] = [5, 10, 20, 50, 200]): Record<string, number[]> {
  const results: Record<string, number[]> = {};
  
  for (const period of periods) {
    const ma: number[] = [];
    
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        ma.push(NaN);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        ma.push(sum / period);
      }
    }
    
    results[`MA${period}`] = ma;
  }
  
  return results;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate daily price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      rsi.push(NaN);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  }
  
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  
  const macd = emaFast.map((fast, i) => fast - emaSlow[i]);
  const signal = calculateEMA(macd.filter(val => !isNaN(val)), signalPeriod);
  
  // Pad signal array to match macd length
  const paddedSignal = new Array(macd.length - signal.length).fill(NaN).concat(signal);
  
  const histogram = macd.map((macdVal, i) => macdVal - (paddedSignal[i] || 0));
  
  return { macd, signal: paddedSignal, histogram };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA value is SMA
  const firstSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema[period - 1] = firstSMA;
  
  // Calculate EMA for remaining values
  for (let i = period; i < prices.length; i++) {
    ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
  }
  
  // Fill initial values with NaN
  for (let i = 0; i < period - 1; i++) {
    ema[i] = NaN;
  }
  
  return ema;
}

/**
 * Calculate Bollinger Bands
 */
export function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): {
  middle: number[];
  upper: number[];
  lower: number[];
} {
  const middle = calculateMovingAverages(prices, [period])[`MA${period}`];
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      
      upper.push(mean + (stdDev * multiplier));
      lower.push(mean - (stdDev * multiplier));
    }
  }
  
  return { middle, upper, lower };
}

/**
 * Identify support and resistance levels
 */
export function findSupportResistance(data: DailyOHLCData, lookbackPeriod: number = 20): {
  support: number[];
  resistance: number[];
  currentSupport: number;
  currentResistance: number;
} {
  const highs = data.dailyData.map(d => d.high);
  const lows = data.dailyData.map(d => d.low);
  
  const support: number[] = [];
  const resistance: number[] = [];
  
  // Find local minima (support) and maxima (resistance)
  for (let i = lookbackPeriod; i < data.dailyData.length - lookbackPeriod; i++) {
    const currentLow = lows[i];
    const currentHigh = highs[i];
    
    // Check if current low is a local minimum
    const isSupport = lows.slice(i - lookbackPeriod, i + lookbackPeriod + 1)
      .every(low => currentLow <= low);
    
    // Check if current high is a local maximum  
    const isResistance = highs.slice(i - lookbackPeriod, i + lookbackPeriod + 1)
      .every(high => currentHigh >= high);
    
    if (isSupport) support.push(currentLow);
    if (isResistance) resistance.push(currentHigh);
  }
  
  // Get current support and resistance (most recent)
  const currentSupport = support.length > 0 ? support[support.length - 1] : Math.min(...lows);
  const currentResistance = resistance.length > 0 ? resistance[resistance.length - 1] : Math.max(...highs);
  
  return {
    support,
    resistance,
    currentSupport,
    currentResistance
  };
}

/**
 * Calculate daily returns
 */
export function calculateDailyReturns(data: DailyOHLCData): number[] {
  const returns: number[] = [];
  
  for (let i = 1; i < data.dailyData.length; i++) {
    const prevClose = data.dailyData[i - 1].close;
    const currentClose = data.dailyData[i].close;
    const dailyReturn = (currentClose - prevClose) / prevClose;
    returns.push(dailyReturn);
  }
  
  return returns;
}

/**
 * Calculate maximum drawdown
 */
export function calculateMaxDrawdown(data: DailyOHLCData): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  drawdownPeriod: { start: string; end: string };
} {
  const prices = data.dailyData.map(d => d.close);
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let peak = prices[0];
  let peakIndex = 0;
  let troughIndex = 0;
  
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIndex = i;
    }
    
    const drawdown = peak - prices[i];
    const drawdownPercent = (drawdown / peak) * 100;
    
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
      troughIndex = i;
    }
  }
  
  return {
    maxDrawdown,
    maxDrawdownPercent,
    drawdownPeriod: {
      start: data.dailyData[peakIndex]?.date || '',
      end: data.dailyData[troughIndex]?.date || ''
    }
  };
}

/**
 * Get trading calendar info
 */
export function getTradingCalendar(data: DailyOHLCData): {
  totalDays: number;
  tradingDays: number;
  weekends: number;
  averageDailyVolume: number;
  highestVolumeDay: { date: string; volume: number };
  lowestVolumeDay: { date: string; volume: number };
} {
  const weekends = data.dailyData.filter(d => d.isWeekend).length;
  const volumes = data.dailyData.map(d => d.volume);
  
  const highestVolumeDay = data.dailyData.reduce((max, current) => 
    current.volume > max.volume ? current : max
  );
  
  const lowestVolumeDay = data.dailyData.reduce((min, current) => 
    current.volume < min.volume ? current : min
  );
  
  return {
    totalDays: data.totalDays,
    tradingDays: data.tradingDays,
    weekends,
    averageDailyVolume: data.summary.averageVolume,
    highestVolumeDay: {
      date: highestVolumeDay.date,
      volume: highestVolumeDay.volume
    },
    lowestVolumeDay: {
      date: lowestVolumeDay.date,
      volume: lowestVolumeDay.volume
    }
  };
}
