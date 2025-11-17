-- ============================================
-- MIGRATION: Create entry_conditions table
-- Date: 2025-11-17
-- Description: Store technical indicator values and entry conditions
--              Linked to algorithm_positions (one entry_condition per position)
--              Users access via algorithm_position_id in user_positions
-- ============================================

-- Create entry_conditions table
CREATE TABLE IF NOT EXISTS entry_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES algorithm_positions(id) ON DELETE CASCADE,
  
  -- Entry condition flags (boolean checks)
  above_ema BOOLEAN NOT NULL,
  rsi_in_range BOOLEAN NOT NULL,
  rsi_above_sma BOOLEAN NOT NULL,
  macd_bullish BOOLEAN NOT NULL,
  histogram_ok BOOLEAN NOT NULL,
  resistance_ok BOOLEAN NOT NULL,
  
  -- Technical indicator values at entry
  ema50_value NUMERIC NOT NULL,
  rsi14_value NUMERIC NOT NULL,
  rsi_sma14_value NUMERIC NOT NULL,
  macd_value NUMERIC NOT NULL,
  macd_signal_value NUMERIC NOT NULL,
  histogram_value NUMERIC NOT NULL,
  histogram_count INTEGER DEFAULT 0,
  
  -- Support/Resistance data (optional)
  nearest_support NUMERIC,
  nearest_resistance NUMERIC,
  resistance_distance_percent NUMERIC,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index to ensure one entry_condition per algorithm_position
CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_conditions_position_unique 
  ON entry_conditions(position_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_entry_conditions_position 
  ON entry_conditions(position_id);

-- Add RLS policies (Row Level Security)
ALTER TABLE entry_conditions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to authenticated users
CREATE POLICY "Allow read access to entry_conditions" 
  ON entry_conditions FOR SELECT 
  TO authenticated 
  USING (true);

-- Policy: Allow insert/update for service role only
CREATE POLICY "Allow insert/update for service role" 
  ON entry_conditions FOR ALL 
  TO service_role 
  USING (true);

-- Add comment to table
COMMENT ON TABLE entry_conditions IS 'Stores technical indicator values and entry conditions at the time of trade entry. Linked to algorithm_positions (source of truth). Users access via algorithm_position_id in user_positions table.';

-- Add column comments
COMMENT ON COLUMN entry_conditions.position_id IS 'Foreign key to algorithm_positions.id';
COMMENT ON COLUMN entry_conditions.above_ema IS 'Price was above EMA50 at entry';
COMMENT ON COLUMN entry_conditions.rsi_in_range IS 'RSI was in 50-65 range at entry';
COMMENT ON COLUMN entry_conditions.rsi_above_sma IS 'RSI was above its SMA at entry';
COMMENT ON COLUMN entry_conditions.macd_bullish IS 'MACD line was above signal line at entry';
COMMENT ON COLUMN entry_conditions.histogram_ok IS 'Histogram count was <= 3 at entry';
COMMENT ON COLUMN entry_conditions.resistance_ok IS 'Price was far enough from resistance at entry';
COMMENT ON COLUMN entry_conditions.ema50_value IS 'EMA50 value at entry time';
COMMENT ON COLUMN entry_conditions.rsi14_value IS 'RSI(14) value at entry time';
COMMENT ON COLUMN entry_conditions.rsi_sma14_value IS 'SMA(14) of RSI value at entry time';
COMMENT ON COLUMN entry_conditions.macd_value IS 'MACD line value at entry time';
COMMENT ON COLUMN entry_conditions.macd_signal_value IS 'MACD signal line value at entry time';
COMMENT ON COLUMN entry_conditions.histogram_value IS 'MACD histogram value at entry time';
COMMENT ON COLUMN entry_conditions.histogram_count IS 'Number of consecutive positive histogram bars at entry';
COMMENT ON COLUMN entry_conditions.nearest_support IS 'Nearest support level at entry (optional)';
COMMENT ON COLUMN entry_conditions.nearest_resistance IS 'Nearest resistance level at entry (optional)';
COMMENT ON COLUMN entry_conditions.resistance_distance_percent IS 'Distance to resistance as percentage at entry (optional)';

