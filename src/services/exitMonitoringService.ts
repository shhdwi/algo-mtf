import { SMA, RSI } from 'technicalindicators';
import CombinedTradingService from './combinedTradingService';
import PositionManagerService, { Position } from './positionManagerService';
import WhatsAppService from './whatsappService';
import { ExchangeCode } from '@/types/chart';

// 14-Level Trailing Stop Configuration
const TRAILING_STOPS = [
  { level: 1, profitThreshold: 1.5, lockIn: 1.0, description: "Early Protection" },
  { level: 1.5, profitThreshold: 2.25, lockIn: 1.75, description: "Enhanced Early" },
  { level: 2, profitThreshold: 2.75, lockIn: 2.0, description: "Small Gain Lock" },
  { level: 3, profitThreshold: 4.0, lockIn: 2.5, description: "Base Profit" },
  { level: 4, profitThreshold: 5.0, lockIn: 3.0, description: "Steady Growth" },
  { level: 5, profitThreshold: 6.0, lockIn: 3.5, description: "Momentum Build" },
  { level: 6, profitThreshold: 7.0, lockIn: 4.2, description: "Strong Move" },
  { level: 7, profitThreshold: 8.0, lockIn: 5.0, description: "Trend Confirm" },
  { level: 8, profitThreshold: 10.0, lockIn: 6.5, description: "Big Move" },
  { level: 9, profitThreshold: 12.0, lockIn: 8.0, description: "Strong Trend" },
  { level: 10, profitThreshold: 15.0, lockIn: 10.5, description: "Major Move" },
  { level: 11, profitThreshold: 18.0, lockIn: 13.0, description: "Breakout" },
  { level: 12, profitThreshold: 20.0, lockIn: 15.0, description: "Big Breakout" },
  { level: 13, profitThreshold: 25.0, lockIn: 19.0, description: "Explosive Move" },
  { level: 14, profitThreshold: 30.0, lockIn: 23.0, description: "Maximum Capture" }
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

export interface PositionMonitorResult {
  symbol: string;
  status: 'HOLD' | 'EXIT';
  currentPrice: number;
  pnlAmount: number;
  pnlPercentage: number;
  exitSignal?: ExitSignal;
  trailingStopLevel?: number;
  nextTargetLevel?: number;
}

/**
 * Exit Monitoring Service - 14-Level Trailing Stops & RSI Reversal
 * Runs every 5 minutes during market hours to monitor active positions
 */
class ExitMonitoringService {
  private combinedTradingService: CombinedTradingService;
  private positionManager: PositionManagerService;
  private whatsappService: WhatsAppService;

  // Phone numbers for exit notifications
  private readonly NOTIFICATION_RECIPIENTS = [
    { name: "Shrish", phone: "+917977814522" },
    { name: "Gaurav", phone: "+919016333873" },
    { name: "Brajesh", phone: "+917799817700" },
    { name: "Devam", phone: "+917045597655" },
    { name: "Aditya", phone: "+919359845062" }
  ];

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
    timestamp: string;
  }> {
    console.log('🔍 Starting position monitoring...');
    
    // Get all active positions
    const activePositions = await this.positionManager.getActivePositions();
    console.log(`📊 Monitoring ${activePositions.length} active positions`);

    const exitSignals: ExitSignal[] = [];
    const monitoringResults: PositionMonitorResult[] = [];
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

    // Send WhatsApp notifications only if there are exit signals
    if (exitSignals.length > 0 && sendWhatsApp) {
      console.log(`📱 Sending exit notifications for ${exitSignals.length} positions...`);
      await this.sendExitNotifications(exitSignals);
    } else if (exitSignals.length === 0) {
      console.log(`📊 No exit conditions met - all ${activePositions.length} positions holding`);
    }

    return {
      totalPositions: activePositions.length,
      exitSignals,
      updatedPositions,
      monitoringResults,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze single position for exit conditions
   */
  private async analyzePositionForExit(position: Position): Promise<PositionMonitorResult> {
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

    // Priority 1: Check RSI Reversal (highest priority)
    if (currentRSI < currentRSISMA) {
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
    }

    // Priority 2: Check Stop Loss (2.5% below entry)
    if (pnlPercentage <= -2.5) {
      return {
        symbol: position.symbol,
        status: 'EXIT',
        currentPrice,
        pnlAmount,
        pnlPercentage,
        exitSignal: {
          position,
          exitType: 'STOP_LOSS',
          exitReason: `Stop loss hit: Price dropped 2.5% below entry (${pnlPercentage.toFixed(2)}%)`,
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
      nextTargetLevel: trailingStopResult.nextLevel
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

    // Find current trailing stop level
    let currentLevel = 0;
    let nextLevel = 1;

    for (let i = TRAILING_STOPS.length - 1; i >= 0; i--) {
      const level = TRAILING_STOPS[i];
      if (pnlPercentage >= level.profitThreshold) {
        currentLevel = level.level;
        nextLevel = i < TRAILING_STOPS.length - 1 ? TRAILING_STOPS[i + 1].level : level.level;
        break;
      }
    }

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
        // Trailing stop triggered
        return {
          shouldExit: true,
          exitSignal: {
            position,
            exitType: 'TRAILING_STOP',
            exitReason: `Trailing stop Level ${currentLevel}: Price dropped below ${currentLevelConfig.lockIn}% lock-in`,
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
        .from('positions')
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
   * Send WhatsApp exit notifications
   */
  private async sendExitNotifications(exitSignals: ExitSignal[]): Promise<void> {
    for (const exitSignal of exitSignals) {
      // Send to each recipient
      for (const recipient of this.NOTIFICATION_RECIPIENTS) {
        try {
          console.log(`📱 Sending ${exitSignal.position.symbol} exit signal to ${recipient.name}...`);
          
          const result = await this.whatsappService.sendMessage({
            phoneNumber: recipient.phone,
            message1: `Hi ${recipient.name}! Exit alert from Dash 🚨`,
            message2: `${exitSignal.position.symbol}: ₹${exitSignal.currentPrice} - EXIT`,
            message3: `${exitSignal.exitReason}`,
            message4: `PnL: ${exitSignal.pnlPercentage >= 0 ? '+' : ''}${exitSignal.pnlPercentage.toFixed(2)}% (₹${exitSignal.pnlAmount.toFixed(2)}) | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`
          });

          if (result.success) {
            console.log(`✅ Exit WhatsApp sent to ${recipient.name}`);
          } else {
            console.log(`❌ Exit WhatsApp failed to ${recipient.name}: ${result.error}`);
          }
          
          // Delay between messages
          await this.delay(1500);
          
        } catch (error) {
          console.log(`❌ Exit WhatsApp error for ${recipient.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
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

    let currentLevel = 0;
    let nextLevel = 1;
    let lockInPrice = entryPrice * 0.975; // Default 2.5% stop loss
    let nextTargetPrice = entryPrice * 1.015; // Default 1.5% first target

    // Find current level
    for (let i = TRAILING_STOPS.length - 1; i >= 0; i--) {
      const level = TRAILING_STOPS[i];
      if (pnlPercentage >= level.profitThreshold) {
        currentLevel = level.level;
        lockInPrice = entryPrice * (1 + level.lockIn / 100);
        
        const nextLevelConfig = TRAILING_STOPS[i + 1];
        if (nextLevelConfig) {
          nextLevel = nextLevelConfig.level;
          nextTargetPrice = entryPrice * (1 + nextLevelConfig.profitThreshold / 100);
        }
        break;
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
