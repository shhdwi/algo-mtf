# Supabase Migrations

This directory contains database migrations for the Algo-MTF trading system.

## Available Migrations

### 1. `create_entry_conditions_table.sql`

**Status:** Ready to apply  
**Date:** 2025-11-17  
**Purpose:** Create `entry_conditions` table to store technical indicators at entry time

**What it does:**
- Creates `entry_conditions` table with RSI, MACD, EMA values
- Links to `algorithm_positions` (1:1 relationship)
- Adds RLS policies for security
- Creates indexes for performance

**How to apply:**

#### Option A: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the entire contents of `create_entry_conditions_table.sql`
4. Paste and execute

#### Option B: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push --file supabase_migrations/create_entry_conditions_table.sql
```

#### Option C: Direct SQL
```bash
# Using psql
psql -h <your-db-host> -U postgres -d postgres -f create_entry_conditions_table.sql
```

**Verify migration:**
```sql
-- Check table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'entry_conditions'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'entry_conditions';

-- Test insert (will fail if table doesn't exist)
SELECT COUNT(*) FROM entry_conditions;
```

## Migration History

| Date | Migration | Status | Notes |
|------|-----------|--------|-------|
| 2025-11-17 | `create_entry_conditions_table.sql` | ✅ Ready | Entry indicators tracking |

## Important Notes

1. **Do NOT run migrations multiple times** - All migrations use `IF NOT EXISTS` to be idempotent
2. **Always test in development first** before applying to production
3. **Back up your database** before running migrations
4. **Check for dependencies** - Some migrations may require others to be run first

## Support

For issues or questions about migrations:
- Check `ENTRY_CONDITIONS_GUIDE.md` for usage examples
- Review `ENTRY_CONDITIONS_IMPLEMENTATION_SUMMARY.md` for architecture
- See `LEMONN_TRADING_COMPLETE_SETUP_GUIDE.md` for full schema

## Rollback

If you need to rollback the `entry_conditions` table:

```sql
-- WARNING: This will delete all entry condition data
DROP TABLE IF EXISTS entry_conditions CASCADE;
```

**Note:** The `CASCADE` will remove any foreign key constraints but will NOT affect `algorithm_positions` or `user_positions` tables.

