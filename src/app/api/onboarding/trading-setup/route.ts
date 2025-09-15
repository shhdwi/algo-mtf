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

    // Validate API key formats
    if (!public_key.startsWith('pk_live_')) {
      return NextResponse.json({
        success: false,
        error: 'Public key must start with pk_live_'
      }, { status: 400 });
    }

    if (!private_key.startsWith('sk_live_')) {
      return NextResponse.json({
        success: false,
        error: 'Private key must start with sk_live_'
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
