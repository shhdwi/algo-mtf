import crypto from 'crypto';

/**
 * Global Token Manager - Single source of truth for access tokens
 * Prevents token conflicts and rate limiting across all services
 */
class GlobalTokenManager {
  private static instance: GlobalTokenManager;
  private accessToken: string | null = null;
  private accessTokenExpiry: Date | null = null;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string> | null = null;
  private config: {
    baseUrl: string;
    apiKey: string;
    privateKey: string;
    clientId: string;
  };

  private constructor() {
    this.config = {
      baseUrl: process.env.TRADING_API_URL || 'https://cs-prod.lemonn.co.in',
      apiKey: process.env.TRADING_API_KEY || '',
      privateKey: process.env.TRADING_AUTH_KEY || '',
      clientId: process.env.TRADING_CLIENT_ID || ''
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GlobalTokenManager {
    if (!GlobalTokenManager.instance) {
      GlobalTokenManager.instance = new GlobalTokenManager();
    }
    return GlobalTokenManager.instance;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string> {
    // If token is valid and not expiring soon, return it
    if (this.accessToken && this.accessTokenExpiry && this.isTokenValid()) {
      return this.accessToken;
    }

    // If already refreshing, wait for the existing refresh
    if (this.isRefreshing && this.refreshPromise) {
      return await this.refreshPromise;
    }

    // Start new refresh
    this.refreshPromise = this.refreshToken();
    return await this.refreshPromise;
  }

  /**
   * Force refresh token (for rate limiting recovery)
   */
  async forceRefresh(): Promise<string> {
    this.refreshPromise = this.refreshToken();
    return await this.refreshPromise;
  }

  /**
   * Check if current token is valid
   */
  private isTokenValid(): boolean {
    if (!this.accessToken || !this.accessTokenExpiry) {
      return false;
    }

    const now = new Date();
    const expiry = new Date(this.accessTokenExpiry);
    const minutesUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60);

    // Consider token invalid if it expires in less than 5 minutes
    return minutesUntilExpiry > 5;
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<string> {
    this.isRefreshing = true;
    
    try {
      console.log('🔄 Global Token Manager: Refreshing access token...');
      
      const epochTime = Date.now().toString();
      const message = this.config.clientId + epochTime;
      const signature = this.generateSignature(message);

      const response = await fetch(`${this.config.baseUrl}/api-trading/api/v1/generate_access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'x-epoch-time': epochTime,
          'x-signature': signature
        },
        body: JSON.stringify({ client_id: this.config.clientId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Token generation failed: ${response.status} - ${JSON.stringify(data)}`);
      }

      this.accessToken = data.data.access_token;
      this.accessTokenExpiry = new Date(data.data.expires_at);
      
      console.log(`✅ Global Token Manager: Token refreshed, expires: ${this.accessTokenExpiry.toLocaleString()}`);
      
      return this.accessToken;
      
    } catch (error) {
      console.error('❌ Global Token Manager: Token refresh failed:', error);
      throw error;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Generate Ed25519 signature
   */
  private generateSignature(message: string): string {
    try {
      const privateKeyBytes = Buffer.from(this.config.privateKey, 'hex');
      
      if (privateKeyBytes.length !== 32) {
        throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
      }
      
      const privateKeyPem = this.createEd25519PrivateKeyPEM(privateKeyBytes);
      const keyObject = crypto.createPrivateKey(privateKeyPem);
      
      const messageBytes = Buffer.from(message, 'utf-8');
      const signature = crypto.sign(null, messageBytes, keyObject);
      
      return signature.toString('hex');
    } catch (error) {
      throw new Error(`Ed25519 signature generation failed: ${error.message}`);
    }
  }

  /**
   * Create Ed25519 private key in PEM format
   */
  private createEd25519PrivateKeyPEM(privateKeyBytes: Buffer): string {
    if (privateKeyBytes.length !== 32) {
      throw new Error('Ed25519 private key must be 32 bytes');
    }
    
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
    const pemKey = `-----BEGIN PRIVATE KEY-----\n${base64Key.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
    
    return pemKey;
  }

  /**
   * Get auth headers for API requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getValidToken();
    
    return {
      'x-api-key': this.config.apiKey,
      'x-auth-key': token,
      'x-client-id': this.config.clientId
    };
  }

  /**
   * Make authenticated API request
   */
  async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      // If 401, try one more time with fresh token
      if (response.status === 401) {
        console.log('🔄 Global Token Manager: 401 detected, forcing token refresh...');
        await this.forceRefresh();
        
        const freshHeaders = await this.getAuthHeaders();
        const retryResponse = await fetch(`${this.config.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...freshHeaders,
            ...options.headers
          }
        });

        const retryData = await retryResponse.json();
        
        if (!retryResponse.ok) {
          throw new Error(`API Error: ${retryData.message || retryData.msg || retryResponse.statusText} (${retryResponse.status})`);
        }
        
        return retryData;
      }
      
      throw new Error(`API Error: ${data.message || data.msg || response.statusText} (${response.status})`);
    }

    return data;
  }

  /**
   * Get token status for debugging
   */
  getTokenStatus(): {
    hasToken: boolean;
    expiresAt: string | null;
    isValid: boolean;
    minutesUntilExpiry: number | null;
  } {
    const minutesUntilExpiry = this.accessTokenExpiry 
      ? (this.accessTokenExpiry.getTime() - Date.now()) / (1000 * 60)
      : null;

    return {
      hasToken: !!this.accessToken,
      expiresAt: this.accessTokenExpiry?.toISOString() || null,
      isValid: this.isTokenValid(),
      minutesUntilExpiry: minutesUntilExpiry ? Math.round(minutesUntilExpiry) : null
    };
  }
}

export default GlobalTokenManager;
