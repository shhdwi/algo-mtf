import { SMA, RSI } from 'technicalindicators';
import CombinedTradingService from './combinedTradingService';
import PositionManagerService, { Position } from './positionManagerService';
import WhatsAppService from './whatsappService';

// 14-Level Trailing Stop Configuration (Whole Numbers Only)
const TRAILING_STOPS = [
  { level: 1, profitThreshold: 1.5, lockIn: 1.0, description: "Early Protection" },
  { level: 2, profitThreshold: 2.25, lockIn: 1.75, description: "Enhanced Early" },
  { level: 3, profitThreshold: 2.75, lockIn: 2.0, description: "Small Gain Lock" },
  { level: 4, profitThreshold: 4.0, lockIn: 2.5, description: "Base Profit" },
  { level: 5, profitThreshold: 5.0, lockIn: 3.0, description: "Steady Growth" },
  { level: 6, profitThreshold: 6.0, lockIn: 3.5, description: "Momentum Build" },
  { level: 7, profitThreshold: 7.0, lockIn: 4.2, description: "Strong Move" },
  { level: 8, profitThreshold: 8.0, lockIn: 5.0, description: "Trend Confirm" },
  { level: 9, profitThreshold: 10.0, lockIn: 6.5, description: "Big Move" },
  { level: 10, profitThreshold: 12.0, lockIn: 8.0, description: "Strong Trend" },
  { level: 11, profitThreshold: 15.0, lockIn: 10.5, description: "Major Move" },
  { level: 12, profitThreshold: 18.0, lockIn: 13.0, description: "Breakout" },
  { level: 13, profitThreshold: 20.0, lockIn: 15.0, description: "Big Breakout" },
  { level: 14, profitThreshold: 25.0, lockIn: 19.0, description: "Explosive Move" },
  { level: 15, profitThreshold: 30.0, lockIn: 23.0, description: "Maximum Capture" }
];

export interface ExitSignal {
  position: Position;
  exitType: 'RSI_REVERSAL' | 'STOP_LOSS' | 'PROFIT_TARGET' | 'TRAILING_STOP';
  exitReason: string;
  currentPrice: number;
  exitPrice: number;
  pnlAmount: number;
  pnlPercentage: number;
  trailingLevel?: number;
  rsiCurrent?: number;
  rsiSma?: number;
}

export interface TrailingLevelNotification {
  position: Position;
  symbol: string;
  currentPrice: number;
  pnlPercentage: number;
  pnlAmount: number;
  newLevel: number;
  previousLevel: number;
  lockInPrice: number;
  levelDescription: string;
}

export interface PositionMonitorResult {
  symbol: string;
  status: 'HOLD' | 'EXIT';
  currentPrice: number;
  pnlAmount: number;
  pnlPercentage: number;
  exitSignal?: ExitSignal;
  trailingStopLevel?: number;
  nextTargetLevel?: number;
  trailingLevelChanged?: boolean;
  previousTrailingLevel?: number;
}

/**
 * Exit Monitoring Service - 14-Level Trailing Stops & RSI Reversal
 * Runs every 5 minutes during market hours to monitor active positions
 */
class ExitMonitoringService {
  private combinedTradingService: CombinedTradingService;
  private positionManager: PositionManagerService;
  private whatsappService: WhatsAppService;

  // Note: WhatsApp notifications now sent to eligible users from database

  constructor() {
    this.combinedTradingService = new CombinedTradingService();
    this.positionManager = new PositionManagerService();
    this.whatsappService = new WhatsAppService();
  }

  /**
   * Monitor all active positions for exit conditions
   */
  async monitorActivePositions(sendWhatsApp: boolean = true): Promise<{
    totalPositions: number;
    exitSignals: ExitSignal[];
    updatedPositions: number;
    monitoringResults: PositionMonitorResult[];
    trailingLevelNotifications: TrailingLevelNotification[];
    timestamp: string;
  }> {
    console.log('🔍 Starting position monitoring...');
    
    // Get all active positions
    const activePositions = await this.positionManager.getActivePositions();
    console.log(`📊 Monitoring ${activePositions.length} active positions`);

    const exitSignals: ExitSignal[] = [];
    const monitoringResults: PositionMonitorResult[] = [];
    const trailingLevelNotifications: TrailingLevelNotification[] = [];
    let updatedPositions = 0;

    // Monitor each position
    for (const position of activePositions) {
      try {
        console.log(`🔍 Monitoring ${position.symbol}...`);
        
        const result = await this.analyzePositionForExit(position);
        monitoringResults.push(result);

        // Update position PnL
        await this.positionManager.updatePositionPnL(position.symbol, result.currentPrice);
        updatedPositions++;

        // Check for trailing level changes and update
        if (result.trailingStopLevel !== undefined) {
          const levelChanged = await this.positionManager.updateTrailingLevel(
            position.symbol, 
            result.trailingStopLevel
          );
          
          if (levelChanged && result.trailingStopLevel > 0) {
            // Create trailing level notification
            const levelConfig = TRAILING_STOPS.find(l => l.level === result.trailingStopLevel);
            if (levelConfig) {
              const lockInPrice = position.entry_price * (1 + levelConfig.lockIn / 100);
              
              trailingLevelNotifications.push({
                position,
                symbol: position.symbol,
                currentPrice: result.currentPrice,
                pnlPercentage: result.pnlPercentage,
                pnlAmount: result.pnlAmount,
                newLevel: result.trailingStopLevel,
                previousLevel: result.previousTrailingLevel || 0,
                lockInPrice,
                levelDescription: levelConfig.description
              });
              
              console.log(`🎯 TRAILING LEVEL ACTIVATED: ${position.symbol} reached Level ${result.trailingStopLevel} (${levelConfig.description})`);
            }
          }
        }

        // Check for exit conditions
        if (result.status === 'EXIT' && result.exitSignal) {
          exitSignals.push(result.exitSignal);
          
          // Mark position as exited in database
          await this.exitPosition(result.exitSignal);
          
          console.log(`🚨 EXIT SIGNAL: ${position.symbol} - ${result.exitSignal.exitReason}`);
        }

      } catch (error) {
        console.error(`❌ Error monitoring ${position.symbol}:`, error);
      }
    }

    // Send WhatsApp notifications for trailing level activations
    if (trailingLevelNotifications.length > 0 && sendWhatsApp) {
      console.log(`📱 Sending trailing level notifications for ${trailingLevelNotifications.length} positions...`);
      await this.sendTrailingLevelNotifications(trailingLevelNotifications);
    }

    // Send WhatsApp notifications for exit signals
    if (exitSignals.length > 0 && sendWhatsApp) {
      console.log(`📱 Sending exit notifications for ${exitSignals.length} positions...`);
      await this.sendExitNotifications(exitSignals);
    } else if (exitSignals.length === 0 && trailingLevelNotifications.length === 0) {
      console.log(`📊 No exit conditions met - all ${activePositions.length} positions holding`);
    }

    return {
      totalPositions: activePositions.length,
      exitSignals,
      updatedPositions,
      monitoringResults,
      trailingLevelNotifications,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze single position for exit conditions
   */
  private async analyzePositionForExit(position: Position, customStopLossPercentage?: number): Promise<PositionMonitorResult> {
    // Get current market data
    const tradingData = await this.combinedTradingService.getCombinedTradingData(position.symbol, 'NSE');
    
    // Prepare data for RSI calculation
    const allCandles = [...tradingData.historicalData];
    if (tradingData.todaysCandle.close > 0) {
      allCandles.push({
        date: tradingData.todaysCandle.date,
        open: tradingData.todaysCandle.open,
        high: tradingData.todaysCandle.high,
        low: tradingData.todaysCandle.low,
        close: tradingData.todaysCandle.close,
        volume: tradingData.todaysCandle.volume,
        dayOfWeek: new Date(tradingData.todaysCandle.date).toLocaleDateString('en-US', { weekday: 'long' })
      });
    }

    const currentPrice = allCandles[allCandles.length - 1].close;
    const entryPrice = position.entry_price;
    const pnlAmount = currentPrice - entryPrice;
    const pnlPercentage = (pnlAmount / entryPrice) * 100;

    // Calculate RSI and RSI SMA for trend reversal detection
    const closes = allCandles.map(c => c.close);
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsiSmaValues = SMA.calculate({ values: rsiValues, period: 14 });
    
    const currentRSI = rsiValues[rsiValues.length - 1] || 50;
    const currentRSISMA = rsiSmaValues[rsiSmaValues.length - 1] || 50;

    // Priority 1: Check RSI Reversal (only during specific time windows to avoid volatility)
    if (currentRSI < currentRSISMA) {
      // Get current IST time to check if we're in RSI exit windows
      const now = new Date();
      const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const hour = istTime.getHours();
      const minute = istTime.getMinutes();
      
      // RSI exits only allowed during:
      // Window 1: 11:00-11:10 AM IST (hour 11, minutes 0-10)
      // Window 2: 2:00-2:10 PM IST (hour 14, minutes 0-10)
      const isWindow1 = (hour === 11 && minute >= 0 && minute <= 10);
      const isWindow2 = (hour === 14 && minute >= 0 && minute <= 10);
      const isInRSIExitWindow = isWindow1 || isWindow2;
      
      if (isInRSIExitWindow) {
        console.log(`✅ RSI reversal detected during exit window (${hour}:${minute.toString().padStart(2, '0')} IST) - Allowing exit`);
        return {
          symbol: position.symbol,
          status: 'EXIT',
          currentPrice,
          pnlAmount,
          pnlPercentage,
          exitSignal: {
            position,
            exitType: 'RSI_REVERSAL',
            exitReason: 'Exit due to trend reversal: RSI crossed down RSI 14 SMA',
            currentPrice,
            exitPrice: currentPrice,
            pnlAmount,
            pnlPercentage,
            rsiCurrent: currentRSI,
            rsiSma: currentRSISMA
          }
        };
      } else {
        console.log(`⏸️ RSI reversal detected but outside exit windows (${hour}:${minute.toString().padStart(2, '0')} IST) - Skipping RSI exit, will check stop loss and trailing stops`);
        // Fall through to check stop loss and trailing stops
      }
    }

    // Priority 2: Check Stop Loss (user-defined percentage or default 2.5%)
    const stopLossThreshold = -(customStopLossPercentage || 2.5);
    if (pnlPercentage <= stopLossThreshold) {
      return {
        symbol: position.symbol,
        status: 'EXIT',
        currentPrice,
        pnlAmount,
        pnlPercentage,
        exitSignal: {
          position,
          exitType: 'STOP_LOSS',
          exitReason: `Stop loss hit: Price dropped ${Math.abs(stopLossThreshold)}% below entry (${pnlPercentage.toFixed(2)}%)`,
          currentPrice,
          exitPrice: currentPrice,
          pnlAmount,
          pnlPercentage
        }
      };
    }

    // Priority 3: Check Trailing Stops and Profit Targets
    const trailingStopResult = this.checkTrailingStops(position, currentPrice, pnlPercentage);
    if (trailingStopResult.shouldExit) {
      return {
        symbol: position.symbol,
        status: 'EXIT',
        currentPrice,
        pnlAmount,
        pnlPercentage,
        exitSignal: trailingStopResult.exitSignal!,
        trailingStopLevel: trailingStopResult.currentLevel
      };
    }

    // No exit conditions met - continue holding
    return {
      symbol: position.symbol,
      status: 'HOLD',
      currentPrice,
      pnlAmount,
      pnlPercentage,
      trailingStopLevel: trailingStopResult.currentLevel,
      nextTargetLevel: trailingStopResult.nextLevel,
      previousTrailingLevel: position.trailing_level || 0
    };
  }

  /**
   * Check 14-level trailing stops
   */
  private checkTrailingStops(position: Position, currentPrice: number, pnlPercentage: number): {
    shouldExit: boolean;
    exitSignal?: ExitSignal;
    currentLevel?: number;
    nextLevel?: number;
  } {
    const entryPrice = position.entry_price;

    // Get existing trailing level (high-water mark)
    const existingLevel = position.trailing_level || 0;

    // Calculate what level current P&L would qualify for
    let calculatedLevel = 0;
    let nextLevel = 1;

    for (let i = TRAILING_STOPS.length - 1; i >= 0; i--) {
      const level = TRAILING_STOPS[i];
      if (pnlPercentage >= level.profitThreshold) {
        calculatedLevel = level.level;
        nextLevel = i < TRAILING_STOPS.length - 1 ? TRAILING_STOPS[i + 1].level : level.level;
        break;
      }
    }

    // HIGH-WATER MARK: Trailing level can only go UP, never DOWN
    const currentLevel = Math.max(existingLevel, calculatedLevel);

    // If no profit level reached, check for first target
    if (currentLevel === 0) {
      const firstTarget = TRAILING_STOPS[0];
      if (pnlPercentage >= firstTarget.profitThreshold) {
        // First target reached - notification only, no exit
        return {
          shouldExit: false,
          currentLevel: 0,
          nextLevel: firstTarget.level
        };
      }
      return { shouldExit: false, currentLevel: 0, nextLevel: 1 };
    }

    // Check if price dropped below lock-in level
    const currentLevelConfig = TRAILING_STOPS.find(l => l.level === currentLevel);
    if (currentLevelConfig) {
      const lockInPrice = entryPrice * (1 + currentLevelConfig.lockIn / 100);
      
      if (currentPrice < lockInPrice) {
        // Trailing stop triggered - Book profits now!
        return {
          shouldExit: true,
          exitSignal: {
            position,
            exitType: 'TRAILING_STOP',
            exitReason: `Book profits now! ${position.symbol} hit trailing stop at ${currentLevelConfig.lockIn}% - secure your gains before further drop!`,
            currentPrice,
            exitPrice: currentPrice,
            pnlAmount: currentPrice - entryPrice,
            pnlPercentage,
            trailingLevel: currentLevel
          },
          currentLevel
        };
      }
    }

    return { shouldExit: false, currentLevel, nextLevel };
  }

  /**
   * Exit position in database
   */
  private async exitPosition(exitSignal: ExitSignal): Promise<void> {
    try {
      const istTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
      
      const { error } = await this.positionManager['supabase']
        .from('algorithm_positions')
        .update({
          status: 'EXITED',
          exit_date: istTime.toISOString().split('T')[0],
          exit_time: istTime.toISOString(),
          exit_price: exitSignal.exitPrice,
          exit_reason: exitSignal.exitType,
          current_price: exitSignal.currentPrice,
          pnl_amount: exitSignal.pnlAmount,
          pnl_percentage: exitSignal.pnlPercentage,
          updated_at: istTime.toISOString()
        })
        .eq('symbol', exitSignal.position.symbol)
        .eq('status', 'ACTIVE');

      if (error) throw new Error(error.message);
      
      console.log(`💾 Position exited in database: ${exitSignal.position.symbol}`);
    } catch (error) {
      console.error(`❌ Error exiting position ${exitSignal.position.symbol}:`, error);
    }
  }

  /**
   * Send WhatsApp exit notifications to eligible users
   */
  private async sendExitNotifications(exitSignals: ExitSignal[]): Promise<void> {
    try {
      // Get eligible users from database
      const { data: eligibleUsers, error } = await this.positionManager['supabase']
        .from('trading_preferences')
        .select(`
          user_id,
          users!inner(full_name, phone_number, is_active)
        `)
        .eq('is_real_trading_enabled', true)
        .eq('users.is_active', true);

      if (error || !eligibleUsers?.length) {
        console.log('📱 No eligible users found for exit notifications');
        return;
      }

      for (const exitSignal of exitSignals) {
        // Send to each eligible user
        for (const user of eligibleUsers) {
          try {
            console.log(`📱 Sending ${exitSignal.position.symbol} exit signal to ${(user as any).users.full_name}...`);
            
            const result = await this.whatsappService.sendMessage({
              phoneNumber: (user as any).users.phone_number,
              message1: `Hi ${(user as any).users.full_name}! Book profits now! 📈`,
              message2: `${exitSignal.position.symbol}: ₹${exitSignal.currentPrice} - TRAILING STOP HIT`,
              message3: `${exitSignal.exitReason}`,
              message4: `Final PnL: ${exitSignal.pnlPercentage >= 0 ? '+' : ''}${exitSignal.pnlPercentage.toFixed(2)}% (₹${exitSignal.pnlAmount.toFixed(2)}) | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
            });

            if (result.success) {
              console.log(`✅ Exit WhatsApp sent to ${(user as any).users.full_name}`);
            } else {
              console.log(`❌ Exit WhatsApp failed to ${(user as any).users.full_name}: ${result.error}`);
            }
            
            // Delay between messages
            await this.delay(1500);
            
          } catch (error) {
            console.log(`❌ Exit WhatsApp error for ${(user as any).users.full_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error sending exit notifications:', error);
    }
  }

  /**
   * Send WhatsApp trailing level notifications
   */
  private async sendTrailingLevelNotifications(notifications: TrailingLevelNotification[]): Promise<void> {
    try {
      // Get eligible users from database
      const { data: eligibleUsers, error } = await this.positionManager['supabase']
        .from('trading_preferences')
        .select(`
          user_id,
          users!inner(full_name, phone_number, is_active)
        `)
        .eq('is_real_trading_enabled', true)
        .eq('users.is_active', true);

      if (error || !eligibleUsers?.length) {
        console.log('📱 No eligible users found for trailing level notifications');
        return;
      }

      for (const notification of notifications) {
        // Send to each eligible user
        for (const user of eligibleUsers) {
          try {
            console.log(`📱 Sending ${notification.symbol} trailing level notification to ${(user as any).users.full_name}...`);
            
            // Calculate locked profit amount based on 1 lakh investment
            const lockedProfitAmount = (notification.lockInPrice - notification.position.entry_price) / notification.position.entry_price * 100000;
            
            const result = await this.whatsappService.sendMessage({
              phoneNumber: (user as any).users.phone_number,
              message1: `Hi ${(user as any).users.full_name}! Trailing level activated 🎯`,
              message2: `${notification.symbol}: ₹${notification.currentPrice} - LEVEL ${notification.newLevel} ACTIVATED`,
              message3: `${notification.levelDescription} | ₹${lockedProfitAmount.toFixed(0)} profit now LOCKED (${((notification.lockInPrice - notification.position.entry_price) / notification.position.entry_price * 100).toFixed(2)}%)`,
              message4: `Current PnL: +${notification.pnlPercentage.toFixed(2)}% (₹${notification.pnlAmount.toFixed(0)}) | Protected at ₹${notification.lockInPrice.toFixed(2)} | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
            });

            if (result.success) {
              console.log(`✅ Trailing level WhatsApp sent to ${(user as any).users.full_name}`);
            } else {
              console.log(`❌ Trailing level WhatsApp failed to ${(user as any).users.full_name}: ${result.error}`);
            }
            
            // Delay between messages
            await this.delay(1500);
            
          } catch (error) {
            console.log(`❌ Trailing level WhatsApp error for ${(user as any).users.full_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error sending trailing level notifications:', error);
    }
  }

  /**
   * Get trailing stop status for a position
   */
  getTrailingStopStatus(position: Position, currentPrice: number): {
    currentLevel: number;
    nextLevel: number;
    lockInPrice: number;
    nextTargetPrice: number;
    pnlPercentage: number;
  } {
    const entryPrice = position.entry_price;
    const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Get existing trailing level (high-water mark)
    const existingLevel = position.trailing_level || 0;

    let calculatedLevel = 0;
    let nextLevel = 1;
    let lockInPrice = entryPrice * 0.975; // Default 2.5% stop loss
    let nextTargetPrice = entryPrice * 1.015; // Default 1.5% first target

    // Find what level current P&L would qualify for
    for (let i = TRAILING_STOPS.length - 1; i >= 0; i--) {
      const level = TRAILING_STOPS[i];
      if (pnlPercentage >= level.profitThreshold) {
        calculatedLevel = level.level;
        
        const nextLevelConfig = TRAILING_STOPS[i + 1];
        if (nextLevelConfig) {
          nextLevel = nextLevelConfig.level;
          nextTargetPrice = entryPrice * (1 + nextLevelConfig.profitThreshold / 100);
        }
        break;
      }
    }

    // HIGH-WATER MARK: Use the higher of existing or calculated level
    const currentLevel = Math.max(existingLevel, calculatedLevel);

    // Set lock-in price based on the current (protected) level
    if (currentLevel > 0) {
      const levelConfig = TRAILING_STOPS.find(l => l.level === currentLevel);
      if (levelConfig) {
        lockInPrice = entryPrice * (1 + levelConfig.lockIn / 100);
      }
    }

    // If no level reached, set next target
    if (currentLevel === 0) {
      const firstTarget = TRAILING_STOPS[0];
      nextTargetPrice = entryPrice * (1 + firstTarget.profitThreshold / 100);
    }

    return {
      currentLevel,
      nextLevel,
      lockInPrice,
      nextTargetPrice,
      pnlPercentage
    };
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ExitMonitoringService;
