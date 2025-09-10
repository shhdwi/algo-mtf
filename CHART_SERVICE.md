# Chart Service Documentation

A comprehensive charting service for fetching OHLC (Open, High, Low, Close) data for Indian stocks using the Trading API.

## Features

- ✅ **Single Symbol Data** - Get OHLC data for any stock
- ✅ **Multiple Symbols** - Fetch data for up to 50 symbols in parallel
- ✅ **Flexible Time Intervals** - Support for 5s, 15s, 30s, 1m, 5m, 15m, 30m, 60m
- ✅ **Multiple Exchanges** - NSE, BSE, NFO, BFO support
- ✅ **Current Price** - Real-time price with change percentage
- ✅ **Intraday Data** - Today's trading data
- ✅ **Historical Data** - Custom date range queries
- ✅ **Nifty 100 Symbols** - Pre-configured with all major stocks
- ✅ **TypeScript Support** - Full type safety
- ✅ **Error Handling** - Comprehensive error management

## Setup

### Environment Variables

Add these to your `.env.local` file:

```bash
# Trading API Configuration
TRADING_API_URL=https://api-trading/api/v2
TRADING_API_KEY=aa5d428e8778e95fdd414a89f7d2cc55321e74914d8f7d5a670f89e123788f40
TRADING_AUTH_KEY=1141271d229e8eaa532a09bc535a29b8bb92f6e474117bf0037e6c3bb8b75cf0
TRADING_CLIENT_ID=CS14866693
TRADING_PHONE_NUMBER=7977814522
```

## API Endpoints

### 1. Get Single Chart Data (Intraday)

**POST** `/api/chart`

```json
{
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "interval": "5m",
  "duration": "1h"
}
```

**Alternative with custom time range:**
```json
{
  "symbol": "RELIANCE",
  "exchange": "NSE", 
  "interval": "5m",
  "startTime": "2025-01-15T09:15:00",
  "endTime": "2025-01-15T15:30:00"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "interval": "5m",
    "timeframe": {
      "start": "2025-01-15T14:15:00",
      "end": "2025-01-15T15:15:00"
    },
    "data": [
      {
        "timestamp": "2025-01-15T14:15:00",
        "datetime": "2025-01-15T14:15:00.000Z",
        "open": 1467.50,
        "high": 1468.70,
        "low": 1467.40,
        "close": 1468.10,
        "volume": 18841
      }
    ]
  }
}
```

### 2. Get Multiple Charts Data

**POST** `/api/chart/multiple`

```json
{
  "symbols": ["RELIANCE", "TCS", "HDFCBANK"],
  "options": {
    "exchange": "NSE",
    "interval": "5m",
    "duration": "2h"
  }
}
```

### 3. Get Current Price

**GET** `/api/chart?action=current-price&symbol=RELIANCE&exchange=NSE`

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "price": 1468.10,
    "change": 5.30,
    "changePercent": 0.36,
    "timestamp": "2025-01-15T15:14:00"
  }
}
```

### 4. Get Intraday Data

**GET** `/api/chart?action=intraday&symbol=RELIANCE&interval=5m&exchange=NSE`

### 5. Get Historical Data

**POST** `/api/chart/historical`

```json
{
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "interval": "1W",
  "startDate": "2024-01-01T09:15:00",
  "endDate": "2024-12-31T15:30:00"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "RELIANCE",
    "exchange": "NSE", 
    "interval": "1W",
    "timeframe": {
      "start": "2024-01-01T09:15:00",
      "end": "2024-12-31T15:30:00"
    },
    "data": [
      {
        "timestamp": "2024-01-01T09:30:00",
        "epochTime": 1704067800000,
        "datetime": "2024-01-01T09:30:00.000Z",
        "open": 2850.00,
        "high": 2865.50,
        "low": 2845.20,
        "close": 2860.30,
        "volume": 1250000
      }
    ]
  }
}
```

### 6. Get Historical Data by Period

**POST** `/api/chart/historical/period`

```json
{
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "period": "1Month"
}
```

**Available periods:** `1d`, `3d`, `1w`, `2w`, `1Month`, `3Month`, `6Month`, `1y`, `2y`

### 7. Get All Symbols

**GET** `/api/chart?action=symbols`

**Response:**
```json
{
  "success": true,
  "data": {
    "symbols": ["ABB", "ADANIENSOL", ...],
    "count": 133
  }
}
```

## Available Symbols

### Nifty 100 Stocks
All major Indian stocks including:
- **Banking**: HDFCBANK, ICICIBANK, SBIN, AXISBANK, KOTAKBANK
- **IT**: TCS, INFY, HCLTECH, WIPRO, TECHM
- **Auto**: MARUTI, TATAMOTORS, BAJAJ-AUTO, HEROMOTOCO
- **Pharma**: SUNPHARMA, DRREDDY, CIPLA, DIVISLAB
- **FMCG**: HINDUNILVR, BRITANNIA, DABUR, GODREJCP
- **Energy**: RELIANCE, ONGC, BPCL, IOC, GAIL
- **And many more...**

### Additional Stocks
BANDHANBNK, CANBK, HDFCAMC, MUTHOOTFIN, PNB, SBICARD, BEL, BHARATFORG, HAL, HAVELLS, HPCL, IGL, PETRONET, TATAPOWER, INDIGO, MAHINDRA, TVSMOTOR, GLAND, LUPIN, TORNTPHARM, ABCAPITAL, DABUR, JSPL, PIRAMAL, SRF, TATACONSUM, TATACHEM, UBL, MCDOWELL-N, VBL, ZEEL, UPL

## Parameters

### Exchanges
- **NSE** (1) - National Stock Exchange
- **BSE** (3) - Bombay Stock Exchange  
- **NFO** (2) - NSE Futures & Options
- **BFO** (4) - BSE Futures & Options

### Time Intervals

**Intraday (Real-time):**
- **5s, 15s, 30s** - Second-level data
- **1m, 5m, 15m, 30m, 60m** - Minute-level data

**Historical (Long-term):**
- **1W** - Weekly data
- **1M** - Monthly data  
- **3M** - Quarterly data
- **1Y, 3Y, 5Y** - Yearly data

### Duration Shortcuts
- **1h, 2h, 4h** - Hours
- **1d, 3d** - Days
- **1w** - Week
- **1m** - Month

## Using the Service Directly

```typescript
import ChartService from '@/services/chartService';

const chartService = new ChartService();

// Get single stock data
const data = await chartService.getChartData({
  symbol: 'RELIANCE',
  exchange: 'NSE',
  interval: '5m',
  duration: '1h'
});

// Get multiple stocks
const multiData = await chartService.getMultipleChartData(
  ['RELIANCE', 'TCS', 'HDFCBANK'],
  { exchange: 'NSE', interval: '5m', duration: '2h' }
);

// Get current price
const price = await chartService.getCurrentPrice('RELIANCE', 'NSE');

// Get intraday data
const intraday = await chartService.getIntradayData('RELIANCE', '5m', 'NSE');
```

## Testing

### Test Utilities

```typescript
import { 
  testSingleChart, 
  testMultipleCharts, 
  testCurrentPrice,
  runChartTestSuite 
} from '@/utils/testChart';

// Test single stock
await testSingleChart('RELIANCE', '5m', '1h');

// Test multiple stocks  
await testMultipleCharts(['RELIANCE', 'TCS'], '5m', '2h');

// Run full test suite
await runChartTestSuite();
```

### cURL Examples

```bash
# Single chart data
curl -X POST http://localhost:3000/api/chart \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "RELIANCE",
    "exchange": "NSE",
    "interval": "5m", 
    "duration": "1h"
  }'

# Multiple charts
curl -X POST http://localhost:3000/api/chart/multiple \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["RELIANCE", "TCS", "HDFCBANK"],
    "options": {
      "exchange": "NSE",
      "interval": "5m",
      "duration": "2h"
    }
  }'

# Current price
curl "http://localhost:3000/api/chart?action=current-price&symbol=RELIANCE&exchange=NSE"

# Symbols list
curl "http://localhost:3000/api/chart?action=symbols"
```

## Error Handling

The service handles various error scenarios:
- Invalid symbols
- Missing required parameters
- API authentication failures
- Network timeouts
- Invalid time ranges

All errors return structured responses:
```json
{
  "success": false,
  "error": "Error description"
}
```

## Utility Functions

### Technical Analysis
```typescript
import { calculateSMA, formatIndianCurrency, formatVolume } from '@/utils/chartUtils';

// Calculate Simple Moving Average
const sma = calculateSMA(prices, 20);

// Format currency
const formatted = formatIndianCurrency(1468.10); // ₹1,468.10

// Format volume
const vol = formatVolume(18841); // 18.84K
```

### Market Hours
```typescript
import { isMarketOpen, getMarketHours } from '@/utils/chartUtils';

// Check if market is open
const isOpen = isMarketOpen('NSE'); // true/false

// Get market hours
const hours = getMarketHours('NSE'); // { open: '09:15', close: '15:30' }
```

## Performance

- **Single Symbol**: ~200-500ms response time
- **Multiple Symbols**: Parallel processing for optimal speed
- **Rate Limiting**: Built-in protection against API abuse
- **Caching**: Consider implementing Redis for production

## Production Considerations

1. **Rate Limiting**: Implement request throttling
2. **Caching**: Use Redis for frequently requested data
3. **Error Monitoring**: Add Sentry or similar
4. **Load Balancing**: For high-traffic scenarios
5. **Database**: Store historical data locally for faster access
