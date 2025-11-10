# 📈 OPTIONS TRADING API - Complete Guide

## Overview
The Manual Trading API now supports **OPTIONS** and **FUTURES** contracts according to the Lemon API specification!

**Endpoint:** `POST /api/trading/manual-trade`

---

## 🎯 What's Supported

### ✅ EQUITY Trading
- NSE & BSE stocks
- Market & Limit orders
- DELIVERY, INTRADAY, MARGIN, MTF

### ✅ OPTIONS Trading  
- Call (CE) & Put (PE) options
- NFO & BFO exchanges
- Custom strike prices
- Flexible expiry dates

### ✅ FUTURES Trading
- Index & Stock futures
- NFO & BFO exchanges
- All contract types

---

## 📋 Parameters Reference

### Common Parameters (All Orders)
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | ✅ Yes | User UUID from database |
| `symbol` | string | ✅ Yes | Stock/Index symbol |
| `transaction_type` | string | ✅ Yes | "BUY" or "SELL" |
| `quantity` | number | ✅ Yes | Number of shares/lots |
| `price` | number | ❌ No | For LIMIT orders |
| `order_type` | string | ❌ No | Default: "MARKET" |
| `product_type` | string | ❌ No | Default: "DELIVERY" |
| `exchange` | string | ❌ No | Auto-detected |
| `order_reason` | string | ❌ No | Trade reason/tag |

### OPTIONS-Specific Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contract_type` | string | ✅ Yes | "OPT" for options |
| `expiry` | string | ✅ Yes | **dd-mm-yyyy** format |
| `strike_price` | string | ✅ Yes | Strike price (e.g., "25100") |
| `option_type` | string | ✅ Yes | "CE" or "PE" |

### FUTURES-Specific Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `contract_type` | string | ✅ Yes | "FUT" for futures |
| `expiry` | string | ✅ Yes | **dd-mm-yyyy** format |

---

## 🚀 OPTIONS Examples

### Example 1: BUY NIFTY Call Option
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 50,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "CE",
    "exchange": "NFO"
  }'
```

**This places a Market Order to BUY 50 lots of NIFTY 25100 CE expiring on 31-Jul-2025**

---

### Example 2: SELL NIFTY Put Option (Limit Order)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "NIFTY",
    "transaction_type": "SELL",
    "quantity": 75,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "PE",
    "price": 117.65,
    "order_type": "LIMIT",
    "product_type": "DELIVERY"
  }'
```

**This places a Limit Order to SELL 75 lots of NIFTY 25100 PE at ₹117.65**

---

### Example 3: BUY BANKNIFTY Call Option
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "BANKNIFTY",
    "transaction_type": "BUY",
    "quantity": 25,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "45000",
    "option_type": "CE",
    "order_type": "MARKET",
    "product_type": "INTRADAY"
  }'
```

---

### Example 4: SELL BANKNIFTY Put Option
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "BANKNIFTY",
    "transaction_type": "SELL",
    "quantity": 25,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "44000",
    "option_type": "PE"
  }'
```

---

## 📊 FUTURES Examples

### Example 5: BUY NIFTY Futures
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 50,
    "contract_type": "FUT",
    "expiry": "31-07-2025",
    "exchange": "NFO"
  }'
```

---

### Example 6: SELL Stock Futures (RELIANCE)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "quantity": 250,
    "contract_type": "FUT",
    "expiry": "31-07-2025",
    "price": 1405.50,
    "order_type": "LIMIT"
  }'
```

---

## 💰 EQUITY Examples (For Comparison)

### Example 7: BUY Equity Shares
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10,
    "exchange": "NSE"
  }'
```

---

### Example 8: SELL Equity with MTF
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID",
    "symbol": "TCS",
    "transaction_type": "SELL",
    "quantity": 5,
    "product_type": "MTF",
    "exchange": "NSE"
  }'
```

---

## ✅ Success Response (OPTIONS)

```json
{
  "success": true,
  "message": "BUY order placed successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "user@email.com",
      "client_id": "LEMON_CLIENT_ID"
    },
    "order": {
      "symbol": "NIFTY",
      "transaction_type": "BUY",
      "quantity": 50,
      "price": 117.65,
      "order_type": "MARKET",
      "product_type": "DELIVERY",
      "exchange": "NFO",
      "order_id": "ORD123456789",
      "order_status": "PENDING",
      "contract_type": "OPT",
      "expiry": "31-07-2025",
      "strike_price": "25100",
      "option_type": "CE"
    },
    "estimated_value": 5882.50
  },
  "lemon_response": {
    "status": "success",
    "message": "Order placed successfully",
    "data": {
      "orderId": "ORD123456789",
      "orderStatus": "PENDING"
    }
  },
  "timestamp": "2025-11-10T12:30:00Z"
}
```

---

## ❌ Error Responses

### Missing OPTIONS Parameters
```json
{
  "success": false,
  "error": "strike_price is required for options contracts"
}
```

### Invalid Expiry Format
```json
{
  "success": false,
  "error": "expiry must be in dd-mm-yyyy format (e.g. \"31-07-2025\")"
}
```

### Invalid Option Type
```json
{
  "success": false,
  "error": "option_type must be either CE or PE for options"
}
```

---

## 🎓 Real-World Trading Scenarios

### Scenario 1: Options Straddle Strategy
Buy both Call and Put at same strike:

```bash
# Buy NIFTY 25100 Call
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 50,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "CE"
  }'

# Buy NIFTY 25100 Put
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 50,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "PE"
  }'
```

---

### Scenario 2: Covered Call Strategy
Own stock + Sell Call option:

```bash
# Own 1000 RELIANCE shares (previously bought)

# Sell RELIANCE Call Option
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "quantity": 1,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "1500",
    "option_type": "CE",
    "product_type": "DELIVERY"
  }'
```

---

### Scenario 3: Intraday Options Trading
```bash
# Morning: Buy Call
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 75,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25200",
    "option_type": "CE",
    "product_type": "INTRADAY"
  }'

# Afternoon: Square Off (Sell)
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "NIFTY",
    "transaction_type": "SELL",
    "quantity": 75,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25200",
    "option_type": "CE",
    "product_type": "INTRADAY"
  }'
```

---

## 📝 Parameter Validation Rules

### ✅ Valid Combinations

| Order Type | contract_type | Required Fields |
|------------|---------------|-----------------|
| EQUITY | Not provided | symbol, quantity |
| OPTIONS | "OPT" | symbol, quantity, expiry, strike_price, option_type |
| FUTURES | "FUT" | symbol, quantity, expiry |

### 🎯 Expiry Format
- **Must be:** `dd-mm-yyyy`
- **Examples:** `"31-07-2025"`, `"28-08-2025"`, `"26-09-2025"`
- **Invalid:** `"2025-07-31"`, `"31/07/2025"`, `"31-7-2025"`

### 🎯 Option Types
- **CE** = Call European
- **PE** = Put European

### 🎯 Strike Price
- Must be a string (e.g., `"25100"`, not `25100`)
- Should match available strikes in the market

### 🎯 Exchanges
- **Equity:** NSE, BSE
- **Derivatives:** NFO (NSE Futures & Options), BFO (BSE Futures & Options)

---

## 🔍 How to Find Strike Prices & Expiry

### Check Available Options:
```bash
# Use the LTP API to check available options
curl -X POST localhost:3000/api/trading/market-data/ltp \
  -H "Content-Type: application/json" \
  -d '{
    "NSE_FNO_SYMBOL": ["NIFTY_31-07-2025_25100_CE"]
  }'
```

### Common NIFTY Strike Prices:
- **ATM (At The Money):** 24900, 25000, 25100, 25200
- **ITM (In The Money) Calls:** 24800, 24900, 25000
- **OTM (Out The Money) Calls:** 25200, 25300, 25400

---

## 🛡️ Best Practices

### 1. Test with Small Quantities First
```bash
# Start with 1 lot for testing
"quantity": 1
```

### 2. Use LIMIT Orders for Better Prices
```bash
"order_type": "LIMIT",
"price": 117.65
```

### 3. Check Market Hours
- Options trading: 9:15 AM - 3:30 PM IST
- After hours orders become AMO (After Market Orders)

### 4. Verify Expiry Dates
- Weekly expiries: Every Thursday
- Monthly expiries: Last Thursday of the month
- Use exact format: `"31-07-2025"`

### 5. Monitor Positions
- Track your options positions separately
- Remember options expire (time decay)
- Square off before expiry if needed

---

## 📊 Complete Testing Workflow

```bash
# 1. Set your user ID
USER_ID="your-uuid-here"

# 2. BUY NIFTY Call Option (Market Order)
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"NIFTY\",
    \"transaction_type\": \"BUY\",
    \"quantity\": 50,
    \"contract_type\": \"OPT\",
    \"expiry\": \"31-07-2025\",
    \"strike_price\": \"25100\",
    \"option_type\": \"CE\"
  }"

# 3. Check order status (use order_id from response)

# 4. SELL Same Option (Square Off)
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"NIFTY\",
    \"transaction_type\": \"SELL\",
    \"quantity\": 50,
    \"contract_type\": \"OPT\",
    \"expiry\": \"31-07-2025\",
    \"strike_price\": \"25100\",
    \"option_type\": \"CE\"
  }"
```

---

## 🎯 Quick Reference

### NIFTY Options (50 lot size)
```json
{
  "symbol": "NIFTY",
  "quantity": 50,
  "contract_type": "OPT",
  "expiry": "31-07-2025",
  "strike_price": "25100",
  "option_type": "CE",
  "exchange": "NFO"
}
```

### BANKNIFTY Options (25 lot size)
```json
{
  "symbol": "BANKNIFTY",
  "quantity": 25,
  "contract_type": "OPT",
  "expiry": "31-07-2025",
  "strike_price": "45000",
  "option_type": "PE",
  "exchange": "NFO"
}
```

### Stock Options (varies by stock)
```json
{
  "symbol": "RELIANCE",
  "quantity": 250,
  "contract_type": "OPT",
  "expiry": "31-07-2025",
  "strike_price": "1500",
  "option_type": "CE"
}
```

---

## 🚨 Important Notes

1. **Lot Sizes Matter:** NIFTY = 50, BANKNIFTY = 25, Stocks = varies
2. **Expiry Format:** Always use `dd-mm-yyyy` format
3. **Strike Price:** Must be a string (e.g., `"25100"`)
4. **Option Type:** CE for Calls, PE for Puts
5. **Exchange:** NFO for index options, BFO for BSE options
6. **No Position Tracking:** This API only executes orders, doesn't track P&L

---

## 📞 Support

For issues or questions:
1. Check error messages carefully
2. Verify all required fields are provided
3. Ensure expiry date format is correct (`dd-mm-yyyy`)
4. Confirm user has completed onboarding

---

**Ready to trade options!** 🎯

Start with small quantities and test thoroughly before live trading.

