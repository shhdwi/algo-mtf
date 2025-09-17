import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Helper function to verify JWT token
function verifyToken(token: string): { userId: string } | null {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as any;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
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

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Get user information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, phone_number, is_active')
      .eq('id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    // Get trading preferences
    const { data: tradingPreferences } = await supabase
      .from('trading_preferences')
      .select('*')
      .eq('user_id', auth.userId)
      .single();

    // Get API credentials (without sensitive data)
    const { data: apiCredentials } = await supabase
      .from('api_credentials')
      .select('client_id, is_active, created_at')
      .eq('user_id', auth.userId)
      .single();

    // Determine onboarding completion status
    const hasPreferences = !!tradingPreferences?.total_capital;
    const hasApiCredentials = !!apiCredentials?.client_id;
    const isRealTradingEnabled = !!tradingPreferences?.is_real_trading_enabled;
    
    const onboardingComplete = hasPreferences && hasApiCredentials && isRealTradingEnabled;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        is_active: user.is_active
      },
      trading_preferences: tradingPreferences,
      api_credentials: apiCredentials ? {
        client_id: apiCredentials.client_id,
        is_active: apiCredentials.is_active,
        created_at: apiCredentials.created_at
      } : null,
      onboarding_status: {
        has_preferences: hasPreferences,
        has_api_credentials: hasApiCredentials,
        is_real_trading_enabled: isRealTradingEnabled,
        onboarding_complete: onboardingComplete
      }
    });

  } catch (error) {
    console.error('Onboarding status error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
