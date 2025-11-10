# 🚀 Quick Start - Simple Trading API

## Your Simple Trade Execution API is Ready!

**Endpoint:** `POST /api/trading/manual-trade`

---

## ✨ What It Does

**Super Simple:** Just execute BUY/SELL orders with quantity - no position tracking, no database updates, just pure trade execution!

- ✅ Pass user_id + symbol + transaction_type + quantity
- ✅ System fetches user's credentials (CSid) automatically
- ✅ Executes the trade via Lemon API
- ✅ Returns order confirmation
- ✅ **No position management** - just executes the order!

---

## 📝 API Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string (UUID) | ✅ Yes | User ID from your database |
| `symbol` | string | ✅ Yes | Stock symbol (e.g., "RELIANCE") |
| `transaction_type` | string | ✅ Yes | "BUY" or "SELL" |
| `quantity` | number | ✅ Yes | Number of shares to buy/sell |
| `price` | number | ❌ No | Stock price (omit for market orders) |
| `order_reason` | string | ❌ No | Reason for trade (default: "MANUAL_TRADE") |
| `exchange` | string | ❌ No | Exchange (default: "NSE") |

---

## 🎯 Test It Right Now!

### Step 1: Get Your User ID
```sql
SELECT id, full_name, email FROM users WHERE is_active = true LIMIT 1;
```

### Step 2: BUY Order (Market Price)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 5
  }'
```

### Step 3: SELL Order (Market Price)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "quantity": 5
  }'
```

---

## 📋 Real Examples

### Example 1: BUY 10 shares of RELIANCE
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "quantity": 10
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "BUY order placed successfully",
  "data": {
    "user": {
      "name": "John Doe",
      "client_id": "LEMON_CLIENT_ID"
    },
    "order": {
      "symbol": "RELIANCE",
      "transaction_type": "BUY",
      "quantity": 10,
      "price": 1405.50,
      "order_id": "LMN_ORD_12345",
      "order_status": "PLACED",
      "market_status": "OPEN"
    },
    "estimated_value": 14055
  }
}
```

---

### Example 2: SELL 5 shares of TCS
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "TCS",
    "transaction_type": "SELL",
    "quantity": 5
  }'
```

---

### Example 3: BUY with specific price (Limit Order)
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "HDFCBANK",
    "transaction_type": "BUY",
    "quantity": 3,
    "price": 1600.00
  }'
```

---

### Example 4: SELL with custom reason
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "INFY",
    "transaction_type": "SELL",
    "quantity": 8,
    "order_reason": "Profit booking at target"
  }'
```

---

## 🔧 Using the Test Script

### Quick Commands:
```bash
# Test connection
./test-manual-trade.sh test

# BUY 5 shares of RELIANCE
./test-manual-trade.sh buy YOUR_USER_ID RELIANCE 5

# SELL 5 shares of RELIANCE
./test-manual-trade.sh sell YOUR_USER_ID RELIANCE 5
```

**Note:** The quantity parameter is now REQUIRED!

---

## ✅ What Gets Updated

**Only the Lemon API order is placed** - that's it!

The API:
- ✅ Places order via Lemon API
- ✅ Saves order to `real_orders` table (for audit trail)
- ❌ Does NOT create positions in `user_positions`
- ❌ Does NOT track P&L
- ❌ Does NOT manage position lifecycle

**Perfect for:**
- Manual trading
- Testing trades
- External trading bots
- Simple order execution
- Day trading without position tracking

---

## 🎓 Complete Workflow Example

```bash
# 1. Get user ID from database
USER_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# 2. Buy 10 RELIANCE at market price
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"RELIANCE\",
    \"transaction_type\": \"BUY\",
    \"quantity\": 10
  }"

# 3. Sell 10 RELIANCE at market price
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"RELIANCE\",
    \"transaction_type\": \"SELL\",
    \"quantity\": 10
  }"
```

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "BUY order placed successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "User Name",
      "email": "user@email.com",
      "client_id": "LEMON_CLIENT_ID"
    },
    "order": {
      "symbol": "RELIANCE",
      "transaction_type": "BUY",
      "quantity": 10,
      "price": 1405.50,
      "order_id": "LEMON_ORDER_ID",
      "order_status": "PLACED",
      "market_status": "OPEN",
      "is_amo": false,
      "execution_time": "Immediate"
    },
    "estimated_value": 14055.00
  },
  "lemon_response": { ... },
  "timestamp": "2025-11-10T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "quantity is required and must be greater than 0"
}
```

---

## ⚠️ Common Errors

### 1. Missing Quantity
```json
{
  "success": false,
  "error": "quantity is required and must be greater than 0"
}
```
**Fix:** Always provide the quantity parameter!

### 2. User Not Found
```json
{
  "success": false,
  "error": "User not found in database"
}
```
**Fix:** Check the user_id is correct in your database.

### 3. No API Credentials
```json
{
  "success": false,
  "error": "User does not have API credentials configured."
}
```
**Fix:** User needs to complete onboarding first.

---

## 💡 Key Points

1. **Quantity is REQUIRED** - Always provide it!
2. **No Position Management** - Just executes orders
3. **Market Orders by Default** - Omit price for market orders
4. **Audit Trail** - Orders saved to `real_orders` table only
5. **Simple & Fast** - No calculations, no tracking, just execution

---

## 🔒 Security Note

⚠️ **This endpoint has NO authentication!**

For production, add:
- JWT authentication
- API key validation
- Rate limiting
- IP whitelisting

---

## 🎯 Your First Trade (3 Commands)

```bash
# 1. Set your user ID
USER_ID="YOUR_UUID_HERE"

# 2. Buy 5 shares
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"'$USER_ID'","symbol":"RELIANCE","transaction_type":"BUY","quantity":5}'

# 3. Sell 5 shares
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"'$USER_ID'","symbol":"RELIANCE","transaction_type":"SELL","quantity":5}'
```

---

**That's it!** Simple trading execution - just provide quantity and stock info! 🚀

**Note:** The order gets saved to `real_orders` table for audit purposes, but no position tracking is maintained.

