import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import GlobalTokenManager from './globalTokenManager';

/**
 * Trading API Client for Lemonn API
 * Handles authentication, order management, and portfolio tracking
 */
class TradingClient {
  private baseUrl: string;
  private clientId: string;
  private phoneNumber: string;
  private pin: string;
  private apiKey: string;
  private privateKey: string;
  private globalTokenManager: GlobalTokenManager;
  private accessToken: string | null = null;
  private accessTokenExpiry: string | null = null;
  private refreshToken: string | null = null;
  private ipWhitelist: string[];
  private configFile: string;
  private requestCounts: Map<string, number[]> = new Map();
  private rateLimits: Record<string, { limit: number; window: number }>;

  constructor(config: {
    baseUrl?: string;
    clientId?: string;
    phoneNumber?: string;
    pin?: string;
    apiKey?: string;
    privateKey?: string;
    ipWhitelist?: string[];
  } = {}) {
    this.baseUrl = config.baseUrl || process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in';
    this.clientId = config.clientId || process.env.TRADING_CLIENT_ID || '';
    this.phoneNumber = config.phoneNumber || process.env.TRADING_PHONE_NUMBER || '';
    this.pin = config.pin || process.env.TRADING_PIN || '';
    this.apiKey = config.apiKey || process.env.TRADING_API_KEY || '';
    this.privateKey = config.privateKey || process.env.TRADING_AUTH_KEY || '';
    this.ipWhitelist = config.ipWhitelist || [];
    
    // Rate limiting
    this.rateLimits = {
      registration: { limit: 5, window: 60000 }, // 5 per minute
      authentication: { limit: 10, window: 60000 }, // 10 per minute
      trading: { limit: 100, window: 60000 }, // 100 per minute
      data: { limit: 200, window: 60000 } // 200 per minute
    };
    
    // Initialize global token manager
    this.globalTokenManager = GlobalTokenManager.getInstance();
    
    // Load config if file exists
    this.configFile = path.join(process.cwd(), 'trading-config.json');
    this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): void {
    try {
      // Skip file operations in server environment for now
      // In production, you might want to use a database or cache instead
      if (typeof window === 'undefined') {
        console.log('⚠️ Server environment detected, skipping file config load');
        return;
      }
      
      if (fs.existsSync(this.configFile)) {
        const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        this.accessToken = config.accessToken || this.accessToken;
        this.accessTokenExpiry = config.accessTokenExpiry || this.accessTokenExpiry;
        this.ipWhitelist = config.ipWhitelist || this.ipWhitelist;
        console.log('✅ Trading configuration loaded');
      }
      } catch {
        console.log('⚠️ No existing trading config found, will create new one');
      }
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      // Skip file operations in server environment for now
      // In production, you might want to use a database or cache instead
      if (typeof window === 'undefined') {
        console.log('⚠️ Server environment detected, skipping file config save');
        return;
      }
      
      const config = {
        clientId: this.clientId,
        phoneNumber: this.phoneNumber,
        apiKey: this.apiKey,
        privateKey: this.privateKey,
        accessToken: this.accessToken,
        accessTokenExpiry: this.accessTokenExpiry,
        ipWhitelist: this.ipWhitelist,
        savedAt: new Date().toISOString()
      };
      
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      console.log('💾 Trading configuration saved');
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(type: string): void {
    const now = Date.now();
    const limit = this.rateLimits[type];
    
    if (!this.requestCounts.has(type)) {
      this.requestCounts.set(type, []);
    }
    
    const requests = this.requestCounts.get(type)!;
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < limit.window);
    this.requestCounts.set(type, validRequests);
    
    if (validRequests.length >= limit.limit) {
      throw new Error(`Rate limit exceeded for ${type}. Limit: ${limit.limit} per ${limit.window/1000}s`);
    }
    
    // Add current request
    validRequests.push(now);
  }

  /**
   * Generate Ed25519 signature for authentication
   * Message format: client_id + epoch_time
   */
  private generateSignature(message: string): string {
    if (!this.privateKey) {
      throw new Error('Private key not configured');
    }
    
    try {
      // Convert private key from hex to bytes (32 bytes for Ed25519)
      const privateKeyBytes = Buffer.from(this.privateKey, 'hex');
      
      if (privateKeyBytes.length !== 32) {
        throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
      }
      
      // Create Ed25519 private key object using PEM format
      const privateKeyPem = this.createEd25519PrivateKeyPEM(privateKeyBytes);
      const keyObject = crypto.createPrivateKey(privateKeyPem);
      
      // Sign the message (UTF-8 encoded)
      const messageBytes = Buffer.from(message, 'utf-8');
      const signature = crypto.sign(null, messageBytes, keyObject);
      
      return signature.toString('hex');
    } catch (error) {
      throw new Error(`Ed25519 signature generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Make authenticated API request
   */
  private async makeRequest(endpoint: string, options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    rateLimit?: string;
  } = {}): Promise<unknown> {
    const { method = 'GET', body, headers = {}, rateLimit = 'data' } = options;
    
    // Check rate limits
    this.checkRateLimit(rateLimit);
    
    const url = `${this.baseUrl}${endpoint}`;
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    
    const config: RequestInit = {
      method,
      headers: requestHeaders
    };
    
    if (body) {
      config.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`API Error: ${data.message || data.msg || response.statusText} (${response.status})`);
      }
      
      // Handle error status in response body
      if (data.status === 'error') {
        throw new Error(`API Error: ${data.message || data.msg || 'Unknown error'}`);
      }
      
      return data;
    } catch (error) {
      console.error(`Request failed: ${method} ${endpoint}`, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Generate access token for API authentication
   */
  async generateAccessToken(): Promise<any> {
    if (!this.apiKey || !this.privateKey || !this.clientId) {
      throw new Error('API key, private key, and client ID are required');
    }
    
    const epochTime = Date.now().toString();
    const message = this.clientId + epochTime;
    const signature = this.generateSignature(message);
    
    const response = await this.makeRequest('/api-trading/api/v1/generate_access_token', {
      method: 'POST',
      body: { client_id: this.clientId },
      headers: {
        'x-api-key': this.apiKey,
        'x-epoch-time': epochTime,
        'x-signature': signature
      },
      rateLimit: 'authentication'
    });
    
    const tokenResponse = response as {data: {access_token: string, expires_at: string}};
    this.accessToken = tokenResponse.data.access_token;
    this.accessTokenExpiry = tokenResponse.data.expires_at;
    
    console.log(`🎫 Access token generated, expires: ${new Date(this.accessTokenExpiry!).toLocaleString()}`);
    this.saveConfig();
    return response;
  }

  /**
   * Check if access token is valid and refresh if needed
   */
  async ensureValidToken(): Promise<void> {
    if (!this.accessToken || !this.accessTokenExpiry) {
      await this.generateAccessToken();
      return;
    }
    
    const now = new Date();
    const expiry = new Date(this.accessTokenExpiry);
    const minutesUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60);
    
    // Refresh token if it expires in less than 5 minutes
    if (minutesUntilExpiry < 5) {
      console.log('🔄 Access token expiring soon, refreshing...');
      await this.generateAccessToken();
    }
  }

  /**
   * Get authenticated headers for API requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    await this.ensureValidToken();
    
    if (!this.apiKey || !this.accessToken) {
      throw new Error('Not authenticated. Generate access token first.');
    }
    
    return {
      'x-api-key': this.apiKey,
      'x-auth-key': this.accessToken,
      'x-client-id': this.clientId
    };
  }

  /**
   * Get chart data with global token management
   */
  async getChartData(params: any): Promise<any> {
    return await this.globalTokenManager.makeAuthenticatedRequest('/api-trading/api/v2/market-data/chart', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Get historical chart data with global token management
   */
  async getHistoricalChartData(params: any): Promise<any> {
    return await this.globalTokenManager.makeAuthenticatedRequest('/api-trading/api/v2/market-data/historical-chart', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  /**
   * Get LTP (Last Traded Price) data
   */
  async getLTPData(symbols: any): Promise<any> {
    const headers = await this.getAuthHeaders();
    
    const response = await this.makeRequest('/api-trading/api/v2/market-data/ltp', {
      method: 'POST',
      body: symbols,
      headers,
      rateLimit: 'data'
    });
    
    return (response as {data: unknown}).data;
  }

  /**
   * Initialize client (generate access token if needed)
   */
  async initialize(): Promise<boolean> {
    if (!this.apiKey || !this.privateKey) {
      throw new Error('API key and private key are required. Complete registration first.');
    }
    
    await this.generateAccessToken();
    console.log('🎯 Trading client initialized successfully!');
    return true;
  }
}

export default TradingClient;
