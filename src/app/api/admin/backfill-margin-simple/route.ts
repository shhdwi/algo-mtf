import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Simple backfill script that uses a fixed margin percentage
 * This is useful for historical positions where we can't get live margin data
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      dry_run = true,
      margin_percentage = 20, // Default 20% margin = 5x leverage
      target_user_id = null // Optional: backfill for specific user only
    } = await request.json();

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 SIMPLE MARGIN BACKFILL (${dry_run ? 'DRY RUN' : 'LIVE MODE'})`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Margin Percentage: ${margin_percentage}%`);
    console.log(`Leverage: ${(100 / margin_percentage).toFixed(2)}x`);
    if (target_user_id) {
      console.log(`Target User: ${target_user_id}`);
    }
    console.log(`${'='.repeat(80)}\n`);

    // Build query
    let query = supabase
      .from('user_positions')
      .select('id, user_id, symbol, entry_price, entry_quantity, entry_value, entry_date, margin_required')
      .or('margin_required.is.null,margin_required.eq.0')
      .order('entry_time', { ascending: true });

    if (target_user_id) {
      query = query.eq('user_id', target_user_id);
    }

    const { data: positions, error: positionsError } = await query;

    if (positionsError) {
      throw new Error(`Failed to fetch positions: ${positionsError.message}`);
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No positions need margin data backfill',
        total_positions: 0,
        updated: 0
      });
    }

    console.log(`📊 Found ${positions.length} positions without margin data\n`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    const margin_decimal = margin_percentage / 100;
    const leverage = 100 / margin_percentage;

    for (const position of positions) {
      try {
        const entryPrice = parseFloat(position.entry_price);
        const entryQuantity = position.entry_quantity;
        const entryValue = parseFloat(position.entry_value);

        // Calculate margin
        const marginPerShare = entryPrice * margin_decimal;
        const marginRequired = marginPerShare * entryQuantity;

        console.log(`📈 ${position.symbol} (${position.entry_date})`);
        console.log(`   Entry: ₹${entryPrice} × ${entryQuantity} = ₹${entryValue.toFixed(2)}`);
        console.log(`   Margin Per Share: ₹${marginPerShare.toFixed(2)} (${margin_percentage}%)`);
        console.log(`   Margin Required: ₹${marginRequired.toFixed(2)}`);
        console.log(`   Leverage: ${leverage.toFixed(2)}x`);

        if (!dry_run) {
          const { error: updateError } = await supabase
            .from('user_positions')
            .update({
              margin_required: marginRequired,
              leverage: leverage,
              margin_per_share: marginPerShare,
              updated_at: new Date().toISOString()
            })
            .eq('id', position.id);

          if (updateError) {
            console.error(`   ❌ Update failed: ${updateError.message}\n`);
            failCount++;
            results.push({
              position_id: position.id,
              symbol: position.symbol,
              status: 'failed',
              error: updateError.message
            });
            continue;
          }
          console.log(`   ✅ Updated successfully\n`);
        } else {
          console.log(`   ⚠️ DRY RUN - not updated\n`);
        }

        successCount++;
        results.push({
          position_id: position.id,
          user_id: position.user_id,
          symbol: position.symbol,
          entry_date: position.entry_date,
          entry_price: entryPrice,
          entry_quantity: entryQuantity,
          entry_value: entryValue,
          margin_required: marginRequired,
          leverage: leverage,
          margin_per_share: marginPerShare,
          status: 'success'
        });

      } catch (error) {
        console.error(`❌ Error processing ${position.symbol}:`, error);
        failCount++;
        results.push({
          position_id: position.id,
          symbol: position.symbol,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const summary = {
      success: true,
      dry_run,
      configuration: {
        margin_percentage,
        leverage,
        target_user_id
      },
      total_positions: positions.length,
      successful_updates: successCount,
      failed_updates: failCount,
      results: results
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 BACKFILL SUMMARY:');
    console.log(`${'='.repeat(80)}`);
    console.log(`Mode: ${dry_run ? 'DRY RUN ⚠️' : 'LIVE MODE ✅'}`);
    console.log(`Total Positions: ${positions.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`${'='.repeat(80)}\n`);

    if (dry_run) {
      console.log('⚠️ This was a DRY RUN - no data was updated');
      console.log('To apply changes, call this endpoint with { "dry_run": false }\n');
    } else {
      console.log('✅ Margin data has been updated in the database\n');
    }

    return NextResponse.json(summary);

  } catch (error) {
    console.error('Error in simple margin backfill:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Simple margin backfill using fixed percentage',
    usage: {
      method: 'POST',
      body: {
        dry_run: 'boolean (default: true) - set to false to actually update data',
        margin_percentage: 'number (default: 20) - margin percentage (20% = 5x leverage)',
        target_user_id: 'string (optional) - backfill for specific user only'
      },
      examples: {
        dry_run: {
          dry_run: true,
          margin_percentage: 20
        },
        live_all_users: {
          dry_run: false,
          margin_percentage: 20
        },
        live_single_user: {
          dry_run: false,
          margin_percentage: 20,
          target_user_id: '2d12879d-7c62-4937-860c-ad0ae2319e73'
        }
      }
    }
  });
}

