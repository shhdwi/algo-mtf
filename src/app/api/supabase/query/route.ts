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
      const { data: queryData, error } = await supabase.rpc('exec_sql', { sql: query });
      result = { data: queryData, error: error?.message || null };
    } else if (table && operation) {
      // Execute table operations
      switch (operation) {
        case 'select':
          const { data: selectData, error: selectError } = await supabase
            .from(table)
            .select('*');
          result = { data: selectData, error: selectError?.message || null };
          break;
          
        case 'insert':
          const { data: insertData, error: insertError } = await supabase
            .from(table)
            .insert(data);
          result = { data: insertData, error: insertError?.message || null };
          break;
          
        default:
          result = { data: null, error: 'Unsupported operation' };
      }
    } else {
      result = { data: null, error: 'Invalid request format' };
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Supabase query error:', error);
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Database error' },
      { status: 500 }
    );
  }
}
