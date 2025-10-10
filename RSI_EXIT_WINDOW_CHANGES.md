# 🕒 RSI Exit Window Implementation

**Date:** October 10, 2025  
**Purpose:** Prevent RSI reversal exits during high volatility periods (market open hours)

---

## 📋 Changes Summary

### ✅ **What Was Changed**

Modified: `src/services/exitMonitoringService.ts` (Lines 217-256)

**New Behavior:**
- RSI reversal exits now **only trigger during specific time windows**
- Stop loss (2.5%) remains **always active** (unchanged)
- Trailing stops remain **always active** (unchanged)
- 1-hour entry protection remains **active for all exit types** (unchanged)

---

## ⏰ RSI Exit Time Windows (IST)

RSI reversal exits are **ONLY allowed** during:

| Window | Time (IST) | Duration | Purpose |
|--------|-----------|----------|---------|
| **Window 1** | 11:00 AM - 11:10 AM | 10 minutes | Mid-morning stability check |
| **Window 2** | 2:00 PM - 2:10 PM | 10 minutes | Post-lunch stability check |

**Total RSI Exit Opportunities:** 20 minutes per day (5.3% of trading time)

---

## 🔄 Exit Logic Flow (Updated)

### **Every 5 Minutes During Market Hours (9:15 AM - 3:30 PM IST):**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Position Entry Time Check (Always)                       │
│    ↓ Has it been 1 hour since entry?                        │
│    ↓ NO → Skip ALL exits (RSI, Stop Loss, Trailing)        │
│    ↓ YES → Continue to exit checks                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. RSI Reversal Check (Time-Gated) 🆕                       │
│    ↓ Is RSI < RSI SMA (reversal)?                          │
│    ↓ YES → Check IST time                                   │
│    ↓   ├─ 11:00-11:10 AM? → ✅ EXIT                        │
│    ↓   ├─ 2:00-2:10 PM? → ✅ EXIT                          │
│    ↓   └─ Other times? → ⏸️ Skip, continue to next check   │
│    ↓ NO → Continue to next check                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Stop Loss Check (Always Active) ✅                        │
│    ↓ Is P&L ≤ -2.5%?                                        │
│    ↓ YES → ⛔ EXIT IMMEDIATELY                              │
│    ↓ NO → Continue to next check                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Trailing Stop Check (Always Active) ✅                    │
│    ↓ Did price drop below trailing level?                   │
│    ↓ YES → 🎯 EXIT (Lock Profit)                           │
│    ↓ NO → Continue to hold position                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Example Scenarios

### **Scenario 1: RSI Reversal at 9:30 AM**
- **Event:** RSI crosses below RSI SMA at 9:30 AM
- **Action:** ⏸️ **Skip RSI exit** (outside window)
- **Log:** `⏸️ RSI reversal detected but outside exit windows (9:30 IST) - Skipping RSI exit`
- **Next:** Check stop loss and trailing stops
- **Result:** Position continues if no stop loss hit

### **Scenario 2: RSI Reversal at 11:05 AM**
- **Event:** RSI crosses below RSI SMA at 11:05 AM
- **Action:** ✅ **Allow RSI exit** (inside Window 1)
- **Log:** `✅ RSI reversal detected during exit window (11:05 IST) - Allowing exit`
- **Result:** Position exited immediately

### **Scenario 3: RSI Reversal at 2:07 PM**
- **Event:** RSI crosses below RSI SMA at 2:07 PM (14:07)
- **Action:** ✅ **Allow RSI exit** (inside Window 2)
- **Log:** `✅ RSI reversal detected during exit window (14:07 IST) - Allowing exit`
- **Result:** Position exited immediately

### **Scenario 4: Stop Loss Hit at 10:00 AM**
- **Event:** Position drops -2.6% at 10:00 AM
- **Action:** ⛔ **Exit immediately** (stop loss always active)
- **Result:** Position exited with -2.6% loss

### **Scenario 5: RSI Reversal + Stop Loss at 9:45 AM**
- **Event:** RSI reversal AND -2.7% loss at 9:45 AM
- **RSI Check:** ⏸️ Skipped (outside window)
- **Stop Loss Check:** ⛔ Triggered (-2.7%)
- **Action:** Exit due to stop loss
- **Result:** Position protected from further loss

### **Scenario 6: Position Entered at 10:30 AM, RSI Reversal at 11:05 AM**
- **Event:** RSI reversal at 11:05 AM (35 minutes after entry)
- **1-Hour Check:** ⏸️ **Blocked** (only 35 minutes since entry)
- **Action:** No exit allowed yet
- **Result:** Position continues (1-hour protection)

---

## 📊 Impact Analysis

### **Before Changes:**
- RSI exits could trigger **anytime** during market hours
- High probability of exits during volatile opening hours (9:15-10:00 AM)
- Potentially missing recovery moves in early volatility

### **After Changes:**
- RSI exits **only during calm periods** (11:00-11:10 AM, 2:00-2:10 PM)
- Stop loss **still protects** during volatile hours
- Better chance to ride out early volatility and catch trends

### **Expected Outcomes:**
- ✅ Fewer premature exits during morning volatility
- ✅ Better capture of intraday trends
- ✅ Protection remains through stop loss
- ✅ Trailing stops still lock profits anytime
- ⚠️ Potential risk: Position may decline between RSI detection and exit window (mitigated by stop loss)

---

## 🔧 Technical Implementation

### **Code Location:**
`src/services/exitMonitoringService.ts` → `analyzePositionForExit()` method

### **Time Zone:**
- Uses **IST (Asia/Kolkata)** consistently throughout
- Confirmed: `new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))`

### **Window Logic:**
```typescript
const isWindow1 = (hour === 11 && minute >= 0 && minute <= 10);
const isWindow2 = (hour === 14 && minute >= 0 && minute <= 10);
const isInRSIExitWindow = isWindow1 || isWindow2;
```

### **Logging:**
- ✅ RSI exit allowed: `✅ RSI reversal detected during exit window (HH:MM IST) - Allowing exit`
- ⏸️ RSI exit skipped: `⏸️ RSI reversal detected but outside exit windows (HH:MM IST) - Skipping RSI exit`

---

## ⚙️ Configuration

### **Current Settings:**
| Parameter | Value | Status |
|-----------|-------|--------|
| RSI Window 1 | 11:00-11:10 AM IST | ✅ Active |
| RSI Window 2 | 2:00-2:10 PM IST | ✅ Active |
| Stop Loss % | 2.5% (default) | ✅ Always Active |
| 1-Hour Entry Protection | Yes | ✅ Active for ALL exits |
| Trailing Stops | 15 levels (1.5% to 30%) | ✅ Always Active |
| Monitoring Frequency | Every 5 minutes | ✅ Market hours only |

### **Adjustable Parameters:**
If you need to adjust windows in the future, modify these lines in `exitMonitoringService.ts`:
```typescript
// Line 228-229
const isWindow1 = (hour === 11 && minute >= 0 && minute <= 10);
const isWindow2 = (hour === 14 && minute >= 0 && minute <= 10);
```

---

## 🧪 Testing Recommendations

### **Test Cases to Verify:**

1. **Test RSI Exit During Window 1:**
   - Time: 11:05 AM
   - Setup: Create position with RSI < RSI SMA
   - Expected: Exit executed ✅

2. **Test RSI Exit During Window 2:**
   - Time: 2:05 PM
   - Setup: Create position with RSI < RSI SMA
   - Expected: Exit executed ✅

3. **Test RSI Exit Outside Windows:**
   - Time: 9:30 AM or 12:00 PM
   - Setup: Create position with RSI < RSI SMA
   - Expected: Exit skipped, position continues ⏸️

4. **Test Stop Loss Always Active:**
   - Time: Any time (e.g., 9:30 AM)
   - Setup: Position at -2.6% loss
   - Expected: Exit immediately regardless of time ⛔

5. **Test 1-Hour Protection:**
   - Time: 11:05 AM (in RSI window)
   - Setup: Position entered at 10:30 AM, RSI < RSI SMA
   - Expected: Exit blocked (< 1 hour) ⏸️

6. **Test Trailing Stop Always Active:**
   - Time: Any time
   - Setup: Position at profit level with trailing stop breach
   - Expected: Exit immediately 🎯

---

## 📝 Monitoring & Logs

### **What to Watch:**
- Check logs for: `⏸️ RSI reversal detected but outside exit windows`
  - This means RSI wanted to exit but was blocked by time window
  - Verify position didn't hit stop loss later

- Check logs for: `✅ RSI reversal detected during exit window`
  - This means RSI exit was allowed
  - Confirm exit order was placed successfully

### **Key Metrics to Track:**
- **RSI Exits Blocked:** Count of positions where RSI wanted to exit outside windows
- **Recovery Rate:** % of blocked RSI exits that recovered and became profitable
- **Stop Loss Hit Rate:** % of blocked RSI exits that eventually hit stop loss
- **Window Utilization:** % of RSI exits actually happening during windows vs. outside

---

## 🚀 Deployment

### **Files Changed:**
- ✅ `src/services/exitMonitoringService.ts` (Modified)

### **No Changes Needed:**
- `src/app/api/cron/monitor-positions/route.ts` (Unchanged)
- Database schema (Unchanged)
- API endpoints (Unchanged)

### **Deployment Steps:**
1. Code is already updated ✅
2. No database migrations required ✅
3. No environment variable changes ✅
4. Deploy to production
5. Monitor logs during first day for any issues
6. Verify exits happening correctly during windows

---

## ⚠️ Important Notes

1. **Stop Loss is Your Safety Net:**
   - Even if RSI exit is blocked, stop loss will trigger at -2.5%
   - This prevents catastrophic losses during blocked periods

2. **Trailing Stops Still Work:**
   - Profits are protected by trailing stops at any time
   - RSI window restriction does NOT affect profit locking

3. **1-Hour Protection Priority:**
   - First hour protection overrides everything
   - Even if 11:05 AM, if position entered at 10:30 AM, no exit allowed

4. **Window Coverage:**
   - 20 minutes/day for RSI exits
   - If RSI reversal happens at 11:11 AM, must wait until 2:00 PM for next window
   - Stop loss provides protection during the wait

---

**Implementation Status:** ✅ **COMPLETE**  
**Ready for Deployment:** ✅ **YES**  
**Testing Required:** ⚠️ **Recommended before production**

---

*Document Version: 1.0*  
*Last Updated: October 10, 2025*

