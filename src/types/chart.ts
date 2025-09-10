export type ExchangeCode = 'NSE' | 'BSE' | 'NFO' | 'BFO' | '1' | '2' | '3' | '4';
export type TimeInterval = '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '30m' | '60m';
export type HistoricalTimeInterval = '1W' | '1M' | '3M' | '1Y' | '3Y' | '5Y';

export interface ChartDataPoint {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface HistoricalChartDataPoint {
  timestamp: string;
  epochTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface ChartDataRequest {
  token?: string;
  symbol?: string;
  exchange: string;
  interval: TimeInterval | HistoricalTimeInterval;
  start_time: string;
  end_time: string;
}

export interface ChartDataResponse {
  status: string;
  message: string;
  data: {
    symbol: string;
    exchange: string;
    interval: string;
    start: string;
    end: string;
    points: ChartDataPoint[];
  };
}

export interface HistoricalChartDataResponse {
  status: string;
  message: string;
  data: {
    symbol: string;
    exchange: string;
    interval: string;
    start: string;
    end: string;
    points: HistoricalChartDataPoint[];
  };
}

export interface ChartApiError {
  status: string;
  message: string;
  error?: string;
}

export interface OHLCData {
  symbol: string;
  exchange: string;
  interval: string;
  timeframe: {
    start: string;
    end: string;
  };
  data: Array<{
    timestamp: string;
    datetime: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export interface HistoricalOHLCData {
  symbol: string;
  exchange: string;
  interval: string;
  timeframe: {
    start: string;
    end: string;
  };
  data: Array<{
    timestamp: string;
    epochTime: number;
    datetime: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export interface ChartServiceConfig {
  apiUrl: string;
  apiKey: string;
  authKey: string;
  clientId: string;
}

export interface GetChartDataOptions {
  symbol?: string;
  token?: string;
  exchange?: ExchangeCode;
  interval?: TimeInterval;
  startTime?: string;
  endTime?: string;
  duration?: string; // e.g., '1h', '1d', '1w' for relative time
}
