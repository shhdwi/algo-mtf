import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    console.log('🔍 Register API - Request Body:', requestBody);
    
    const { email, password, full_name, phone_number } = requestBody;

    console.log('🔍 Register API - Phone Number Received:', phone_number);
    console.log('🔍 Register API - Phone Number Length:', phone_number?.length);
    console.log('🔍 Register API - Phone Number Type:', typeof phone_number);

    // Validate required fields
    if (!email || !password || !full_name || !phone_number) {
      return NextResponse.json({
        success: false,
        error: 'All fields are required: email, password, full_name, phone_number'
      }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid email format'
      }, { status: 400 });
    }

    // Extract and validate phone number (handle +91 prefix)
    const cleanPhoneNumber = phone_number.replace(/^\+91/, '').replace(/\D/g, '');
    console.log('🔍 Register API - Clean Phone Number:', cleanPhoneNumber);
    console.log('🔍 Register API - Clean Phone Length:', cleanPhoneNumber.length);
    
    if (!/^\d{10}$/.test(cleanPhoneNumber)) {
      return NextResponse.json({
        success: false,
        error: 'Phone number must be exactly 10 digits',
        debug_info: {
          received: phone_number,
          cleaned: cleanPhoneNumber,
          length: cleanPhoneNumber.length
        }
      }, { status: 400 });
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({
        success: false,
        error: 'Password must be at least 8 characters long'
      }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User with this email already exists'
      }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (store phone number with +91 prefix)
    const formattedPhoneNumber = `+91${cleanPhoneNumber}`;
    console.log('🔍 Register API - Storing Phone Number:', formattedPhoneNumber);
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        full_name,
        phone_number: formattedPhoneNumber
      })
      .select('id, email, full_name')
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create user account'
      }, { status: 500 });
    }

    console.log(`✅ User registered: ${email}`);

    return NextResponse.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
