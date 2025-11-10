# 📈 Manual Trading API Guide

## Overview
This API endpoint allows you to manually place BUY and SELL orders for users in your database. The endpoint automatically handles authentication with Lemon API using the user's stored credentials.

**Endpoint:** `POST /api/trading/manual-trade`

---

## Prerequisites

1. User must exist in the `users` table
2. User must have completed onboarding (API credentials in `api_credentials` table)
3. For BUY orders: User should have `trading_preferences` configured
4. For SELL orders: User should have an active position

---

## Request Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `user_id` | string (UUID) | ✅ Yes | - | User ID from database |
| `symbol` | string | ✅ Yes | - | Stock symbol (e.g., "RELIANCE", "TCS") |
| `transaction_type` | string | ✅ Yes | - | "BUY" or "SELL" |
| `quantity` | number | ⚠️ Conditional | Auto-calculated | Required for SELL, optional for BUY |
| `price` | number | ❌ No | Auto-fetched | Stock price (uses LTP if not provided) |
| `order_reason` | string | ❌ No | "MANUAL_TRADE" | Reason for the trade |
| `exchange` | string | ❌ No | "NSE" | Exchange (NSE, BSE) |
| `calculate_position_size` | boolean | ❌ No | true | Auto-calculate quantity for BUY orders |

---

## Response Format

### Success Response (BUY Order)
```json
{
  "success": true,
  "message": "BUY order placed successfully",
  "data": {
    "user": {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
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
    "estimated_cost": 14055.00
  },
  "lemon_response": { ... },
  "timestamp": "2025-11-10T10:30:00.000Z"
}
```

### Success Response (SELL Order)
```json
{
  "success": true,
  "message": "SELL order placed successfully",
  "data": {
    "user": {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "client_id": "LEMON_CLIENT_ID"
    },
    "order": {
      "symbol": "RELIANCE",
      "transaction_type": "SELL",
      "quantity": 10,
      "price": 1410.00,
      "order_id": "LEMON_ORDER_ID",
      "order_status": "PLACED",
      "market_status": "OPEN",
      "is_amo": false,
      "execution_time": "Immediate"
    },
    "pnl": {
      "amount": 45.00,
      "percentage": 0.32
    },
    "estimated_proceeds": 14100.00,
    "position_updated": true
  },
  "lemon_response": { ... },
  "timestamp": "2025-11-10T10:35:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Description of what went wrong",
  "hint": "Optional helpful hint for fixing the issue"
}
```

---

## CURL Examples

### 1. BUY Order - Auto-Calculate Quantity (Recommended)

This is the simplest way to place a BUY order. The system will:
- Fetch the current market price (LTP)
- Calculate position size based on user's allocation settings
- Handle MTF margin requirements automatically

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "order_reason": "Entry signal from scanner"
  }'
```

**Example with real data:**
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "RELIANCE",
    "transaction_type": "BUY",
    "order_reason": "Manual entry based on analysis"
  }'
```

---

### 2. BUY Order - With Manual Quantity

Use this when you want to specify exactly how many shares to buy:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "TCS",
    "transaction_type": "BUY",
    "quantity": 5,
    "order_reason": "Buying 5 shares of TCS"
  }'
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "TCS",
    "transaction_type": "BUY",
    "quantity": 5,
    "calculate_position_size": false,
    "order_reason": "Fixed quantity purchase"
  }'
```

---

### 3. BUY Order - With Manual Price

Use this when market is closed or you want to specify a limit price:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "HDFCBANK",
    "transaction_type": "BUY",
    "quantity": 3,
    "price": 1600.50,
    "order_reason": "Limit order at specific price"
  }'
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "HDFCBANK",
    "transaction_type": "BUY",
    "quantity": 3,
    "price": 1600.50,
    "calculate_position_size": false,
    "order_reason": "Manual limit price order"
  }'
```

---

### 4. SELL Order - Exit Active Position (Recommended)

This will automatically sell all shares of the active position:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "order_reason": "Take profit at 3% gain"
  }'
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "order_reason": "Exit: Target reached"
  }'
```

---

### 5. SELL Order - Partial Exit (Manual Quantity)

Use this to sell only part of your position:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "TCS",
    "transaction_type": "SELL",
    "quantity": 2,
    "order_reason": "Partial profit booking"
  }'
```

**Note:** The current implementation uses `exitRealPosition` which exits the entire position. For partial exits, you'll need to modify the code or use the direct `placeOrder` method.

---

### 6. SELL Order - With Manual Price (AMO)

Useful for after-market orders:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_UUID_HERE",
    "symbol": "HDFCBANK",
    "transaction_type": "SELL",
    "price": 1610.00,
    "order_reason": "After market sell order"
  }'
```

---

## Testing Workflow

### Step 1: Get Your User ID

First, find your user ID from the database:

```bash
# Option 1: If you have direct database access
# Query the users table for your email

# Option 2: Login via API to get user info
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

### Step 2: Verify User Has Credentials

Check onboarding status:

```bash
curl -X GET http://localhost:3000/api/onboarding/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Step 3: Place a BUY Order

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID",
    "symbol": "RELIANCE",
    "transaction_type": "BUY"
  }'
```

### Step 4: Place a SELL Order

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID",
    "symbol": "RELIANCE",
    "transaction_type": "SELL",
    "order_reason": "Test exit"
  }'
```

---

## Production Usage

Replace `localhost:3000` with your production URL:

```bash
curl -X POST https://your-domain.vercel.app/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "RELIANCE",
    "transaction_type": "BUY"
  }'
```

---

## Common Error Scenarios

### 1. User Not Found
```json
{
  "success": false,
  "error": "User not found in database"
}
```
**Fix:** Verify the user_id exists in your `users` table.

---

### 2. No API Credentials
```json
{
  "success": false,
  "error": "User does not have API credentials configured. Please complete onboarding first.",
  "hint": "User needs to complete trading setup via /api/onboarding/trading-setup"
}
```
**Fix:** User needs to complete the onboarding flow to add their Lemon API credentials.

---

### 3. Cannot Calculate Position Size
```json
{
  "success": false,
  "error": "Unable to calculate position size for RELIANCE. Stock price may be too high for user's allocation.",
  "hint": "Provide quantity manually or adjust user trading preferences"
}
```
**Fix:** Either:
- Provide `quantity` manually
- Increase user's `allocation_percentage` in `trading_preferences` table
- Choose a lower-priced stock

---

### 4. No Active Position (SELL)
```json
{
  "success": false,
  "error": "No active position found for RELIANCE. Cannot determine quantity to sell.",
  "hint": "Provide quantity manually if you want to short sell"
}
```
**Fix:** Either:
- Verify there's an active position in `user_positions` table
- Provide `quantity` manually to short sell

---

### 5. Daily Loss Limit Reached
```json
{
  "success": false,
  "error": "User cannot place BUY order: Daily loss limit reached - trading stopped"
}
```
**Fix:** User has hit their daily loss limit. Trading will resume next day.

---

## Database Tables Used

This endpoint interacts with:

1. **`users`** - User account information
2. **`api_credentials`** - Lemon API keys (encrypted)
3. **`trading_preferences`** - Capital allocation and limits
4. **`user_positions`** - Active trading positions
5. **`real_orders`** - Order history
6. **`daily_trading_summary`** - Daily P&L tracking

---

## Security Notes

⚠️ **Important Security Considerations:**

1. This endpoint has **NO AUTHENTICATION** by default - anyone can place trades if they know the user_id
2. For production, you should:
   - Add JWT authentication
   - Implement API key authentication
   - Rate limiting
   - IP whitelisting
   - Audit logging

**Recommended:** Add authentication middleware similar to other endpoints:

```typescript
// Add this at the top of the POST function
const authHeader = request.headers.get('authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return NextResponse.json({
    success: false,
    error: 'Authorization required'
  }, { status: 401 });
}

const token = authHeader.substring(7);
const auth = verifyToken(token);
if (!auth) {
  return NextResponse.json({
    success: false,
    error: 'Invalid token'
  }, { status: 401 });
}
```

---

## Advanced Usage

### Batch Trading (Multiple Stocks)

You can create a script to place multiple orders:

```bash
#!/bin/bash

USER_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
STOCKS=("RELIANCE" "TCS" "HDFCBANK" "INFY" "ICICIBANK")

for stock in "${STOCKS[@]}"; do
  echo "Placing order for $stock..."
  curl -X POST http://localhost:3000/api/trading/manual-trade \
    -H "Content-Type: application/json" \
    -d "{
      \"user_id\": \"$USER_ID\",
      \"symbol\": \"$stock\",
      \"transaction_type\": \"BUY\",
      \"order_reason\": \"Batch entry\"
    }"
  echo ""
  sleep 2  # Wait 2 seconds between orders
done
```

---

### Integration with Trading Bots

```python
import requests
import json

def place_trade(user_id, symbol, transaction_type, quantity=None):
    url = "http://localhost:3000/api/trading/manual-trade"
    
    payload = {
        "user_id": user_id,
        "symbol": symbol,
        "transaction_type": transaction_type,
        "order_reason": "Automated bot trade"
    }
    
    if quantity:
        payload["quantity"] = quantity
    
    response = requests.post(url, json=payload)
    return response.json()

# Usage
result = place_trade(
    user_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    symbol="RELIANCE",
    transaction_type="BUY"
)

print(json.dumps(result, indent=2))
```

---

## Monitoring & Logging

All trades are logged to console with emoji indicators:
- 🔄 Request received
- ✅ Success
- ❌ Error
- 📊 Data fetching
- 🛒 BUY order
- 📤 SELL order
- 💰 Position calculations

Check your server logs for detailed trade execution flow.

---

## Support & Troubleshooting

1. **Check user's onboarding status first**
2. **Verify API credentials are active**
3. **Check if market is open (otherwise AMO orders are placed)**
4. **Review user's trading preferences (capital, limits)**
5. **Check user_positions table for active positions**

For more details, see the comprehensive guide: `LEMONN_TRADING_COMPLETE_SETUP_GUIDE.md`

---

## Quick Reference Card

```bash
# Simplest BUY (auto-everything)
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"BUY"}'

# Simplest SELL (exit position)
curl -X POST localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"SELL"}'
```

Replace `UUID` with your actual user_id from the database.

---

**Last Updated:** November 10, 2025  
**API Version:** 1.0  
**Endpoint:** `/api/trading/manual-trade`

