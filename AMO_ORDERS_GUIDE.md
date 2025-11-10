# 🌙 AMO (After Market Order) Guide

## Overview
AMO (After Market Order) allows you to place orders **outside market hours** that will be executed when the market opens.

**Market Hours:** 9:15 AM - 3:30 PM IST  
**AMO Orders:** 3:30 PM - 9:15 AM (next trading day)

---

## 🎯 Quick Reference

### Regular Order (Default)
```json
{
  "amo": false
}
```
or simply omit the `amo` parameter (defaults to `false`)

### AMO Order
```json
{
  "amo": true
}
```

---

## 📝 Examples

### Example 1: Regular Equity Order (During Market Hours)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_UUID",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10
  }'
```
**Result:** Order executes immediately during market hours

---

### Example 2: AMO Equity Order (After Market Hours)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_UUID",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10,
    "amo": true
  }'
```
**Result:** Order queued, will execute at 9:15 AM next trading day

---

### Example 3: AMO Options Order
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_UUID",
    "symbol": "NIFTY",
    "transaction_type": "BUY",
    "quantity": 50,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "CE",
    "amo": true
  }'
```
**Result:** Options order queued for market open

---

### Example 4: Regular Options Order (Market Hours)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_UUID",
    "symbol": "NIFTY",
    "transaction_type": "SELL",
    "quantity": 75,
    "contract_type": "OPT",
    "expiry": "31-07-2025",
    "strike_price": "25100",
    "option_type": "PE",
    "amo": false
  }'
```
**Result:** Executes immediately (if market is open)

---

## 🕐 When to Use AMO

### ✅ Use AMO When:
1. **After Market Closes** (3:30 PM - 9:15 AM)
   - Place orders in the evening for next day
   - Take advantage of after-hours news/events

2. **Before Market Opens** (9:00 AM - 9:15 AM)
   - Get your orders in the queue
   - Capture opening price movements

3. **Weekend Trading** (Saturday/Sunday)
   - Place orders for Monday opening
   - Plan your week ahead

4. **Special Events**
   - Budget announcements
   - Corporate earnings releases
   - Global market movements

### ❌ Don't Use AMO When:
- Market is currently open (9:15 AM - 3:30 PM)
- You need immediate execution
- You want to see current market price before executing

---

## 📊 Response Differences

### Regular Order Response
```json
{
  "success": true,
  "data": {
    "order": {
      "symbol": "RELIANCE",
      "order_id": "ORD123",
      "order_status": "COMPLETE",
      "is_amo": false
    }
  }
}
```

### AMO Order Response
```json
{
  "success": true,
  "data": {
    "order": {
      "symbol": "RELIANCE",
      "order_id": "ORD123",
      "order_status": "PENDING",
      "is_amo": true
    }
  }
}
```
**Note:** AMO orders show `is_amo: true` and typically have status `PENDING` until market opens

---

## 🎓 Real-World Scenarios

### Scenario 1: Evening Planning
**Time:** 8:00 PM (Market Closed)

```bash
# Place AMO orders for tomorrow
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10,
    "amo": true,
    "order_reason": "Evening AMO for next day"
  }'

curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "TCS",
    "transaction_type": "BUY",
    "quantity": 5,
    "amo": true,
    "order_reason": "Evening AMO for next day"
  }'
```

---

### Scenario 2: Weekend Preparation
**Time:** Sunday 6:00 PM

```bash
# Set up Monday orders
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
    "option_type": "CE",
    "amo": true,
    "order_reason": "Monday opening strategy"
  }'
```

---

### Scenario 3: Budget Day Trading
**Time:** 11:00 AM (Day before Budget)

```bash
# Place orders for Budget day morning
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "HDFCBANK",
    "transaction_type": "BUY",
    "quantity": 5,
    "amo": true,
    "order_reason": "Budget day opening"
  }'
```

---

### Scenario 4: Intraday vs Regular Trading
**Regular (Market Hours):**
```bash
# Immediate execution during market hours
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "INFY",
    "transaction_type": "BUY",
    "quantity": 10,
    "product_type": "INTRADAY"
  }'
```

**AMO (After Hours):**
```bash
# Queue for next day's opening
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "UUID",
    "symbol": "INFY",
    "transaction_type": "BUY",
    "quantity": 10,
    "product_type": "INTRADAY",
    "amo": true
  }'
```

---

## ⚠️ Important Notes

### 1. Execution Timing
- **AMO orders execute at market open (9:15 AM)**
- Execution price may differ from expected price
- No guarantee of execution if circuit filters hit

### 2. Cancellation
- AMO orders can be cancelled before market open
- Cannot cancel once market opens and execution starts

### 3. Price Discovery
- AMO orders typically use opening price
- LIMIT orders use your specified price
- MARKET orders use best available price at open

### 4. Options AMO
- Options AMO orders are allowed
- Check contract availability at opening
- Strike prices must be valid

### 5. Weekend Orders
- Saturday/Sunday orders queue for Monday
- Holiday orders queue for next trading day

---

## 🔍 How to Check Market Status

The API automatically handles market status, but you can manually check:

```javascript
// IST time check
const now = new Date();
const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const hour = istTime.getHours();
const minute = istTime.getMinutes();
const dayOfWeek = istTime.getDay(); // 0 = Sunday, 6 = Saturday

// Market hours: 9:15 AM - 3:30 PM, Monday-Friday
const isMarketHours = 
  dayOfWeek >= 1 && dayOfWeek <= 5 && 
  (hour > 9 || (hour === 9 && minute >= 15)) &&
  (hour < 15 || (hour === 15 && minute <= 30));

console.log(isMarketHours ? "Market is OPEN" : "Market is CLOSED - Use AMO");
```

---

## 📋 Complete Parameters Table

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `amo` | boolean | `false` | After Market Order flag |
| `user_id` | string | - | Required: User UUID |
| `symbol` | string | - | Required: Stock/Index symbol |
| `transaction_type` | string | - | Required: BUY or SELL |
| `quantity` | number | - | Required: Number of shares/lots |
| `price` | number | - | Optional: For LIMIT orders |
| `order_type` | string | `"MARKET"` | MARKET, LIMIT, STOP_LOSS, etc. |
| `product_type` | string | `"DELIVERY"` | DELIVERY, INTRADAY, MARGIN, MTF |

---

## 💡 Best Practices

### ✅ DO:
- Use AMO for next-day planning
- Check order status after market opens
- Use LIMIT orders for price protection
- Cancel unused AMO orders before market open

### ❌ DON'T:
- Forget about pending AMO orders
- Place duplicate AMO orders
- Expect immediate execution with AMO
- Use AMO during market hours (unnecessary)

---

## 🎯 Quick Command Reference

### Regular Order (Market Hours)
```bash
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"BUY","quantity":10}'
```

### AMO Order (After Hours)
```bash
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"BUY","quantity":10,"amo":true}'
```

### Options AMO Order
```bash
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"NIFTY","transaction_type":"BUY","quantity":50,"contract_type":"OPT","expiry":"31-07-2025","strike_price":"25100","option_type":"CE","amo":true}'
```

---

## 📞 Troubleshooting

### Issue: AMO order not executing
**Check:**
- Is it past 9:15 AM?
- Check order status via orderbook API
- Verify funds available
- Check if stock/option contract exists

### Issue: Want to cancel AMO
**Solution:**
- Use cancel order API before 9:15 AM
- Orders can be cancelled from orderbook

### Issue: AMO executed at unexpected price
**Explanation:**
- AMO orders execute at opening price
- Use LIMIT orders for price control
- Opening price can gap up/down from previous close

---

## 🌟 Summary

**Default Behavior:** `amo: false` (Regular orders)  
**AMO Orders:** Set `amo: true` for after-hours orders  
**Best Use:** Evening planning, weekend prep, event-based trading  
**Execution:** Next market open (9:15 AM)

The API intelligently handles both regular and AMO orders based on the `amo` flag! 🚀

---

**Ready to place AMO orders!** 🌙

Use `"amo": true` for after-hours orders, or omit it for regular trading.

