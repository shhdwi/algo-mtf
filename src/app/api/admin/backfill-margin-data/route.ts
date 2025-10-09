import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import LemonTradingService from '@/services/lemonTradingService';

export async function POST(request: NextRequest) {
  try {
    const { dry_run = true } = await request.json();

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    console.log(`🔄 Starting margin data backfill (${dry_run ? 'DRY RUN' : 'LIVE MODE'})...`);

    // Get all user positions without margin data
    const { data: positions, error: positionsError } = await supabase
      .from('user_positions')
      .select('id, user_id, symbol, entry_price, entry_quantity, entry_value, margin_required')
      .or('margin_required.is.null,margin_required.eq.0')
      .order('entry_time', { ascending: true });

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

    console.log(`📊 Found ${positions.length} positions without margin data`);

    const lemonService = new LemonTradingService();
    const results = [];
    let successCount = 0;
    let failCount = 0;
    const skipCount = 0;

    // Group positions by user_id to optimize API calls
    const positionsByUser = positions.reduce((acc, pos) => {
      if (!acc[pos.user_id]) {
        acc[pos.user_id] = [];
      }
      acc[pos.user_id].push(pos);
      return acc;
    }, {} as Record<string, typeof positions>);

    for (const [userId, userPositions] of Object.entries(positionsByUser)) {
      console.log(`\n👤 Processing ${userPositions.length} positions for user ${userId}`);

      // Process positions in batches to avoid rate limiting
      for (const position of userPositions) {
        try {
          console.log(`\n📈 Processing ${position.symbol}...`);
          console.log(`  Entry Price: ₹${position.entry_price}`);
          console.log(`  Quantity: ${position.entry_quantity}`);
          console.log(`  Entry Value: ₹${position.entry_value}`);

          // Calculate margin using Lemon API
          const marginData = await lemonService.calculatePositionSize(
            userId,
            position.symbol,
            parseFloat(position.entry_price)
          );

          if (!marginData || marginData.quantity === 0) {
            console.log(`⚠️ Could not calculate margin for ${position.symbol} (market may be closed or API issue)`);
            
            // Use fallback calculation: 20% margin (5x leverage)
            const fallbackMarginPerShare = parseFloat(position.entry_price) * 0.20;
            const fallbackMarginRequired = position.entry_quantity * fallbackMarginPerShare;
            const fallbackLeverage = parseFloat(position.entry_value) / fallbackMarginRequired;

            console.log(`  Using fallback: 20% margin per share`);
            console.log(`  Margin Required: ₹${fallbackMarginRequired.toFixed(2)}`);
            console.log(`  Leverage: ${fallbackLeverage.toFixed(2)}x`);

            if (!dry_run) {
              const { error: updateError } = await supabase
                .from('user_positions')
                .update({
                  margin_required: fallbackMarginRequired,
                  leverage: fallbackLeverage,
                  margin_per_share: fallbackMarginPerShare,
                  updated_at: new Date().toISOString()
                })
                .eq('id', position.id);

              if (updateError) {
                console.error(`❌ Failed to update ${position.symbol}:`, updateError);
                failCount++;
                results.push({
                  position_id: position.id,
                  symbol: position.symbol,
                  status: 'failed',
                  error: updateError.message,
                  used_fallback: true
                });
                continue;
              }
            }

            successCount++;
            results.push({
              position_id: position.id,
              symbol: position.symbol,
              user_id: userId,
              entry_price: position.entry_price,
              entry_quantity: position.entry_quantity,
              margin_required: fallbackMarginRequired,
              leverage: fallbackLeverage,
              margin_per_share: fallbackMarginPerShare,
              status: 'success',
              used_fallback: true
            });

          } else {
            // Use actual margin data from API
            const marginPerShare = marginData.marginRequired / marginData.quantity;
            
            console.log(`  ✅ Margin Required: ₹${marginData.marginRequired.toFixed(2)}`);
            console.log(`  Leverage: ${marginData.leverage.toFixed(2)}x`);
            console.log(`  Margin Per Share: ₹${marginPerShare.toFixed(2)}`);

            if (!dry_run) {
              const { error: updateError } = await supabase
                .from('user_positions')
                .update({
                  margin_required: marginData.marginRequired,
                  leverage: marginData.leverage,
                  margin_per_share: marginPerShare,
                  updated_at: new Date().toISOString()
                })
                .eq('id', position.id);

              if (updateError) {
                console.error(`❌ Failed to update ${position.symbol}:`, updateError);
                failCount++;
                results.push({
                  position_id: position.id,
                  symbol: position.symbol,
                  status: 'failed',
                  error: updateError.message
                });
                continue;
              }
            }

            successCount++;
            results.push({
              position_id: position.id,
              symbol: position.symbol,
              user_id: userId,
              entry_price: position.entry_price,
              entry_quantity: position.entry_quantity,
              margin_required: marginData.marginRequired,
              leverage: marginData.leverage,
              margin_per_share: marginPerShare,
              status: 'success',
              used_fallback: false
            });
          }

          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

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
    }

    const summary = {
      success: true,
      dry_run,
      total_positions: positions.length,
      successful_updates: successCount,
      failed_updates: failCount,
      skipped: skipCount,
      results: results
    };

    console.log('\n' + '='.repeat(80));
    console.log('📊 BACKFILL SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Mode: ${dry_run ? 'DRY RUN ⚠️' : 'LIVE MODE ✅'}`);
    console.log(`Total Positions: ${positions.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏭️  Skipped: ${skipCount}`);
    console.log('='.repeat(80));

    if (dry_run) {
      console.log('\n⚠️ This was a DRY RUN - no data was updated');
      console.log('To apply changes, call this endpoint with { "dry_run": false }');
    }

    return NextResponse.json(summary);

  } catch (error) {
    console.error('Error in margin backfill:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to backfill margin data',
    usage: {
      method: 'POST',
      body: {
        dry_run: 'boolean (default: true) - set to false to actually update data'
      }
    }
  });
}

