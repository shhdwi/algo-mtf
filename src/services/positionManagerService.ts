import { UltimateScanResult } from './ultimateScannerService';
import { createClient } from '@supabase/supabase-js';

export interface Position {
  id: string;
  symbol: string;
  entry_date: string;
  entry_time: string;
  entry_price: number;
  current_price: number;
  pnl_amount: number;
  pnl_percentage: number;
  status: 'ACTIVE' | 'EXITED' | 'STOPPED';
  trailing_level?: number; // Current trailing stop level (0 = no level reached)
  exit_date?: string;
  exit_time?: string;
  exit_price?: number;
  exit_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ScanHistory {
  id: string;
  scan_date: string;
  scan_time: string;
  total_stocks_scanned: number;
  entry_signals_found: number;
  new_positions_created: number;
  skipped_existing_positions: number;
  scan_duration_seconds: number;
}

/**
 * Position Manager Service for Supabase integration
 * Handles position tracking, PnL updates, and scan history
 */
class PositionManagerService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI';
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }
  
  /**
   * Get all active positions
   */
  async getActivePositions(): Promise<Position[]> {
    try {
      const { data, error } = await this.supabase
        .from('positions')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('entry_date', { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (error) {
      console.error('Error getting active positions:', error);
      return [];
    }
  }

  /**
   * Check if position already exists for symbol
   */
  async hasActivePosition(symbol: string): Promise<boolean> {
    try {
      const { count, error } = await this.supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE');

      if (error) throw new Error(error.message);
      return (count || 0) > 0;
    } catch (error) {
      console.error(`Error checking position for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Add new position to database
   */
  async addNewPosition(entrySignal: UltimateScanResult): Promise<string | null> {
    try {
      const now = new Date();
      const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      
      const { data, error } = await this.supabase
        .from('positions')
        .insert({
          symbol: entrySignal.symbol,
          entry_date: istTime.toISOString().split('T')[0],
          entry_time: istTime.toISOString(),
          entry_price: entrySignal.current_price,
          current_price: entrySignal.current_price,
          pnl_amount: 0,
          pnl_percentage: 0,
          status: 'ACTIVE'
        })
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      
      const positionId = data?.id;
      
      // Add entry conditions
      if (positionId && entrySignal.conditions && entrySignal.indicators) {
        await this.addEntryConditions(positionId, entrySignal);
      }
      
      return positionId;
    } catch (error) {
      console.error(`Error adding position for ${entrySignal.symbol}:`, error);
      return null;
    }
  }

  /**
   * Add entry conditions for a position
   */
  private async addEntryConditions(positionId: string, entrySignal: UltimateScanResult): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('entry_conditions')
        .insert({
          position_id: positionId,
          above_ema: entrySignal.conditions.aboveEMA,
          rsi_in_range: entrySignal.conditions.rsiInRange,
          rsi_above_sma: entrySignal.conditions.rsiAboveSMA,
          macd_bullish: entrySignal.conditions.macdBullish,
          histogram_ok: entrySignal.conditions.histogramOk,
          resistance_ok: entrySignal.conditions.resistanceOk,
          ema50_value: entrySignal.indicators.ema50,
          rsi14_value: entrySignal.indicators.rsi14,
          rsi_sma14_value: entrySignal.indicators.rsiSma14,
          macd_value: entrySignal.indicators.macd,
          macd_signal_value: entrySignal.indicators.macdSignal,
          histogram_value: entrySignal.indicators.histogram,
          histogram_count: 0 // Will be calculated later
        });

      if (error) throw new Error(error.message);
    } catch (error) {
      console.error(`Error adding entry conditions for position ${positionId}:`, error);
    }
  }

  /**
   * Update position PnL
   */
  async updatePositionPnL(symbol: string, currentPrice: number): Promise<void> {
    try {
      // First get the entry price
      const { data: position, error: fetchError } = await this.supabase
        .from('positions')
        .select('entry_price')
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE')
        .single();

      if (fetchError || !position) {
        console.error(`Position not found for ${symbol}`);
        return;
      }

      const entryPrice = position.entry_price;
      const pnlAmount = currentPrice - entryPrice;
      const pnlPercentage = (pnlAmount / entryPrice) * 100;

      const { error } = await this.supabase
        .from('positions')
        .update({
          current_price: currentPrice,
          pnl_amount: pnlAmount,
          pnl_percentage: pnlPercentage,
          updated_at: new Date().toISOString()
        })
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE');

      if (error) throw new Error(error.message);
    } catch (error) {
      console.error(`Error updating PnL for ${symbol}:`, error);
    }
  }

  /**
   * Update position trailing level
   */
  async updateTrailingLevel(symbol: string, newLevel: number): Promise<boolean> {
    try {
      // Get current trailing level to check if it changed
      const { data: position, error: fetchError } = await this.supabase
        .from('positions')
        .select('trailing_level')
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE')
        .single();

      if (fetchError || !position) {
        console.error(`Position not found for ${symbol}`);
        return false;
      }

      const currentLevel = position.trailing_level || 0;
      
      // Only update if level actually INCREASED (high-water mark)
      if (newLevel > currentLevel) {
        const { error } = await this.supabase
          .from('positions')
          .update({
            trailing_level: newLevel,
            updated_at: new Date().toISOString()
          })
          .eq('symbol', symbol)
          .eq('status', 'ACTIVE');

        if (error) throw new Error(error.message);
        
        console.log(`📈 Updated trailing level for ${symbol}: ${currentLevel} → ${newLevel} (HIGH-WATER MARK)`);
        return true; // Level increased
      } else if (newLevel < currentLevel) {
        console.log(`🔒 Trailing level protected for ${symbol}: keeping ${currentLevel} (was ${newLevel})`);
        return false; // Level protected from going down
      }
      
      return false; // Level didn't change
    } catch (error) {
      console.error(`Error updating trailing level for ${symbol}:`, error);
      return false;
    }
  }

  /**
   * Log scan history
   */
  async logScanHistory(
    totalScanned: number,
    entrySignalsFound: number,
    newPositionsCreated: number,
    skippedPositions: number,
    durationSeconds: number
  ): Promise<void> {
    try {
      const istTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      
      const { error } = await this.supabase
        .from('scan_history')
        .insert({
          scan_date: istTime.toISOString().split('T')[0],
          scan_time: istTime.toISOString(),
          total_stocks_scanned: totalScanned,
          entry_signals_found: entrySignalsFound,
          new_positions_created: newPositionsCreated,
          skipped_existing_positions: skippedPositions,
          scan_duration_seconds: durationSeconds
        });

      if (error) throw new Error(error.message);
    } catch (error) {
      console.error('Error logging scan history:', error);
    }
  }

  /**
   * Get positions with PnL summary
   */
  async getPositionsWithSummary(): Promise<{
    positions: Position[];
    summary: {
      total_positions: number;
      total_invested: number;
      total_current_value: number;
      total_pnl: number;
      total_pnl_percentage: number;
      best_performer: { symbol: string; pnl_percentage: number } | null;
      worst_performer: { symbol: string; pnl_percentage: number } | null;
    };
  }> {
    try {
      const positions = await this.getActivePositions();
      
      if (positions.length === 0) {
        return {
          positions: [],
          summary: {
            total_positions: 0,
            total_invested: 0,
            total_current_value: 0,
            total_pnl: 0,
            total_pnl_percentage: 0,
            best_performer: null,
            worst_performer: null
          }
        };
      }

      const totalInvested = positions.reduce((sum, p) => sum + p.entry_price, 0);
      const totalCurrentValue = positions.reduce((sum, p) => sum + p.current_price, 0);
      const totalPnL = totalCurrentValue - totalInvested;
      const totalPnLPercentage = (totalPnL / totalInvested) * 100;

      const bestPerformer = positions.reduce((best, current) => 
        !best || current.pnl_percentage > best.pnl_percentage ? current : best
      );

      const worstPerformer = positions.reduce((worst, current) => 
        !worst || current.pnl_percentage < worst.pnl_percentage ? current : worst
      );

      return {
        positions,
        summary: {
          total_positions: positions.length,
          total_invested: Math.round(totalInvested * 100) / 100,
          total_current_value: Math.round(totalCurrentValue * 100) / 100,
          total_pnl: Math.round(totalPnL * 100) / 100,
          total_pnl_percentage: Math.round(totalPnLPercentage * 100) / 100,
          best_performer: bestPerformer ? {
            symbol: bestPerformer.symbol,
            pnl_percentage: bestPerformer.pnl_percentage
          } : null,
          worst_performer: worstPerformer ? {
            symbol: worstPerformer.symbol,
            pnl_percentage: worstPerformer.pnl_percentage
          } : null
        }
      };
    } catch (error) {
      console.error('Error getting positions summary:', error);
      throw error;
    }
  }

}

export default PositionManagerService;
