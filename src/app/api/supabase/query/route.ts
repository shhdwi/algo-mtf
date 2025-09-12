import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { query, table, operation, data } = await request.json();
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let result;
    
    if (query) {
      // Execute raw SQL query
      result = await supabase.rpc('exec_sql', { sql_query: query });
    } else if (table && operation) {
      // Execute table operations
      switch (operation) {
        case 'select':
          result = await supabase.from(table).select('*');
          break;
        case 'insert':
          result = await supabase.from(table).insert(data);
          break;
        case 'update':
          result = await supabase.from(table).update(data.values).eq(data.where.column, data.where.value);
          break;
        case 'delete':
          result = await supabase.from(table).delete().eq(data.where.column, data.where.value);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } else {
      throw new Error('Either query or table+operation must be provided');
    }
    
    return NextResponse.json({
      data: result.data,
      error: result.error?.message || null,
      success: !result.error
    });
  } catch (error) {
    console.error('Supabase query error:', error);
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Database error', success: false },
      { status: 500 }
    );
  }
}
