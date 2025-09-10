import { ExchangeCode, TimeInterval } from '@/types/chart';

/**
 * Formats a date to ISO string format required by the API
 */
export function formatDateToISO(date: Date): string {
  return date.toISOString().slice(0, 19); // Remove milliseconds and Z
}

/**
 * Gets start and end times based on duration
 */
export function getTimeRange(duration: string, endTime?: Date): { start: string; end: string } {
  const end = endTime || new Date();
  const start = new Date(end);

  switch (duration.toLowerCase()) {
    case '1h':
      start.setHours(start.getHours() - 1);
      break;
    case '2h':
      start.setHours(start.getHours() - 2);
      break;
    case '4h':
      start.setHours(start.getHours() - 4);
      break;
    case '1d':
      start.setDate(start.getDate() - 1);
      break;
    case '3d':
      start.setDate(start.getDate() - 3);
      break;
    case '1w':
      start.setDate(start.getDate() - 7);
      break;
    case '1m':
      start.setMonth(start.getMonth() - 1);
      break;
    default:
      // Default to 1 hour if duration not recognized
      start.setHours(start.getHours() - 1);
  }

  return {
    start: formatDateToISO(start),
    end: formatDateToISO(end)
  };
}

/**
 * Validates exchange code and converts to API format
 */
export function normalizeExchange(exchange: ExchangeCode): string {
  const exchangeMap: Record<string, string> = {
    'NSE': 'NSE',
    '1': 'NSE',
    'BSE': 'BSE', 
    '3': 'BSE',
    'NFO': 'NFO',
    '2': 'NFO',
    'BFO': 'BFO',
    '4': 'BFO'
  };
  
  return exchangeMap[exchange] || 'NSE';
}

/**
 * Validates time interval
 */
export function validateInterval(interval: TimeInterval): boolean {
  const validIntervals = ['5s', '15s', '30s', '1m', '5m', '15m', '30m', '60m'];
  return validIntervals.includes(interval);
}

/**
 * Validates historical time interval
 */
export function validateHistoricalInterval(interval: string): boolean {
  const validIntervals = ['1W', '1M', '3M', '1Y', '3Y', '5Y'];
  return validIntervals.includes(interval);
}

/**
 * Converts string OHLC values to numbers
 */
export function parseOHLCData(data: any[]): Array<{
  timestamp: string;
  datetime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  return data.map(point => ({
    timestamp: point.timestamp,
    datetime: new Date(point.timestamp),
    open: parseFloat(point.open),
    high: parseFloat(point.high),
    low: parseFloat(point.low),
    close: parseFloat(point.close),
    volume: parseInt(point.volume, 10)
  }));
}

/**
 * Converts string historical OHLC values to numbers (includes epochTime)
 */
export function parseHistoricalOHLCData(data: any[]): Array<{
  timestamp: string;
  epochTime: number;
  datetime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  return data.map(point => ({
    timestamp: point.timestamp,
    epochTime: point.epochTime || 0,
    datetime: new Date(point.timestamp),
    open: parseFloat(point.open),
    high: parseFloat(point.high),
    low: parseFloat(point.low),
    close: parseFloat(point.close),
    volume: parseInt(point.volume, 10)
  }));
}

/**
 * Calculates basic technical indicators
 */
export function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  
  return sma;
}

/**
 * Gets market hours for different exchanges
 */
export function getMarketHours(exchange: ExchangeCode): { open: string; close: string } {
  switch (normalizeExchange(exchange)) {
    case 'NSE':
    case 'NFO':
      return { open: '09:15', close: '15:30' };
    case 'BSE':
    case 'BFO':
      return { open: '09:15', close: '15:30' };
    default:
      return { open: '09:15', close: '15:30' };
  }
}

/**
 * Checks if current time is within market hours
 */
export function isMarketOpen(exchange: ExchangeCode = 'NSE'): boolean {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Market is closed on weekends
  if (currentDay === 0 || currentDay === 6) {
    return false;
  }
  
  const { open, close } = getMarketHours(exchange);
  return currentTime >= open && currentTime <= close;
}

/**
 * Formats number to Indian currency format
 */
export function formatIndianCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Formats volume in Indian format (Lakhs/Crores)
 */
export function formatVolume(volume: number): string {
  if (volume >= 10000000) {
    return `${(volume / 10000000).toFixed(2)}Cr`;
  } else if (volume >= 100000) {
    return `${(volume / 100000).toFixed(2)}L`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(2)}K`;
  }
  return volume.toString();
}
