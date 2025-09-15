import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Helper function to verify JWT token
function verifyToken(token: string): { userId: string } | null {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as any;
    return { userId: decoded.userId };
  } catch (error) {
    return null;
  }
}

// Helper function to encrypt data
function encrypt(text: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: 'Authorization token required'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);
    if (!auth) {
      return NextResponse.json({
        success: false,
        error: 'Invalid or expired token'
      }, { status: 401 });
    }

    const {
      // Trading preferences
      total_capital,
      allocation_percentage,
      max_concurrent_positions,
      daily_loss_limit_percentage,
      stop_loss_percentage,
      
      // Required API credentials (3 fields only)
      client_id,
      public_key,
      private_key
    } = await request.json();

    // Validate trading preferences
    if (!total_capital || !allocation_percentage) {
      return NextResponse.json({
        success: false,
        error: 'Total capital and allocation percentage are required'
      }, { status: 400 });
    }

    if (total_capital < 10000) {
      return NextResponse.json({
        success: false,
        error: 'Minimum capital required: ₹10,000'
      }, { status: 400 });
    }

    if (allocation_percentage < 1 || allocation_percentage > 50) {
      return NextResponse.json({
        success: false,
        error: 'Allocation percentage must be between 1% and 50%'
      }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Save trading preferences
    const { error: preferencesError } = await supabase
      .from('trading_preferences')
      .upsert({
        user_id: auth.userId,
        total_capital,
        allocation_percentage,
        max_concurrent_positions: max_concurrent_positions || 10,
        daily_loss_limit_percentage: daily_loss_limit_percentage || 5.0,
        stop_loss_percentage: stop_loss_percentage || 2.5,
        is_real_trading_enabled: false, // Will be enabled after API setup
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (preferencesError) {
      console.error('Error saving trading preferences:', preferencesError);
      return NextResponse.json({
        success: false,
        error: 'Failed to save trading preferences'
      }, { status: 500 });
    }

    // Validate API credentials - all 3 fields are required
    if (!client_id || !public_key || !private_key) {
      return NextResponse.json({
        success: false,
        error: 'All API credentials are required: client_id, public_key, private_key'
      }, { status: 400 });
    }

    // Validate API credentials by testing login with Lemon API
    try {
      console.log('🔍 Validating API credentials with Lemon API...');
      console.log('📋 Testing with:', { 
        client_id, 
        public_key_length: public_key.length,
        private_key_length: private_key.length,
        public_key_preview: public_key.substring(0, 20) + '...',
        private_key_preview: private_key.substring(0, 20) + '...'
      });
      
      // Test the credentials by attempting to generate an access token
      const epochTime = Date.now().toString();
      const message = client_id + epochTime;
      
      console.log('🔐 Signature generation:', { epochTime, message_length: message.length });
      
      // Generate Ed25519 signature (same as existing working system)
      const crypto = require('crypto');
      let signature: string;
      
      try {
        // Convert private key from hex to bytes (32 bytes for Ed25519)
        const privateKeyBytes = Buffer.from(private_key, 'hex');
        
        if (privateKeyBytes.length !== 32) {
          throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
        }
        
        // Create Ed25519 private key in PEM format
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
        
        const keyObject = crypto.createPrivateKey(pemKey);
        const messageBytes = Buffer.from(message, 'utf-8');
        const signatureBuffer = crypto.sign(null, messageBytes, keyObject);
        signature = signatureBuffer.toString('hex');
        
        console.log('🔐 Ed25519 signature generated successfully');
        
      } catch (sigError) {
        console.error('❌ Signature generation failed:', sigError);
        return NextResponse.json({
          success: false,
          error: `Invalid private key format: ${sigError instanceof Error ? sigError.message : 'Unknown error'}`
        }, { status: 400 });
      }
      
      console.log('📡 Making request to Lemon API...');
      
      const testResponse = await fetch('https://cs-prod.lemonn.co.in/api-trading/api/v1/generate_access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': public_key,
          'x-epoch-time': epochTime,
          'x-signature': signature
        },
        body: JSON.stringify({ client_id })
      });

      console.log('📊 Lemon API Response Status:', testResponse.status);
      
      const testResult = await testResponse.json();
      console.log('📊 Lemon API Response Data:', testResult);
      
      if (testResult.status !== 'success') {
        console.error('❌ API validation failed:', testResult);
        return NextResponse.json({
          success: false,
          error: `API validation failed: ${testResult.message || testResult.error_code || 'Authentication failed'}`,
          lemon_response: testResult
        }, { status: 400 });
      }
      
      console.log('✅ API credentials validated successfully');
      
    } catch (apiError) {
      console.error('❌ API validation error:', apiError);
      return NextResponse.json({
        success: false,
        error: `API validation error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`,
        debug_info: 'Check server logs for detailed error information'
      }, { status: 400 });
    }

    // Save API credentials
    const { error: credentialsError } = await supabase
      .from('api_credentials')
      .upsert({
        user_id: auth.userId,
        client_id,
        public_key_encrypted: encrypt(public_key),
        private_key_encrypted: encrypt(private_key),
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (credentialsError) {
      console.error('Error saving API credentials:', credentialsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to save API credentials'
      }, { status: 500 });
    }

    // Enable real trading
    await supabase
      .from('trading_preferences')
      .update({ is_real_trading_enabled: true })
      .eq('user_id', auth.userId);

    const apiSetupResult = { method: 'api_keys_provided', status: 'success' };

    console.log(`✅ Trading setup completed for user: ${auth.userId}`);

    return NextResponse.json({
      success: true,
      message: 'Trading setup completed successfully',
      setup: {
        trading_preferences: 'saved',
        api_credentials: apiSetupResult.status,
        real_trading_enabled: true
      }
    });

  } catch (error) {
    console.error('Trading setup error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
