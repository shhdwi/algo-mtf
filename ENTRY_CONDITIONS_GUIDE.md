# Entry Conditions Storage Guide

## Overview

Entry conditions (RSI, MACD, EMA values, etc.) are stored **ONCE** per trade signal in the `entry_conditions` table, linked to `algorithm_positions`. 

Users do NOT have duplicate entry condition records. Instead, they access entry conditions through their `algorithm_position_id` reference in the `user_positions` table.

## Database Schema

```
algorithm_positions (1) ←→ (1) entry_conditions
        ↑
        |
        | (via algorithm_position_id)
        |
user_positions (many)
```

### Relationship Explanation:

1. **Algorithm Position**: Created once per trade signal (e.g., "BUY RELIANCE at ₹2,500")
2. **Entry Conditions**: Created once, linked to algorithm position (stores RSI, MACD, etc.)
3. **User Positions**: Multiple users can trade the same signal, all linking to the same algorithm position

## Tables

### `algorithm_positions`
- **Purpose**: Master record of each trade signal (source of truth)
- **Cardinality**: One per symbol per entry signal
- **Key Fields**: `id`, `symbol`, `entry_price`, `entry_time`, `status`, `trailing_level`

### `entry_conditions`
- **Purpose**: Technical indicators and conditions at entry time
- **Cardinality**: One per algorithm position (1:1 relationship)
- **Key Fields**: 
  - Boolean Flags: `above_ema`, `rsi_in_range`, `rsi_above_sma`, `macd_bullish`, `histogram_ok`, `resistance_ok`
  - Indicator Values: `ema50_value`, `rsi14_value`, `rsi_sma14_value`, `macd_value`, `histogram_value`, etc.
  - S/R Data: `nearest_support`, `nearest_resistance`, `resistance_distance_percent`

### `user_positions`
- **Purpose**: Individual user trades
- **Cardinality**: Many per algorithm position
- **Key Fields**: `user_id`, `algorithm_position_id`, `entry_price`, `entry_quantity`, `pnl_amount`

## SQL Queries

### 1. Get Entry Conditions for a Specific User Position

```sql
-- Get entry conditions for a user's position
SELECT 
  up.symbol,
  up.entry_price,
  up.entry_quantity,
  up.pnl_percentage,
  -- Entry conditions
  ec.rsi14_value,
  ec.ema50_value,
  ec.macd_value,
  ec.histogram_count,
  ec.nearest_resistance,
  ec.resistance_distance_percent,
  -- Boolean flags
  ec.above_ema,
  ec.rsi_in_range,
  ec.macd_bullish
FROM user_positions up
JOIN algorithm_positions ap ON up.algorithm_position_id = ap.id
JOIN entry_conditions ec ON ap.id = ec.position_id
WHERE up.user_id = 'USER_UUID_HERE'
  AND up.symbol = 'RELIANCE';
```

### 2. Get All Active Positions with Entry Conditions

```sql
-- Get all active user positions with their entry conditions
SELECT 
  up.user_id,
  up.symbol,
  up.entry_price,
  up.current_price,
  up.pnl_percentage,
  up.trailing_level,
  up.status,
  -- Entry indicators
  ec.rsi14_value AS entry_rsi,
  ec.ema50_value AS entry_ema50,
  ec.macd_value AS entry_macd,
  ec.histogram_count AS entry_histogram_count,
  ec.nearest_resistance AS resistance_at_entry,
  -- Entry time
  ap.entry_time
FROM user_positions up
JOIN algorithm_positions ap ON up.algorithm_position_id = ap.id
LEFT JOIN entry_conditions ec ON ap.id = ec.position_id
WHERE up.status = 'ACTIVE'
ORDER BY up.entry_time DESC;
```

### 3. Analyze Entry Conditions vs Exit Performance

```sql
-- Compare entry RSI with exit performance (for exited positions)
SELECT 
  up.symbol,
  ec.rsi14_value AS entry_rsi,
  ec.macd_value AS entry_macd,
  ec.histogram_count,
  up.pnl_percentage,
  up.exit_reason,
  EXTRACT(EPOCH FROM (up.exit_time - ap.entry_time))/3600 AS holding_hours
FROM user_positions up
JOIN algorithm_positions ap ON up.algorithm_position_id = ap.id
JOIN entry_conditions ec ON ap.id = ec.position_id
WHERE up.status = 'EXITED'
ORDER BY up.pnl_percentage DESC
LIMIT 50;
```

### 4. Find Best RSI Entry Ranges

```sql
-- Analyze which RSI entry ranges perform best
SELECT 
  CASE 
    WHEN ec.rsi14_value BETWEEN 50 AND 55 THEN '50-55'
    WHEN ec.rsi14_value BETWEEN 55 AND 60 THEN '55-60'
    WHEN ec.rsi14_value BETWEEN 60 AND 65 THEN '60-65'
    WHEN ec.rsi14_value BETWEEN 65 AND 70 THEN '65-70'
    ELSE 'Other'
  END AS rsi_range,
  COUNT(*) AS trade_count,
  AVG(up.pnl_percentage) AS avg_pnl,
  AVG(EXTRACT(EPOCH FROM (COALESCE(up.exit_time, NOW()) - ap.entry_time))/3600) AS avg_holding_hours,
  SUM(CASE WHEN up.pnl_percentage > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 AS win_rate
FROM user_positions up
JOIN algorithm_positions ap ON up.algorithm_position_id = ap.id
JOIN entry_conditions ec ON ap.id = ec.position_id
WHERE up.status IN ('EXITED', 'ACTIVE')
GROUP BY 1
ORDER BY avg_pnl DESC;
```

### 5. Get Entry Conditions for Performance Analysis (TypeScript)

```typescript
// In your service or API route
async function getPositionWithEntryConditions(userId: string, symbol: string) {
  const { data, error } = await supabase
    .from('user_positions')
    .select(`
      *,
      algorithm_position:algorithm_positions!algorithm_position_id (
        *,
        entry_conditions (*)
      )
    `)
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('status', 'ACTIVE')
    .single();

  if (error) throw error;

  return {
    ...data,
    entryRSI: data.algorithm_position.entry_conditions[0]?.rsi14_value,
    entryEMA50: data.algorithm_position.entry_conditions[0]?.ema50_value,
    entryMACD: data.algorithm_position.entry_conditions[0]?.macd_value,
    histogramCount: data.algorithm_position.entry_conditions[0]?.histogram_count,
    resistanceDistance: data.algorithm_position.entry_conditions[0]?.resistance_distance_percent
  };
}
```

## Benefits of This Design

### 1. **Storage Efficiency**
- ✅ Entry conditions stored only ONCE per signal (not per user)
- ✅ If 100 users trade the same signal, entry conditions are stored once, not 100 times
- ✅ Reduces database size and improves query performance

### 2. **Data Consistency**
- ✅ All users see the same entry conditions (because they reference the same record)
- ✅ No risk of conflicting RSI values for the same signal
- ✅ Single source of truth for entry analysis

### 3. **Easy Analysis**
- ✅ Simple JOIN to get entry conditions for any user position
- ✅ Can analyze which entry conditions lead to best results
- ✅ Performance tracking across all users for same signal

### 4. **Separation of Concerns**
- ✅ `algorithm_positions` = Signal tracking (what to trade)
- ✅ `entry_conditions` = Why we traded (technical analysis)
- ✅ `user_positions` = Who traded and their results

## Migration Instructions

To apply the migration:

1. **Via Supabase Dashboard:**
   ```
   - Go to SQL Editor in Supabase Dashboard
   - Copy contents of supabase_migrations/create_entry_conditions_table.sql
   - Execute the SQL
   ```

2. **Via Supabase CLI:**
   ```bash
   supabase db push --file supabase_migrations/create_entry_conditions_table.sql
   ```

3. **Verify Table Creation:**
   ```sql
   SELECT * FROM entry_conditions LIMIT 1;
   ```

## Example Entry Conditions Record

```json
{
  "id": "uuid-here",
  "position_id": "algorithm-position-uuid",
  "above_ema": true,
  "rsi_in_range": true,
  "rsi_above_sma": true,
  "macd_bullish": true,
  "histogram_ok": true,
  "resistance_ok": true,
  "ema50_value": 2450.50,
  "rsi14_value": 62.5,
  "rsi_sma14_value": 58.3,
  "macd_value": 15.2,
  "macd_signal_value": 12.8,
  "histogram_value": 2.4,
  "histogram_count": 2,
  "nearest_support": 2400.0,
  "nearest_resistance": 2550.0,
  "resistance_distance_percent": 2.1,
  "created_at": "2025-11-17T09:30:00Z"
}
```

## Code Implementation

The entry conditions are automatically saved when an algorithm position is created:

```typescript
// In positionManagerService.ts
async addNewPosition(entrySignal: UltimateScanResult): Promise<string | null> {
  // 1. Create algorithm position
  const { data } = await this.supabase
    .from('algorithm_positions')
    .insert({ /* position data */ })
    .select('id')
    .single();
  
  const positionId = data?.id;
  
  // 2. Save entry conditions (ONCE)
  if (positionId && entrySignal.conditions && entrySignal.indicators) {
    await this.addEntryConditions(positionId, entrySignal);
  }
  
  return positionId;
}
```

When users trade, they link to the algorithm position:

```typescript
// In daily-scan/route.ts
await supabase
  .from('user_positions')
  .insert({
    user_id: userId,
    symbol: signal.symbol,
    algorithm_position_id: algoPosition.id, // 👈 Links to entry conditions
    entry_price: signal.current_price,
    entry_quantity: positionSize.quantity,
    // ... other user-specific fields
  });
```

## Summary

- ✅ Entry conditions saved ONCE per trade signal
- ✅ Users access via `algorithm_position_id` → `entry_conditions`
- ✅ Efficient storage, consistent data, easy analysis
- ✅ No duplication, single source of truth

