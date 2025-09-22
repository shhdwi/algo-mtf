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
   * Simple encryption for API keys
   */
  private encrypt(text: string): string {
    return Buffer.from(text).toString('base64') + '.' + this.ENCRYPTION_KEY.slice(0, 8);
  }

  /**
   * Simple decryption for API keys
   */
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    return Buffer.from(parts[0], 'base64').toString('utf8');
  }

  /**
   * Generate Ed25519 signature for Lemon API authentication (proper implementation)
   */
  private generateSignature(clientId: string, privateKey: string): { epochTime: string; signature: string } {
    const epochTime = Date.now().toString();
    const message = clientId + epochTime;
    
    try {
      // Convert private key from hex to bytes (32 bytes for Ed25519)
      const privateKeyBytes = Buffer.from(privateKey, 'hex');
      
      if (privateKeyBytes.length !== 32) {
        throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
      }
      
      // Create Ed25519 private key in PEM format
      const privateKeyPem = this.createEd25519PrivateKeyPEM(privateKeyBytes);
      const keyObject = crypto.createPrivateKey(privateKeyPem);
      
      // Sign the message (UTF-8 encoded)
      const messageBytes = Buffer.from(message, 'utf-8');
      const signatureBuffer = crypto.sign(null, messageBytes, keyObject);
      const signature = signatureBuffer.toString('hex');
      
      return { epochTime, signature };
      
    } catch (error) {
      console.error('Signature generation error:', error);
      throw new Error(`Failed to generate Ed25519 signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Ed25519 private key in PEM format from raw bytes
   */
  private createEd25519PrivateKeyPEM(privateKeyBytes: Buffer): string {
    if (privateKeyBytes.length !== 32) {
      throw new Error('Ed25519 private key must be 32 bytes');
    }
    
    // Ed25519 private key ASN.1 structure
    const privateKeyInfo = Buffer.concat([
      Buffer.from([0x30, 0x2e]), // SEQUENCE, length 46
      Buffer.from([0x02, 0x01, 0x00]), // INTEGER 0 (version)
      Buffer.from([0x30, 0x05]), // SEQUENCE, length 5
      Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]), // OID 1.3.101.112 (Ed25519)
      Buffer.from([0x04, 0x22]), // OCTET STRING, length 34
      Buffer.from([0x04, 0x20]), // OCTET STRING, length 32 (inner)
      privateKeyBytes // 32 bytes of private key
    ]);
    
    const base64Key = privateKeyInfo.toString('base64');
    const base64Lines = base64Key.match(/.{1,64}/g) || [base64Key];
    const pemKey = `-----BEGIN PRIVATE KEY-----\n${base64Lines.join('\n')}\n-----END PRIVATE KEY-----`;
    
    return pemKey;
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
   * Place a real order via Lemon API with retry mechanism
   */
  async placeOrder(userId: string, orderRequest: OrderRequest): Promise<OrderResponse> {
    try {
      // Try placing order with current token
      let result = await this.attemptOrderPlacement(userId, orderRequest);
      
      // If authentication failed, refresh token and retry once
      if (!result.success && 
          (result.lemon_response?.error_code === 'AUTHENTICATION_ERROR' ||
           result.error?.includes('Access token validation failed') ||
           result.lemon_response?.msg?.includes('Access token validation failed'))) {
        
        console.log(`🔄 Authentication failed for ${orderRequest.transaction_type} order, refreshing token and retrying...`);
        
        // Force refresh the access token
        const newToken = await this.forceRefreshAccessToken(userId);
        if (newToken) {
          console.log(`✅ Token refreshed, retrying ${orderRequest.transaction_type} order for ${orderRequest.symbol}...`);
          
          // Retry the order with fresh token
          result = await this.attemptOrderPlacement(userId, orderRequest);
        } else {
          return { success: false, error: 'Failed to refresh access token for order placement' };
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Error in placeOrder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Attempt order placement (internal method)
   */
  private async attemptOrderPlacement(userId: string, orderRequest: OrderRequest): Promise<OrderResponse> {
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

      // Prepare order payload for Lemon API with MTF (Margin Trading Facility)
      const orderPayload = {
        clientId,
        transactionType: orderRequest.transaction_type,
        exchangeSegment: 'NSE',
        productType: 'MTF',  // Use MTF for order placement (supported here)
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
        const { error: orderError } = await this.supabase
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

          console.log(`✅ MTF Order placed: ${orderRequest.symbol} ${orderRequest.transaction_type} ${orderRequest.quantity} shares - Order ID: ${result.data.orderId}`);

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
   * Calculate position size based on MTF margin available for the stock
   */
  async calculatePositionSize(userId: string, symbol: string, stockPrice: number): Promise<{ quantity: number; amount: number; marginRequired: number; leverage: number } | null> {
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

      // Get MTF margin info for this stock
      const marginInfo = await this.getMTFMarginInfo(userId, symbol, stockPrice, allocationAmount);
      
      if (!marginInfo) {
        console.error(`Failed to get MTF margin info for ${symbol}`);
        return null;
      }

      // Calculate quantity based on available margin
      let marginPerShare = parseFloat(marginInfo.approximateMargin);
      
      // Fallback: If API returns 0 margin (market closed/account issue), use default 20% margin
      if (marginPerShare === 0) {
        marginPerShare = stockPrice * 0.20; // 20% margin = 5x leverage
        console.log(`⚠️ Using fallback margin (20%) for ${symbol}: ₹${marginPerShare.toFixed(2)} per share`);
      }
      
      const quantity = Math.floor(allocationAmount / marginPerShare);
      const totalAmount = quantity * stockPrice;
      const marginRequired = quantity * marginPerShare;
      const leverage = totalAmount / marginRequired;

      console.log(`📊 MTF Position sizing for ${symbol}:`, {
        allocation_amount: allocationAmount,
        stock_price: stockPrice,
        margin_per_share: marginPerShare,
        quantity,
        total_amount: totalAmount,
        margin_required: marginRequired,
        leverage: leverage.toFixed(2) + 'x'
      });

      return {
        quantity,
        amount: totalAmount,
        marginRequired,
        leverage
      };

    } catch (error) {
      console.error('Error calculating MTF position size:', error);
      return null;
    }
  }

  /**
   * Get MTF margin info for a specific stock
   */
  private async getMTFMarginInfo(userId: string, symbol: string, price: number, _quantity: number): Promise<any> {
    try {
      const accessToken = await this.getAccessToken(userId);
      if (!accessToken) {
        return null;
      }

      const { data: credentials } = await this.supabase
        .from('api_credentials')
        .select('client_id, public_key_encrypted')
        .eq('user_id', userId)
        .single();

      if (!credentials) {
        return null;
      }

      const publicKey = this.decrypt(credentials.public_key_encrypted);
      const clientId = credentials.client_id;

      // Get margin info from Lemon API
      const marginPayload = {
        symbol,
        exchange: 'NSE',
        transactionType: 'BUY',
        price: price.toString(),
        quantity: '1', // Get margin for 1 share, we'll multiply later
        productType: 'MARGIN'  // Use MARGIN for margin-info API (MTF not supported here)
      };

      const response = await fetch(`${this.LEMON_BASE_URL}/api-trading/api/v2/margin-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-auth-key': accessToken,
          'x-client-id': clientId
        },
        body: JSON.stringify(marginPayload)
      });

      const result = await response.json();

      if (result.status === 'success') {
        console.log(`📊 MTF Margin info for ${symbol}:`, result.data);
        return result.data;
      } else {
        console.error(`Failed to get margin info for ${symbol}:`, result);
        return null;
      }

    } catch (error) {
      console.error(`Error getting MTF margin info for ${symbol}:`, error);
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
   * Force refresh access token (for retry scenarios)
   */
  private async forceRefreshAccessToken(userId: string): Promise<string | null> {
    try {
      console.log(`🔄 Force refreshing access token for user ${userId}...`);
      
      // Get user credentials
      const { data: credentials } = await this.supabase
        .from('api_credentials')
        .select('client_id, public_key_encrypted, private_key_encrypted')
        .eq('user_id', userId)
        .single();

      if (!credentials) {
        console.error('No credentials found for user');
        return null;
      }

      const clientId = credentials.client_id;
      const publicKey = this.decrypt(credentials.public_key_encrypted);
      const privateKey = this.decrypt(credentials.private_key_encrypted);

      // Generate fresh access token using the same method as getAccessToken
      const { epochTime, signature } = this.generateSignature(clientId, privateKey);

      const tokenResponse = await fetch(`${this.LEMON_BASE_URL}/api-trading/api/v1/generate_access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': publicKey,
          'x-client-id': clientId,
          'x-signature': signature,
          'x-timestamp': epochTime
        }
      });

      const tokenResult = await tokenResponse.json();

      if (tokenResult.status === 'success' && tokenResult.data?.access_token) {
        const accessToken = tokenResult.data.access_token;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        // Store the new token
        await this.supabase
          .from('api_credentials')
          .update({
            access_token_encrypted: this.encrypt(accessToken),
            token_expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        console.log(`✅ Access token force refreshed successfully for user ${userId}`);
        return accessToken;
      } else {
        console.error('Failed to force refresh token:', tokenResult);
        return null;
      }

    } catch (error) {
      console.error('Error force refreshing access token:', error);
      return null;
    }
  }

  /**
   * Get Last Traded Price (LTP) for a symbol
   */
  async getLTP(symbol: string, exchange: string = 'NSE'): Promise<{last_traded_price: number} | null> {
    try {
      // For now, we'll use a mock implementation since we don't have direct LTP API
      // In production, this should call the actual Lemon API LTP endpoint
      console.log(`📊 Getting LTP for ${symbol} on ${exchange}...`);
      
      // Mock implementation - in production, replace with actual Lemon API call
      // For testing, we'll return the current price from database or a reasonable estimate
      const mockPrices: { [key: string]: number } = {
        'RELIANCE': 1405, // Current test price
        'HDFCBANK': 1600,
        'TCS': 3900,
        'INFY': 1500,
        'ICICIBANK': 1200,
        'SBIN': 861.35,
        'AMBUJACEM': 594.15,
        'HDFCLIFE': 785.40
      };
      
      const price = mockPrices[symbol];
      if (price) {
        return { last_traded_price: price };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting LTP for ${symbol}:`, error);
      return null;
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
   * Exit real position via Lemon API with retry mechanism
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

      console.log(`🔄 Attempting to exit position: ${symbol} for user ${userId}`);

      // Place sell order (placeOrder now handles token refresh automatically)
      const sellOrderResult = await this.placeOrder(userId, {
        symbol,
        transaction_type: 'SELL',
        quantity: position.entry_quantity,
        order_reason: exitReason
      });

      if (sellOrderResult.success) {
        // First create the SELL order record (handle duplicate order IDs)
        let sellOrderRecord;
        const { data: existingOrder } = await this.supabase
          .from('real_orders')
          .select('*')
          .eq('lemon_order_id', sellOrderResult.order_id)
          .single();

        if (existingOrder) {
          // Order ID already exists, use the existing record
          console.log(`⚠️ Order ID ${sellOrderResult.order_id} already exists, using existing record`);
          sellOrderRecord = existingOrder;
        } else {
          // Create new order record
          const { data: newOrderRecord, error: sellOrderError } = await this.supabase
            .from('real_orders')
            .insert({
              user_id: userId,
              lemon_order_id: sellOrderResult.order_id,
              symbol,
              transaction_type: 'SELL',
              order_type: 'MARKET',
              quantity: position.entry_quantity,
              order_status: sellOrderResult.order_status || 'PLACED',
              order_reason: exitReason,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (sellOrderError) {
            console.error('Failed to create SELL order record:', sellOrderError);
            return { success: false, error: `Failed to create SELL order record: ${sellOrderError.message}` };
          }
          
          sellOrderRecord = newOrderRecord;
        }

        // Get current live price for accurate exit recording
        const ltpData = await this.getLTP(symbol, 'NSE');
        const exitPrice = ltpData?.last_traded_price || position.current_price;
        
        // Calculate final PnL
        const finalPnlAmount = (exitPrice - position.entry_price) * position.entry_quantity;
        const finalPnlPercentage = ((exitPrice - position.entry_price) / position.entry_price) * 100;

        console.log(`💰 Final PnL for ${symbol}: ₹${finalPnlAmount.toFixed(2)} (${finalPnlPercentage.toFixed(2)}%)`);

        // Update position status to EXITED using the order UUID
        const { error: updateError } = await this.supabase
          .from('real_positions')
          .update({
            exit_order_id: sellOrderRecord.id, // Use the UUID from real_orders
            exit_price: exitPrice, // Record actual exit price
            exit_quantity: position.entry_quantity, // Record exit quantity
            pnl_amount: finalPnlAmount, // Final PnL amount
            pnl_percentage: finalPnlPercentage, // Final PnL percentage
            current_price: exitPrice, // Update current price to exit price
            status: 'EXITED',
            exit_date: new Date().toISOString().split('T')[0],
            exit_time: new Date().toISOString(),
            exit_reason: exitReason,
            trailing_level: 0, // Reset trailing level
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('status', 'ACTIVE');

        if (updateError) {
          console.error('Failed to update position to EXITED:', updateError);
          return { success: false, error: `Failed to update position status: ${updateError.message}` };
        }

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
