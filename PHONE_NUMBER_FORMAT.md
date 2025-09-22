# 📱 Phone Number Format Standards

## ✅ **Standardized Format**
All phone numbers in the system use the format: `+91XXXXXXXXXX`

### **Examples:**
- ✅ **Correct**: `+917977814522`
- ✅ **Correct**: `+919016333873`
- ❌ **Incorrect**: `7977814522` (missing +91)
- ❌ **Incorrect**: `917977814522` (missing +)
- ❌ **Incorrect**: `+91 79778 14522` (spaces not allowed in database)

## 📊 **Database Storage**
- **Table**: `users`
- **Column**: `phone_number`
- **Format**: `+91XXXXXXXXXX` (no spaces, no dashes)
- **Length**: 13 characters total

## 🔧 **Implementation Details**

### **User Registration**
```typescript
// Input: User enters "7977814522" or "+917977814522"
// Processing: Clean and validate
const cleanPhone = phone.replace(/^\+91/, '').replace(/\D/g, '');
if (cleanPhone.length === 10) {
  const formattedPhone = `+91${cleanPhone}`;
  // Store: "+917977814522"
}
```

### **WhatsApp API**
```typescript
// Direct usage - no formatting needed
await whatsappService.sendMessage({
  phoneNumber: user.phone_number, // Already in +91XXXXXXXXXX format
  message1: "Hello!"
});
```

### **Display Format**
For UI display, you can format as: `+91 XXXXX XXXXX`
```typescript
const displayPhone = phone.replace(/(\+91)(\d{5})(\d{5})/, '$1 $2 $3');
// Result: "+91 79778 14522"
```

## 🚨 **Migration Completed**
- ✅ Updated all existing phone numbers to `+91XXXXXXXXXX` format
- ✅ Removed hardcoded phone numbers from services
- ✅ WhatsApp notifications now sent to eligible users only
- ✅ All services use database phone numbers

## 🎯 **Services Updated**
1. **ExitMonitoringService** - Uses eligible users from database
2. **UltimateScannerService** - Uses eligible users from database  
3. **Real Trading Execution** - Uses user phone from database
4. **User Registration** - Validates and formats phone numbers

## 📋 **Eligible Users Criteria**
WhatsApp notifications are sent to users who meet:
- ✅ `users.is_active = true`
- ✅ `trading_preferences.is_real_trading_enabled = true`
- ✅ Has valid phone number in database

## 🔍 **Verification Query**
```sql
SELECT 
  u.full_name,
  u.phone_number,
  tp.is_real_trading_enabled
FROM users u
JOIN trading_preferences tp ON u.id = tp.user_id
WHERE u.is_active = true 
  AND tp.is_real_trading_enabled = true;
```
