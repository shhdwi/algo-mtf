import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface LemonApiCredentials {
  client_id: string;
  public_key: string;
  private_key: string;
  access_token?: string;
  token_expires_at?: string;
}

export interface TradingPreferences {
  total_capital: number;
  allocation_percentage: number;
  max_concurrent_positions: number;
  daily_loss_limit_percentage: number;
  stop_loss_percentage: number;
  is_real_trading_enabled: boolean;
}

export interface OrderRequest {
  symbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  order_reason: string;
  scanner_signal_id?: string;
}

export interface OrderResponse {
  success: boolean;
  order_id?: string;
  order_status?: string;
  error?: string;
  lemon_response?: any;
}

/**
 * Lemon Trading Service - Real money trading integration
 * Handles order placement, position management, and API authentication
 */
class LemonTradingService {
  private supabase;
  private readonly LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';
  private readonly ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI';
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate Ed25519 signature for Lemon API authentication
   */
  private generateSignature(clientId: string, privateKey: string): { epochTime: string; signature: string } {
    const epochTime = Date.now().toString();
    const message = clientId + epochTime;
    
    // For production, implement proper Ed25519 signature
    // For now, return a placeholder
    const signature = crypto.createHmac('sha256', privateKey).update(message).digest('hex');
    
    return { epochTime, signature };
  }

  /**
   * Get or refresh access token for user
   */
  async getAccessToken(userId: string): Promise<string | null> {
    try {
      // Get user's API credentials
      const { data: credentials, error } = await this.supabase
        .from('api_credentials')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (error || !credentials) {
        console.error('No API credentials found for user:', userId);
        return null;
      }

      // Check if access token is still valid
      const now = new Date();
      const expiresAt = new Date(credentials.token_expires_at || 0);
      
      if (credentials.access_token_encrypted && expiresAt > now) {
        return this.decrypt(credentials.access_token_encrypted);
      }

      // Generate new access token
      const clientId = credentials.client_id;
      const publicKey = this.decrypt(credentials.public_key_encrypted);
      const privateKey = this.decrypt(credentials.private_key_encrypted);

      const { epochTime, signature } = this.generateSignature(clientId, privateKey);

      const response = await fetch(`${this.LEMON_BASE_URL}/api-trading/api/v1/generate_access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-epoch-time': epochTime,
          'x-signature': signature
        },
        body: JSON.stringify({ client_id: clientId })
      });

      const result = await response.json();

      if (result.status === 'success') {
        const accessToken = result.data.access_token;
        const expiresAt = result.data.expires_at;

        // Update encrypted access token in database
        await this.supabase
          .from('api_credentials')
          .update({
            access_token_encrypted: this.encrypt(accessToken),
            token_expires_at: expiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        return accessToken;
      } else {
        console.error('Failed to generate access token:', result);
        return null;
      }

    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  /**
   * Place a real order via Lemon API
   */
  async placeOrder(userId: string, orderRequest: OrderRequest): Promise<OrderResponse> {
    try {
      // Get user's access token and credentials
      const accessToken = await this.getAccessToken(userId);
      if (!accessToken) {
        return { success: false, error: 'Failed to get access token' };
      }

      const { data: credentials } = await this.supabase
        .from('api_credentials')
        .select('client_id, public_key_encrypted')
        .eq('user_id', userId)
        .single();

      if (!credentials) {
        return { success: false, error: 'No API credentials found' };
      }

      const publicKey = this.decrypt(credentials.public_key_encrypted);
      const clientId = credentials.client_id;

      // Prepare order payload for Lemon API
      const orderPayload = {
        clientId,
        transactionType: orderRequest.transaction_type,
        exchangeSegment: 'NSE',
        productType: 'DELIVERY',
        orderType: 'MARKET',
        validity: 'DAY',
        symbol: orderRequest.symbol,
        quantity: orderRequest.quantity.toString(),
        afterMarketOrder: false
      };

      // Place order via Lemon API
      const response = await fetch(`${this.LEMON_BASE_URL}/api-trading/api/v2/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-auth-key': accessToken,
          'x-client-id': clientId
        },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();

      if (result.status === 'success') {
        // Save order to database
        const { data: orderData, error: orderError } = await this.supabase
          .from('real_orders')
          .insert({
            user_id: userId,
            lemon_order_id: result.data.orderId,
            symbol: orderRequest.symbol,
            transaction_type: orderRequest.transaction_type,
            quantity: orderRequest.quantity,
            price: orderRequest.price,
            order_status: result.data.orderStatus,
            order_reason: orderRequest.order_reason,
            scanner_signal_id: orderRequest.scanner_signal_id
          })
          .select('id')
          .single();

        if (orderError) {
          console.error('Failed to save order to database:', orderError);
        }

        console.log(`✅ Order placed: ${orderRequest.symbol} ${orderRequest.transaction_type} ${orderRequest.quantity} - Order ID: ${result.data.orderId}`);

        return {
          success: true,
          order_id: result.data.orderId,
          order_status: result.data.orderStatus,
          lemon_response: result
        };

      } else {
        console.error('Lemon API order failed:', result);
        return {
          success: false,
          error: result.message || 'Order placement failed',
          lemon_response: result
        };
      }

    } catch (error) {
      console.error('Error placing order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Calculate position size based on user's allocation settings
   */
  async calculatePositionSize(userId: string, stockPrice: number): Promise<{ quantity: number; amount: number } | null> {
    try {
      const { data: preferences, error } = await this.supabase
        .from('trading_preferences')
        .select('total_capital, allocation_percentage')
        .eq('user_id', userId)
        .single();

      if (error || !preferences) {
        console.error('No trading preferences found for user:', userId);
        return null;
      }

      const allocationAmount = (preferences.total_capital * preferences.allocation_percentage) / 100;
      const quantity = Math.floor(allocationAmount / stockPrice);

      return {
        quantity,
        amount: quantity * stockPrice
      };

    } catch (error) {
      console.error('Error calculating position size:', error);
      return null;
    }
  }

  /**
   * Check if user can place new orders (within limits)
   */
  async canPlaceNewOrder(userId: string): Promise<{ canTrade: boolean; reason?: string }> {
    try {
      // Check if real trading is enabled
      const { data: preferences } = await this.supabase
        .from('trading_preferences')
        .select('is_real_trading_enabled, max_concurrent_positions, daily_loss_limit_percentage')
        .eq('user_id', userId)
        .single();

      if (!preferences?.is_real_trading_enabled) {
        return { canTrade: false, reason: 'Real trading not enabled' };
      }

      // Check concurrent positions limit
      const { count: activePositions } = await this.supabase
        .from('real_positions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'ACTIVE');

      if ((activePositions || 0) >= preferences.max_concurrent_positions) {
        return { canTrade: false, reason: 'Maximum concurrent positions reached' };
      }

      // Check daily loss limit
      const today = new Date().toISOString().split('T')[0];
      const { data: dailySummary } = await this.supabase
        .from('daily_trading_summary')
        .select('daily_pnl_percentage, is_trading_stopped')
        .eq('user_id', userId)
        .eq('trading_date', today)
        .single();

      if (dailySummary?.is_trading_stopped) {
        return { canTrade: false, reason: 'Daily loss limit reached - trading stopped' };
      }

      if (dailySummary && Math.abs(dailySummary.daily_pnl_percentage) >= preferences.daily_loss_limit_percentage) {
        return { canTrade: false, reason: 'Daily loss limit exceeded' };
      }

      return { canTrade: true };

    } catch (error) {
      console.error('Error checking trading eligibility:', error);
      return { canTrade: false, reason: 'Error checking trading status' };
    }
  }

  /**
   * Get all users eligible for real trading
   */
  async getEligibleTradingUsers(): Promise<string[]> {
    try {
      const { data: users, error } = await this.supabase
        .from('trading_preferences')
        .select('user_id')
        .eq('is_real_trading_enabled', true);

      if (error) {
        console.error('Error getting eligible users:', error);
        return [];
      }

      return users.map(u => u.user_id);

    } catch (error) {
      console.error('Error getting eligible trading users:', error);
      return [];
    }
  }

  /**
   * Update daily trading summary
   */
  async updateDailyTradingSummary(userId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Calculate today's P&L from real positions
      const { data: positions } = await this.supabase
        .from('real_positions')
        .select('pnl_amount, entry_date')
        .eq('user_id', userId)
        .eq('entry_date', today);

      const dailyPnL = positions?.reduce((sum, pos) => sum + (pos.pnl_amount || 0), 0) || 0;

      // Get user's total capital for percentage calculation
      const { data: preferences } = await this.supabase
        .from('trading_preferences')
        .select('total_capital, daily_loss_limit_percentage')
        .eq('user_id', userId)
        .single();

      if (!preferences) return;

      const dailyPnLPercentage = (dailyPnL / preferences.total_capital) * 100;
      const shouldStopTrading = Math.abs(dailyPnLPercentage) >= preferences.daily_loss_limit_percentage;

      // Upsert daily summary
      await this.supabase
        .from('daily_trading_summary')
        .upsert({
          user_id: userId,
          trading_date: today,
          daily_pnl: dailyPnL,
          daily_pnl_percentage: dailyPnLPercentage,
          is_trading_stopped: shouldStopTrading,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'user_id,trading_date' 
        });

      if (shouldStopTrading) {
        console.log(`🚨 Trading stopped for user ${userId} - daily loss limit reached: ${dailyPnLPercentage.toFixed(2)}%`);
      }

    } catch (error) {
      console.error('Error updating daily trading summary:', error);
    }
  }

  /**
   * Create real position from order
   */
  async createRealPosition(userId: string, orderId: string, entryPrice: number): Promise<void> {
    try {
      // Get order details
      const { data: order, error: orderError } = await this.supabase
        .from('real_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        console.error('Order not found:', orderId);
        return;
      }

      // Create real position
      const { error: positionError } = await this.supabase
        .from('real_positions')
        .insert({
          user_id: userId,
          symbol: order.symbol,
          entry_order_id: orderId,
          entry_price: entryPrice,
          entry_quantity: order.quantity,
          current_price: entryPrice,
          entry_date: new Date().toISOString().split('T')[0],
          entry_time: new Date().toISOString(),
          status: 'ACTIVE'
        });

      if (positionError) {
        console.error('Failed to create real position:', positionError);
      } else {
        console.log(`✅ Real position created: ${order.symbol} for user ${userId}`);
      }

    } catch (error) {
      console.error('Error creating real position:', error);
    }
  }

  /**
   * Update real position P&L
   */
  async updateRealPositionPnL(userId: string, symbol: string, currentPrice: number): Promise<void> {
    try {
      // Get active position
      const { data: position, error: fetchError } = await this.supabase
        .from('real_positions')
        .select('entry_price, entry_quantity')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE')
        .single();

      if (fetchError || !position) {
        return; // Position not found or error
      }

      const entryPrice = position.entry_price;
      const pnlAmount = (currentPrice - entryPrice) * position.entry_quantity;
      const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Update position P&L
      const { error } = await this.supabase
        .from('real_positions')
        .update({
          current_price: currentPrice,
          pnl_amount: pnlAmount,
          pnl_percentage: pnlPercentage,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE');

      if (error) {
        console.error(`Error updating real position P&L for ${symbol}:`, error);
      }

    } catch (error) {
      console.error('Error updating real position P&L:', error);
    }
  }

  /**
   * Exit real position via Lemon API
   */
  async exitRealPosition(userId: string, symbol: string, exitReason: string): Promise<OrderResponse> {
    try {
      // Get active position
      const { data: position, error: positionError } = await this.supabase
        .from('real_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('status', 'ACTIVE')
        .single();

      if (positionError || !position) {
        return { success: false, error: 'Active position not found' };
      }

      // Place sell order
      const sellOrderResult = await this.placeOrder(userId, {
        symbol,
        transaction_type: 'SELL',
        quantity: position.entry_quantity,
        order_reason: exitReason
      });

      if (sellOrderResult.success) {
        // Update position status to EXITED
        await this.supabase
          .from('real_positions')
          .update({
            exit_order_id: sellOrderResult.order_id,
            status: 'EXITED',
            exit_date: new Date().toISOString().split('T')[0],
            exit_time: new Date().toISOString(),
            exit_reason: exitReason,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('status', 'ACTIVE');

        console.log(`✅ Real position exited: ${symbol} for user ${userId} - Reason: ${exitReason}`);
      }

      return sellOrderResult;

    } catch (error) {
      console.error('Error exiting real position:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default LemonTradingService;
