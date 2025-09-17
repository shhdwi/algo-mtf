import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Technical indicators library
import { SMA, RSI, MACD, EMA } from 'technicalindicators';

// ---------------------- Types ----------------------
interface OHLC {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateStr?: string;
}

interface PivotPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  timestamp: number;
}

interface Channel {
  upper: number;
  lower: number;
  pivots: PivotPoint[];
  strength: number;
}

interface SupportResistanceChannel {
  upper: number;
  lower: number;
  strength: number;
}

interface SupportResistanceAnalysis {
  nearest_support: SupportResistanceChannel | null;
  nearest_resistance: SupportResistanceChannel | null;
  support_broken: boolean;
  resistance_broken: boolean;
  all_valid_channels: SupportResistanceChannel[];
  support_levels: {
    S1: SupportResistanceChannel | null;
    S2: SupportResistanceChannel | null;
    S3: SupportResistanceChannel | null;
  };
  resistance_levels: {
    R1: SupportResistanceChannel | null;
    R2: SupportResistanceChannel | null;
    R3: SupportResistanceChannel | null;
  };
}

interface TechnicalIndicators {
  rsi14: number | null;
  rsi14Sma: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  sma9: number | null;
  sma20: number | null;
  ema50: number | null;
}

interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockAnalysisResponse {
  isin: string;
  exchange: string;
  date: string;
  previousDate: string | null;
  currentDayOHLC: OHLCData | null;
  previousDayOHLC: OHLCData | null;
  supportResistance: SupportResistanceAnalysis;
  technicals: TechnicalIndicators;
}

interface StockRequest {
  isin: string;
  date: string;
  exchange?: string;
}

interface BatchStockAnalysisResponse {
  success: boolean;
  total_requests: number;
  successful_analyses: number;
  failed_analyses: number;
  processing_time_ms: number;
  results: (StockAnalysisResponse | { isin: string; exchange: string; date: string; error: string })[];
}

// ---------------------- ISIN Mapping ----------------------
let isinMapping: Map<string, string> | null = null;

function loadISINMapping(): Map<string, string> {
  if (isinMapping) return isinMapping;
  try {
    const csvPath = path.join(process.cwd(), 'public', '1730540_2025_07_07.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const map = new Map<string, string>();
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const [token, exchange, symbol, isin] = line.split(',');
      if (!token || !exchange || !isin) continue;
      const tokenTrim = token.trim();
      const isinTrim = isin.trim();
      if (exchange === 'NSE') {
        map.set(`${tokenTrim}_1`, isinTrim);
      } else if (exchange === 'BSE') {
        map.set(`${tokenTrim}_3`, isinTrim);
      }
      map.set(tokenTrim, isinTrim);
      if (symbol && symbol.trim()) {
        const sym = symbol.trim().toUpperCase();
        if (!map.has(sym)) {
          map.set(sym, isinTrim);
        }
      }
    }
    
    // Manual overrides for common stocks
    const stockOverrides: Record<string, string> = {
      ADANIENT: 'INE423A01024',
      ADANIPORTS: 'INE742F01042',
      APOLLOHOSP: 'INE437A01024',
      ASIANPAINT: 'INE021A01026',
      AXISBANK: 'INE238A01034',
      'BAJAJ-AUTO': 'INE917I01010',
      BAJFINANCE: 'INE296A01024',
      BAJAJFINSV: 'INE918I01026',
      BEL: 'INE263A01024',
      BHARTIARTL: 'INE397D01024',
      CIPLA: 'INE059A01026',
      COALINDIA: 'INE522F01014',
      DRREDDY: 'INE089A01031',
      EICHERMOT: 'INE066A01021',
      ETERNAL: 'INE758T01015',
      GRASIM: 'INE047A01021',
      HCLTECH: 'INE860A01027',
      HDFCBANK: 'INE040A01034',
      HDFCLIFE: 'INE795G01014',
      HEROMOTOCO: 'INE158A01026',
      HINDALCO: 'INE038A01020',
      HINDUNILVR: 'INE030A01027',
      ICICIBANK: 'INE090A01021',
      INDUSINDBK: 'INE095A01012',
      INFY: 'INE009A01021',
      ITC: 'INE154A01025',
      JIOFIN: 'INE758E01017',
      JSWSTEEL: 'INE019A01038',
      KOTAKBANK: 'INE237A01028',
      LT: 'INE018A01030',
      'M&M': 'INE101A01026',
      MARUTI: 'INE585B01010',
      NESTLEIND: 'INE239A01024',
      NTPC: 'INE733E01010',
      ONGC: 'INE213A01029',
      POWERGRID: 'INE752E01010',
      RELIANCE: 'INE002A01018',
      SBILIFE: 'INE123W01016',
      SHRIRAMFIN: 'INE721A01047',
      SBIN: 'INE062A01020',
      SUNPHARMA: 'INE044A01036',
      TCS: 'INE467B01029',
      TATACONSUM: 'INE192A01030',
      TATAMOTORS: 'INE155A01022',
      TATASTEEL: 'INE081A01020',
      TECHM: 'INE669C01036',
      TITAN: 'INE280A01028',
      TRENT: 'INE849B01017',
      ULTRACEMCO: 'INE481G01017',
      WIPRO: 'INE075A01022'
    };
    
    for (const [ticker, isin] of Object.entries(stockOverrides)) {
      map.set(ticker.toUpperCase(), isin);
    }
    
    isinMapping = map;
    return map;
  } catch (err) {
    console.error('ISIN mapping load failed:', err);
    isinMapping = new Map();
    return isinMapping;
  }
}

function getISINForSymbol(symbol: string): string | null {
  // If the caller already provided an ISIN, accept it directly
  const maybeIsin = symbol?.trim();
  if (maybeIsin && /^INE[A-Z0-9]{9,}$/.test(maybeIsin)) {
    return maybeIsin;
  }
  const map = loadISINMapping();
  const key = maybeIsin?.toUpperCase() || '';
  return map.get(maybeIsin) || map.get(key) || null;
}

// ---------------------- Support/Resistance Channel Logic (MTF-Selector) ----------------------
// Configuration parameters (exact values from MTF-Selector)
const SR_CONFIG = {
  prd: 10,           // Pivot period
  ppsrc: 'High/Low', // Source for pivot detection
  ChannelW: 5,       // Maximum Channel Width %
  minstrength: 1,    // Minimum Strength (internally multiplied by 20)
  maxnumsr: 6,       // Maximum number of channels
  loopback: 400      // Loopback period - increased for more comprehensive analysis
};

// Detect pivot highs and lows (exact MTF-Selector logic)
function detectPivots(candles: OHLC[], prd: number, ppsrc: string): PivotPoint[] {
  const pivots: PivotPoint[] = [];
  
  for (let i = prd; i < candles.length - prd; i++) {
    const current = candles[i];
    
    if (ppsrc === 'High/Low') {
      // Check for pivot high
      let isPivotHigh = true;
      for (let j = i - prd; j <= i + prd; j++) {
        if (j !== i && candles[j].high >= current.high) {
          isPivotHigh = false;
          break;
        }
      }
      
      if (isPivotHigh) {
        pivots.push({
          index: i,
          price: current.high,
          type: 'high',
          timestamp: current.time
        });
      }
      
      // Check for pivot low
      let isPivotLow = true;
      for (let j = i - prd; j <= i + prd; j++) {
        if (j !== i && candles[j].low <= current.low) {
          isPivotLow = false;
          break;
        }
      }
      
      if (isPivotLow) {
        pivots.push({
          index: i,
          price: current.low,
          type: 'low',
          timestamp: current.time
        });
      }
    }
  }
  
  return pivots;
}

// Calculate high-low range over last 300 bars
function calculateHighLowRange(candles: OHLC[], lookback: number = 300): number {
  const startIndex = Math.max(0, candles.length - lookback);
  const recentCandles = candles.slice(startIndex);
  
  const high = Math.max(...recentCandles.map(c => c.high));
  const low = Math.min(...recentCandles.map(c => c.low));
  
  return high - low;
}

// Pine Script approach: Generate channels from every pivot point
function groupPivotsIntoChannels(pivots: PivotPoint[], candles: OHLC[], channelW: number): Channel[] {
  const channels: Channel[] = [];
  const hlRange = calculateHighLowRange(candles);
  const maxChannelWidth = (channelW / 100) * hlRange;
  
  console.log(`HL Range: ${roundTo2Decimals(hlRange)}, Max Channel Width: ${roundTo2Decimals(maxChannelWidth)}`);
  
  // Pine Script approach: Create channel starting from each pivot point
  for (let i = 0; i < pivots.length; i++) {
    const startPivot = pivots[i];
    let channelUpper = startPivot.price;
    let channelLower = startPivot.price;
    const channelPivots = [startPivot];
    let pivotStrength = 20; // Base strength for starting pivot
    
    // Find all other pivots that fit within max channel width
    for (let j = 0; j < pivots.length; j++) {
      if (i === j) continue;
      
      const otherPivot = pivots[j];
      const testUpper = Math.max(channelUpper, otherPivot.price);
      const testLower = Math.min(channelLower, otherPivot.price);
      const testWidth = testUpper - testLower;
      
      // Check if this pivot fits within max channel width
      if (testWidth <= maxChannelWidth) {
        channelUpper = testUpper;
        channelLower = testLower;
        channelPivots.push(otherPivot);
        pivotStrength += 20; // Add 20 for each pivot
      }
    }
    
    // Only create channel if it has meaningful width or multiple pivots
    if (channelPivots.length >= 1) {
      channels.push({
        upper: channelUpper,
        lower: channelLower,
        pivots: channelPivots,
        strength: pivotStrength // Initial strength from pivots only
      });
    }
  }
  
  return channels;
}

// Pine Script strength calculation: pivot strength + historical bar touches
function calculateChannelStrength(channel: Channel, candles: OHLC[]): number {
  let strength = channel.strength; // Use initial pivot-based strength from channel formation
  
  // Pine Script approach: Add 1 for each historical bar where high OR low touches the channel
  for (const candle of candles) {
    const high = candle.high;
    const low = candle.low;
    
    // Pine Script condition: high[y] <= h and high[y] >= l or low[y] <= h and low[y] >= l
    if ((high <= channel.upper && high >= channel.lower) || 
        (low <= channel.upper && low >= channel.lower)) {
      strength += 1;
    }
  }
  
  return strength;
}

// Main Support Resistance Channels calculation (exact MTF-Selector logic)
function calculateSupportResistanceChannels(candles: OHLC[]): SupportResistanceAnalysis {
  console.log(`Calculating Support/Resistance Channels for ${candles.length} candles`);
  
  // Minimum data requirement for pivot detection (need at least 2*prd + 1)
  const minRequired = 2 * SR_CONFIG.prd + 1; // 21 candles minimum
  if (candles.length < minRequired) {
    console.log(`Insufficient data: need ${minRequired}, got ${candles.length}`);
    return {
      nearest_support: null,
      nearest_resistance: null,
      support_broken: false,
      resistance_broken: false,
      all_valid_channels: [],
      support_levels: { S1: null, S2: null, S3: null },
      resistance_levels: { R1: null, R2: null, R3: null }
    };
  }
  
  // Use available data but limit to loopback period
  const effectiveLoopback = Math.min(SR_CONFIG.loopback, candles.length);
  const recentCandles = candles.slice(-effectiveLoopback);
  console.log(`Using ${recentCandles.length} candles for analysis (effective loopback: ${effectiveLoopback})`);
  
  // Detect pivot points
  const pivots = detectPivots(recentCandles, SR_CONFIG.prd, SR_CONFIG.ppsrc);
  console.log(`Found ${pivots.length} pivot points`);
  
  if (pivots.length === 0) {
    return {
      nearest_support: null,
      nearest_resistance: null,
      support_broken: false,
      resistance_broken: false,
      all_valid_channels: [],
      support_levels: { S1: null, S2: null, S3: null },
      resistance_levels: { R1: null, R2: null, R3: null }
    };
  }
  
  // Group pivots into channels (Pine Script approach)
  const allChannels = groupPivotsIntoChannels(pivots, recentCandles, SR_CONFIG.ChannelW);
  console.log(`Created ${allChannels.length} candidate channels`);
  
  // Calculate strength for each channel
  allChannels.forEach(channel => {
    channel.strength = calculateChannelStrength(channel, recentCandles);
  });
  
  // Pine Script channel selection: Select strongest non-overlapping channels
  const selectedChannels: Channel[] = [];
  const usedPivots = new Set<number>();
  
  // Sort all channels by strength (strongest first)
  allChannels.sort((a, b) => b.strength - a.strength);
  
  for (const channel of allChannels) {
    // Check if channel meets minimum strength and isn't a single point
    if (channel.strength >= SR_CONFIG.minstrength * 20 && 
        channel.upper !== channel.lower) {
      
      // Check if any pivots in this channel are already used
      const channelPivotIndices = channel.pivots.map(p => p.index);
      const hasUsedPivots = channelPivotIndices.some(idx => usedPivots.has(idx));
      
      if (!hasUsedPivots && selectedChannels.length < SR_CONFIG.maxnumsr) {
        selectedChannels.push(channel);
        // Mark all pivots in this channel as used
        channelPivotIndices.forEach(idx => usedPivots.add(idx));
      }
    }
  }
  
  const validChannels = selectedChannels;
  console.log(`Valid channels: ${validChannels.length}`);
  
  // Get current price (from the previous day to avoid hindsight bias)
  const currentPrice = candles[candles.length - 2]?.close || candles[candles.length - 1]?.close;
  
  // Separate support and resistance channels
  const supportChannels: SupportResistanceChannel[] = [];
  const resistanceChannels: SupportResistanceChannel[] = [];
  
  for (const channel of validChannels) {
    const channelData = {
      upper: channel.upper,
      lower: channel.lower,
      strength: channel.strength
    };
    
    // Check if channel is support (below current price)
    if (channel.upper < currentPrice) {
      supportChannels.push(channelData);
    }
    
    // Check if channel is resistance (above current price)
    if (channel.lower > currentPrice) {
      resistanceChannels.push(channelData);
    }
  }
  
  // Sort support channels by proximity to current price (nearest first)
  supportChannels.sort((a, b) => b.upper - a.upper);
  
  // Sort resistance channels by proximity to current price (nearest first)
  resistanceChannels.sort((a, b) => a.lower - b.lower);
  
  // Get nearest support and resistance (for backward compatibility)
  const nearestSupport = supportChannels.length > 0 ? supportChannels[0] : null;
  const nearestResistance = resistanceChannels.length > 0 ? resistanceChannels[0] : null;
  
  // Get S1, S2, S3 and R1, R2, R3
  const supportLevels = {
    S1: supportChannels.length > 0 ? supportChannels[0] : null,
    S2: supportChannels.length > 1 ? supportChannels[1] : null,
    S3: supportChannels.length > 2 ? supportChannels[2] : null
  };
  
  const resistanceLevels = {
    R1: resistanceChannels.length > 0 ? resistanceChannels[0] : null,
    R2: resistanceChannels.length > 1 ? resistanceChannels[1] : null,
    R3: resistanceChannels.length > 2 ? resistanceChannels[2] : null
  };
  
  // Check for breakouts
  const supportBroken = nearestSupport ? currentPrice < nearestSupport.lower : false;
  const resistanceBroken = nearestResistance ? currentPrice > nearestResistance.upper : false;
  
  console.log(`Current price: ${roundTo2Decimals(currentPrice)}`);
  console.log(`Nearest support: ${nearestSupport ? `${roundTo2Decimals(nearestSupport.lower)}-${roundTo2Decimals(nearestSupport.upper)} (${Math.round(nearestSupport.strength)})` : 'None'}`);
  console.log(`Nearest resistance: ${nearestResistance ? `${roundTo2Decimals(nearestResistance.lower)}-${roundTo2Decimals(nearestResistance.upper)} (${Math.round(nearestResistance.strength)})` : 'None'}`);
  console.log(`Support broken: ${supportBroken}, Resistance broken: ${resistanceBroken}`);
  
  return {
    nearest_support: nearestSupport,
    nearest_resistance: nearestResistance,
    support_broken: supportBroken,
    resistance_broken: resistanceBroken,
    all_valid_channels: validChannels.map(channel => ({
      upper: channel.upper,
      lower: channel.lower,
      strength: channel.strength
    })),
    support_levels: supportLevels,
    resistance_levels: resistanceLevels
  };
}

// ---------------------- Upstox Data Fetching ----------------------
function getInstrumentKey(isin: string, exchange: string = 'NSE'): string {
  const exchangeCode = exchange.toUpperCase() === 'BSE' ? 'BSE_EQ' : 'NSE_EQ';
  return `${exchangeCode}|${isin}`;
}

function getDailyDateRange(date: string, lookbackDays: number = 500): { fromDate: string; toDate: string } {
  const to = new Date(date + 'T00:00:00Z');
  const from = new Date(to);
  from.setDate(from.getDate() - lookbackDays);
  const toDate = to.toISOString().split('T')[0];
  const fromDate = from.toISOString().split('T')[0];
  return { fromDate, toDate };
}

async function fetchUpstoxDaily(isin: string, date: string, exchange: string = 'NSE'): Promise<OHLC[]> {
  const instrumentKey = getInstrumentKey(isin, exchange);
  const { fromDate, toDate } = getDailyDateRange(date);
  const url = `https://api.upstox.com/v3/historical-candle/${instrumentKey}/days/1/${toDate}/${fromDate}`;

  const response = await fetch(url, { 
    method: 'GET', 
    headers: { 'Accept': 'application/json' } 
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upstox daily fetch failed ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'success' || !data.data || !data.data.candles) {
    throw new Error('Invalid response format from Upstox API');
  }
  
  const candles: any[] = data.data.candles || [];
  const ohlc = candles.map((c: any[]) => ({
    time: Math.floor(new Date(c[0]).getTime() / 1000),
    open: Number(c[1]),
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
    volume: Number(c[5] ?? 0),
    dateStr: c[0].split('T')[0]
  }));
  
  // Ensure chronological order (oldest -> newest)
  ohlc.sort((a, b) => a.time - b.time);
  return ohlc;
}

// ---------------------- Technical Indicators ----------------------
function calculateTechnicalIndicators(candles: OHLC[]): TechnicalIndicators {
  if (candles.length < 50) {
    return {
      rsi14: null,
      rsi14Sma: null,
      macd: { macd: null, signal: null, histogram: null },
      sma9: null,
      sma20: null,
      ema50: null
    };
  }

  // Use data up to the previous day to avoid hindsight bias
  const analysisCandles = candles.slice(0, -1);
  const closes = analysisCandles.map(c => c.close);
  
  // RSI 14
  const rsi14Values = RSI.calculate({ values: closes, period: 14 });
  const rsi14 = rsi14Values.length > 0 ? rsi14Values[rsi14Values.length - 1] : null;
  
  // RSI 14 SMA (14-period SMA of RSI values)
  const rsi14SmaValues = rsi14Values.length >= 14 ? 
    SMA.calculate({ values: rsi14Values, period: 14 }) : [];
  const rsi14Sma = rsi14SmaValues.length > 0 ? rsi14SmaValues[rsi14SmaValues.length - 1] : null;
  
  // MACD (12, 26, 9)
  const macdData = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
  const macdLast = macdData.length > 0 ? macdData[macdData.length - 1] : null;
  
  // SMA 9
  const sma9Values = SMA.calculate({ values: closes, period: 9 });
  const sma9 = sma9Values.length > 0 ? sma9Values[sma9Values.length - 1] : null;
  
  // SMA 20
  const sma20Values = SMA.calculate({ values: closes, period: 20 });
  const sma20 = sma20Values.length > 0 ? sma20Values[sma20Values.length - 1] : null;
  
  // EMA 50
  const ema50Values = EMA.calculate({ values: closes, period: 50 });
  const ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : null;
  
  return {
    rsi14,
    rsi14Sma,
    macd: {
      macd: macdLast ? Number(macdLast.MACD) : null,
      signal: macdLast ? Number(macdLast.signal) : null,
      histogram: macdLast ? Number(macdLast.histogram) : null
    },
    sma9,
    sma20,
    ema50
  };
}

// ---------------------- Helper Functions ----------------------
function roundTo2Decimals(value: number | null): number | null {
  return value !== null ? Math.round(value * 100) / 100 : null;
}

function roundOHLCData(ohlc: OHLCData): OHLCData {
  return {
    ...ohlc,
    open: roundTo2Decimals(ohlc.open)!,
    high: roundTo2Decimals(ohlc.high)!,
    low: roundTo2Decimals(ohlc.low)!,
    close: roundTo2Decimals(ohlc.close)!,
    volume: Math.round(ohlc.volume) // Volume as whole number
  };
}

function roundSupportResistanceChannel(channel: SupportResistanceChannel): SupportResistanceChannel {
  return {
    upper: roundTo2Decimals(channel.upper)!,
    lower: roundTo2Decimals(channel.lower)!,
    strength: Math.round(channel.strength) // Strength as whole number
  };
}

function roundSupportResistanceAnalysis(sr: SupportResistanceAnalysis): SupportResistanceAnalysis {
  return {
    nearest_support: sr.nearest_support ? roundSupportResistanceChannel(sr.nearest_support) : null,
    nearest_resistance: sr.nearest_resistance ? roundSupportResistanceChannel(sr.nearest_resistance) : null,
    support_broken: sr.support_broken,
    resistance_broken: sr.resistance_broken,
    all_valid_channels: sr.all_valid_channels.map(roundSupportResistanceChannel),
    support_levels: {
      S1: sr.support_levels.S1 ? roundSupportResistanceChannel(sr.support_levels.S1) : null,
      S2: sr.support_levels.S2 ? roundSupportResistanceChannel(sr.support_levels.S2) : null,
      S3: sr.support_levels.S3 ? roundSupportResistanceChannel(sr.support_levels.S3) : null
    },
    resistance_levels: {
      R1: sr.resistance_levels.R1 ? roundSupportResistanceChannel(sr.resistance_levels.R1) : null,
      R2: sr.resistance_levels.R2 ? roundSupportResistanceChannel(sr.resistance_levels.R2) : null,
      R3: sr.resistance_levels.R3 ? roundSupportResistanceChannel(sr.resistance_levels.R3) : null
    }
  };
}

function roundTechnicalIndicators(tech: TechnicalIndicators): TechnicalIndicators {
  return {
    rsi14: roundTo2Decimals(tech.rsi14),
    rsi14Sma: roundTo2Decimals(tech.rsi14Sma),
    macd: {
      macd: roundTo2Decimals(tech.macd.macd),
      signal: roundTo2Decimals(tech.macd.signal),
      histogram: roundTo2Decimals(tech.macd.histogram)
    },
    sma9: roundTo2Decimals(tech.sma9),
    sma20: roundTo2Decimals(tech.sma20),
    ema50: roundTo2Decimals(tech.ema50)
  };
}

function getPreviousTradingDay(candles: OHLC[], targetDate: string): { date: string | null; close: number | null } {
  // Find the target date in candles
  const targetIndex = candles.findIndex(c => c.dateStr === targetDate);
  
  if (targetIndex <= 0) {
    return { date: null, close: null };
  }
  
  // Get the previous trading day
  const previousCandle = candles[targetIndex - 1];
  return {
    date: previousCandle.dateStr || null,
    close: roundTo2Decimals(previousCandle.close)
  };
}

function extractOHLCData(candles: OHLC[], targetDate: string): { 
  currentDayOHLC: OHLCData | null; 
  previousDayOHLC: OHLCData | null; 
} {
  // Find the target date in candles
  const targetIndex = candles.findIndex(c => c.dateStr === targetDate);
  
  let currentDayOHLC: OHLCData | null = null;
  let previousDayOHLC: OHLCData | null = null;
  
  // Get current day OHLC
  if (targetIndex >= 0) {
    const currentCandle = candles[targetIndex];
    currentDayOHLC = roundOHLCData({
      date: currentCandle.dateStr || targetDate,
      open: currentCandle.open,
      high: currentCandle.high,
      low: currentCandle.low,
      close: currentCandle.close,
      volume: currentCandle.volume
    });
  }
  
  // Get previous day OHLC
  if (targetIndex > 0) {
    const previousCandle = candles[targetIndex - 1];
    previousDayOHLC = roundOHLCData({
      date: previousCandle.dateStr || '',
      open: previousCandle.open,
      high: previousCandle.high,
      low: previousCandle.low,
      close: previousCandle.close,
      volume: previousCandle.volume
    });
  }
  
  return { currentDayOHLC, previousDayOHLC };
}

function parseDate(dateStr: string): Date {
  // Handle DD-MM-YYYY format
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 2) {
    // DD-MM-YYYY format
    const [day, month, year] = parts;
    return new Date(`${year}-${month}-${day}`);
  }
  // Assume YYYY-MM-DD format
  return new Date(dateStr);
}

function formatDateForAPI(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ---------------------- Single Stock Analysis Function ----------------------
async function analyzeSingleStock(
  isinParam: string, 
  dateParam: string, 
  exchange: string = 'NSE'
): Promise<StockAnalysisResponse | { isin: string; exchange: string; date: string; error: string }> {
  try {
    // Validate and get ISIN
    let isin: string;
    if (/^INE[A-Z0-9]{9,}$/.test(isinParam.trim())) {
      isin = isinParam.trim();
    } else {
      const mappedIsin = getISINForSymbol(isinParam);
      if (!mappedIsin) {
        return { 
          isin: isinParam, 
          exchange, 
          date: dateParam,
          error: `Invalid ISIN or symbol: ${isinParam}. Please provide a valid ISIN or known stock symbol.` 
        };
      }
      isin = mappedIsin;
    }

    // Parse and validate date
    let targetDate: string;
    try {
      const parsedDate = parseDate(dateParam);
      targetDate = formatDateForAPI(parsedDate);
    } catch {
      return { 
        isin: isinParam, 
        exchange, 
        date: dateParam,
        error: `Invalid date format: ${dateParam}. Please use DD-MM-YYYY format.` 
      };
    }

    // Fetch historical data from Upstox
    console.log(`Analyzing: ISIN: ${isin}, Exchange: ${exchange}, Date: ${targetDate}`);
    const candles = await fetchUpstoxDaily(isin, targetDate, exchange);
    
    if (candles.length === 0) {
      return { 
        isin, 
        exchange, 
        date: targetDate,
        error: `No historical data available for ISIN: ${isin} on ${exchange} exchange` 
      };
    }

    // Check if target date exists in data
    const targetCandle = candles.find(c => c.dateStr === targetDate);
    if (!targetCandle) {
      const availableDates = candles.map(c => c.dateStr).slice(-10);
      return { 
        isin, 
        exchange, 
        date: targetDate,
        error: `No data found for ${isin} (${exchange}) on date ${targetDate}. Recent available dates: ${availableDates.join(', ')}` 
      };
    }

    // Get previous trading day
    const { date: previousDate } = getPreviousTradingDay(candles, targetDate);

    // Extract OHLC data for current and previous day
    const { currentDayOHLC, previousDayOHLC } = extractOHLCData(candles, targetDate);

    // Check if we have enough data for analysis
    if (candles.length < 50) {
      return { 
        isin, 
        exchange, 
        date: targetDate,
        error: `Insufficient historical data for technical analysis. Need at least 50 days, got ${candles.length} days.` 
      };
    }

    // Calculate Support/Resistance using MTF-Selector logic
    const rawSupportResistance = calculateSupportResistanceChannels(candles);
    const supportResistance = roundSupportResistanceAnalysis(rawSupportResistance);
    
    // Calculate Technical Indicators (using previous day data to avoid hindsight bias)
    const rawTechnicals = calculateTechnicalIndicators(candles);
    const technicals = roundTechnicalIndicators(rawTechnicals);

    const response: StockAnalysisResponse = {
      isin,
      exchange,
      date: targetDate,
      previousDate,
      currentDayOHLC,
      previousDayOHLC,
      supportResistance,
      technicals
    };

    return response;

  } catch (error: any) {
    console.error(`Stock Analysis error for ${isinParam}:`, error);
    
    // Handle specific error types
    if (error.message.includes('Upstox')) {
      return { 
        isin: isinParam, 
        exchange, 
        date: dateParam,
        error: `Data source error: ${error.message}` 
      };
    }
    
    return { 
      isin: isinParam, 
      exchange, 
      date: dateParam,
      error: error.message || 'Internal server error occurred during stock analysis' 
    };
  }
}

// ---------------------- Main API Handler ----------------------
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const isinParam = searchParams.get('isin');
    const dateParam = searchParams.get('date');
    const exchangeParam = searchParams.get('exchange') || 'NSE'; // Default to NSE

    if (!isinParam || !dateParam) {
      return NextResponse.json({ 
        error: 'Both isin and date parameters are required. Format: ?isin=INE040A01034&date=15-01-2024&exchange=NSE or ?isin=HDFCBANK,RELIANCE,TCS&date=15-01-2024' 
      }, { status: 400 });
    }

    // Validate exchange parameter
    const validExchanges = ['NSE', 'BSE'];
    const exchange = exchangeParam.toUpperCase();
    if (!validExchanges.includes(exchange)) {
      return NextResponse.json({ 
        error: `Invalid exchange: ${exchangeParam}. Supported exchanges: ${validExchanges.join(', ')}` 
      }, { status: 400 });
    }

    // Check if it's a batch request (comma-separated ISINs/symbols)
    const isinList = isinParam.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    if (isinList.length === 1) {
      // Single stock analysis
      console.log(`Single stock analysis for: ${isinList[0]}`);
      const result = await analyzeSingleStock(isinList[0], dateParam, exchange);
      
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      
      return NextResponse.json(result);
      
    } else {
      // Batch analysis - process multiple stocks in parallel (same date)
      console.log(`Batch analysis for ${isinList.length} stocks on ${dateParam}: ${isinList.join(', ')}`);
      
      // Process all stocks in parallel using Promise.allSettled
      const analysisPromises = isinList.map(isin => 
        analyzeSingleStock(isin, dateParam, exchange)
      );
      
      const results = await Promise.allSettled(analysisPromises);
      
      // Process results
      const processedResults: (StockAnalysisResponse | { isin: string; exchange: string; date: string; error: string })[] = [];
      let successfulAnalyses = 0;
      let failedAnalyses = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processedResults.push(result.value);
          if ('error' in result.value) {
            failedAnalyses++;
          } else {
            successfulAnalyses++;
          }
        } else {
          // Promise was rejected
          processedResults.push({
            isin: isinList[index],
            exchange,
            date: dateParam,
            error: `Analysis failed: ${result.reason?.message || 'Unknown error'}`
          });
          failedAnalyses++;
        }
      });
      
      const processingTime = Date.now() - startTime;
      
      const batchResponse: BatchStockAnalysisResponse = {
        success: successfulAnalyses > 0,
        total_requests: isinList.length,
        successful_analyses: successfulAnalyses,
        failed_analyses: failedAnalyses,
        processing_time_ms: processingTime,
        results: processedResults
      };
      
      console.log(`Batch analysis completed: ${successfulAnalyses}/${isinList.length} successful in ${processingTime}ms`);
      
      return NextResponse.json(batchResponse);
    }

  } catch (error: any) {
    console.error('Stock Analysis API error:', error);
    
    const processingTime = Date.now() - startTime;
    
    // Handle specific error types
    if (error.message.includes('Upstox')) {
      return NextResponse.json({ 
        error: `Data source error: ${error.message}`,
        processing_time_ms: processingTime
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: error.message || 'Internal server error occurred during stock analysis',
      processing_time_ms: processingTime
    }, { status: 500 });
  }
}

// ---------------------- POST Method for Flexible Batch Processing ----------------------
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { requests, default_exchange = 'NSE' } = body;

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return NextResponse.json({ 
        error: 'requests array is required. Format: { "requests": [{"isin": "HDFCBANK", "date": "15-01-2024", "exchange": "NSE"}, {"isin": "RELIANCE", "date": "16-01-2024", "exchange": "BSE"}] }' 
      }, { status: 400 });
    }

    // Validate each request
    const stockRequests: StockRequest[] = [];
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (!req.isin || !req.date) {
        return NextResponse.json({ 
          error: `Request ${i + 1} is missing required fields. Each request must have 'isin' and 'date'.` 
        }, { status: 400 });
      }
      
      const exchange = (req.exchange || default_exchange).toUpperCase();
      const validExchanges = ['NSE', 'BSE'];
      if (!validExchanges.includes(exchange)) {
        return NextResponse.json({ 
          error: `Request ${i + 1} has invalid exchange: ${req.exchange}. Supported exchanges: ${validExchanges.join(', ')}` 
        }, { status: 400 });
      }

      stockRequests.push({
        isin: req.isin.trim(),
        date: req.date.trim(),
        exchange
      });
    }

    console.log(`Flexible batch analysis for ${stockRequests.length} requests`);
    
    // Process all requests in parallel using Promise.allSettled
    const analysisPromises = stockRequests.map(req => 
      analyzeSingleStock(req.isin, req.date, req.exchange)
    );
    
    const results = await Promise.allSettled(analysisPromises);
    
    // Process results
    const processedResults: (StockAnalysisResponse | { isin: string; exchange: string; date: string; error: string })[] = [];
    let successfulAnalyses = 0;
    let failedAnalyses = 0;
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        processedResults.push(result.value);
        if ('error' in result.value) {
          failedAnalyses++;
        } else {
          successfulAnalyses++;
        }
      } else {
        // Promise was rejected
        const req = stockRequests[index];
        processedResults.push({
          isin: req.isin,
          exchange: req.exchange!,
          date: req.date,
          error: `Analysis failed: ${result.reason?.message || 'Unknown error'}`
        });
        failedAnalyses++;
      }
    });
    
    const processingTime = Date.now() - startTime;
    
    const batchResponse: BatchStockAnalysisResponse = {
      success: successfulAnalyses > 0,
      total_requests: stockRequests.length,
      successful_analyses: successfulAnalyses,
      failed_analyses: failedAnalyses,
      processing_time_ms: processingTime,
      results: processedResults
    };
    
    console.log(`Flexible batch analysis completed: ${successfulAnalyses}/${stockRequests.length} successful in ${processingTime}ms`);
    
    return NextResponse.json(batchResponse);

  } catch (error: any) {
    console.error('Stock Analysis POST API error:', error);
    
    const processingTime = Date.now() - startTime;
    
    // Handle JSON parsing errors
    if (error.message.includes('JSON')) {
      return NextResponse.json({ 
        error: 'Invalid JSON format in request body',
        processing_time_ms: processingTime
      }, { status: 400 });
    }
    
    // Handle specific error types
    if (error.message.includes('Upstox')) {
      return NextResponse.json({ 
        error: `Data source error: ${error.message}`,
        processing_time_ms: processingTime
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: error.message || 'Internal server error occurred during stock analysis',
      processing_time_ms: processingTime
    }, { status: 500 });
  }
}
