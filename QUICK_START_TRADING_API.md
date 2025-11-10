# 🚀 Quick Start - Manual Trading API

## Your New API Endpoint is Ready!

**Endpoint:** `POST /api/trading/manual-trade`

---

## 🎯 What You Can Do

1. **Place BUY orders** for any user in your database
2. **Place SELL orders** to exit positions  
3. **Auto-calculate quantities** based on user's capital allocation
4. **Auto-fetch stock prices** using LTP
5. **Handle MTF (Margin Trading)** automatically
6. **Support AMO (After Market Orders)** when market is closed

---

## 📝 Quick Test (Copy & Paste)

### Step 1: Get Your User ID

Query your database to get a user_id, or use this to find users:

```sql
SELECT id, full_name, email FROM users WHERE is_active = true LIMIT 5;
```

### Step 2: Test Connectivity

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response: `"error": "user_id is required"` ✅ (This means API is working!)

---

## 🛒 BUY Orders - CURL Commands

### Simplest BUY Order (Recommended)
Auto-calculates everything based on user's settings:

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "PUT_YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "BUY"
  }'
```

### BUY with Specific Quantity

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "PUT_YOUR_USER_UUID_HERE",
    "symbol": "TCS",
    "transaction_type": "BUY",
    "quantity": 5,
    "calculate_position_size": false
  }'
```

### BUY with Manual Price (for closed market)

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "PUT_YOUR_USER_UUID_HERE",
    "symbol": "HDFCBANK",
    "transaction_type": "BUY",
    "quantity": 3,
    "price": 1600.00
  }'
```

---

## 📤 SELL Orders - CURL Commands

### Simplest SELL Order (Exit Position)

```bash
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "PUT_YOUR_USER_UUID_HERE",
    "symbol": "RELIANCE",
    "transaction_type": "SELL"
  }'
```

This will:
- Find the active position for RELIANCE
- Sell all shares
- Calculate P&L automatically
- Update position status to EXITED

---

## 🔧 Using the Test Script

We've included a convenient bash script for testing:

### Test Connection
```bash
./test-manual-trade.sh test
```

### Place BUY Order
```bash
# Auto-calculate quantity
./test-manual-trade.sh buy YOUR_USER_ID RELIANCE

# Specific quantity
./test-manual-trade.sh buy YOUR_USER_ID TCS 5
```

### Place SELL Order
```bash
./test-manual-trade.sh sell YOUR_USER_ID RELIANCE
```

### Use with Production
```bash
API_URL=https://your-domain.vercel.app ./test-manual-trade.sh buy USER_ID RELIANCE
```

---

## 📊 Understanding the Response

### Success (BUY)
```json
{
  "success": true,
  "message": "BUY order placed successfully",
  "data": {
    "user": {
      "id": "...",
      "name": "John Doe",
      "client_id": "LEMON123"
    },
    "order": {
      "symbol": "RELIANCE",
      "quantity": 10,
      "price": 1405.50,
      "order_id": "LMN_ORDER_12345",
      "order_status": "PLACED"
    },
    "estimated_cost": 14055.00
  }
}
```

### Success (SELL)
```json
{
  "success": true,
  "message": "SELL order placed successfully",
  "data": {
    "order": { ... },
    "pnl": {
      "amount": 45.00,
      "percentage": 0.32
    }
  }
}
```

---

## ⚠️ Prerequisites Checklist

Before testing, make sure:

- [ ] User exists in `users` table
- [ ] User has completed onboarding (has `api_credentials`)
- [ ] User has `trading_preferences` set up
- [ ] For SELL: User has an active position
- [ ] Your server is running (`npm run dev`)

---

## 🔍 How to Get Your User ID

### Option 1: Direct Database Query
```sql
SELECT id, full_name, email, is_active 
FROM users 
WHERE email = 'your-email@example.com';
```

### Option 2: Via Login API
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

The response will include user information.

### Option 3: Check Onboarding Status
```bash
curl -X GET http://localhost:3000/api/onboarding/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🎓 Example Real-World Usage

### Scenario 1: Morning Market Entry
```bash
# Place BUY orders for 3 stocks at market open
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"BUY"}'

curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"TCS","transaction_type":"BUY"}'

curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"HDFCBANK","transaction_type":"BUY"}'
```

### Scenario 2: Exit All Positions
```bash
# Sell all active positions (run for each position)
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"RELIANCE","transaction_type":"SELL"}'

curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d '{"user_id":"UUID","symbol":"TCS","transaction_type":"SELL"}'
```

---

## 🐛 Troubleshooting

### Error: "User not found"
- Check that the user_id is correct (it's a UUID)
- Verify user exists: `SELECT * FROM users WHERE id = 'your-uuid'`

### Error: "No API credentials"
- User needs to complete onboarding first
- Check: `SELECT * FROM api_credentials WHERE user_id = 'your-uuid'`

### Error: "Unable to calculate position size"
- Stock price is too high for user's allocation
- Solution: Provide quantity manually OR increase allocation_percentage

### Error: "No active position found" (SELL)
- Check: `SELECT * FROM user_positions WHERE user_id = 'UUID' AND status = 'ACTIVE'`
- You can only SELL positions that were bought first

---

## 🔐 Important Security Note

⚠️ **This endpoint has NO authentication by default!**

For production, you should add:
- JWT token authentication
- API key validation
- Rate limiting
- IP whitelisting
- Audit logging

See `MANUAL_TRADING_API_GUIDE.md` for security implementation details.

---

## 📚 Full Documentation

For comprehensive documentation, see:
- **`MANUAL_TRADING_API_GUIDE.md`** - Complete API reference
- **`LEMONN_TRADING_COMPLETE_SETUP_GUIDE.md`** - System architecture

---

## 🚀 Your First Trade in 3 Steps

```bash
# 1. Get your user ID (replace with your actual UUID)
USER_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# 2. Buy RELIANCE (auto-calculated quantity)
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"RELIANCE\",
    \"transaction_type\": \"BUY\"
  }"

# 3. Sell RELIANCE (exit position)
curl -X POST http://localhost:3000/api/trading/manual-trade \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"symbol\": \"RELIANCE\",
    \"transaction_type\": \"SELL\"
  }"
```

---

**Ready to trade!** 🎯

Start with the test connection, then place your first BUY order.

For questions or issues, check the full guide: `MANUAL_TRADING_API_GUIDE.md`

