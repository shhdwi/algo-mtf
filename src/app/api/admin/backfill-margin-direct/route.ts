import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Backfill script that directly calls Lemon API margin-info endpoint
 * to get actual margin requirements for each stock
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      dry_run = true,
      user_id = null // If not provided, will pick first active user with credentials
    } = await request.json();

    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://yvvqgxqxmsccswmuwvdj.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dnFneHF4bXNjY3N3bXV3dmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0MTgyNjIsImV4cCI6MjA3Mjk5NDI2Mn0.T9-4zMdNu5WoO4QG7TttDULjaDQybl2ZVkS8xvIullI'
    );

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 DIRECT MARGIN API BACKFILL (${dry_run ? 'DRY RUN' : 'LIVE MODE'})`);
    console.log(`${'='.repeat(80)}\n`);

    // Get a user with API credentials
    let targetUserId = user_id;
    if (!targetUserId) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, is_active')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (usersError || !users) {
        throw new Error('No active users found');
      }
      targetUserId = users.id;
      console.log(`Using user: ${users.full_name} (${targetUserId})\n`);
    }

    // Get API credentials
    const { data: credentials, error: credError } = await supabase
      .from('api_credentials')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .single();

    if (credError || !credentials) {
      throw new Error(`No API credentials found for user ${targetUserId}`);
    }

    // Decrypt credentials using the same method as lemonTradingService
    const decrypt = (encryptedText: string): string => {
      const parts = encryptedText.split('.');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }
      return Buffer.from(parts[0], 'base64').toString('utf8');
    };

    const publicKey = decrypt(credentials.public_key_encrypted);
    const privateKey = decrypt(credentials.private_key_encrypted);
    const clientId = credentials.client_id;

    console.log(`✅ API credentials loaded`);
    console.log(`🔄 Refreshing access token...\n`);

    // Generate Ed25519 signature for token refresh (same as lemonTradingService)
    
    const createEd25519PrivateKeyPEM = (privateKeyBytes: Buffer): string => {
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
    };
    
    const generateSignature = (clientId: string, privateKey: string) => {
      const epochTime = Date.now().toString();
      const message = clientId + epochTime;
      
      try {
        // Convert private key from hex to bytes (32 bytes for Ed25519)
        const privateKeyBytes = Buffer.from(privateKey, 'hex');
        
        if (privateKeyBytes.length !== 32) {
          throw new Error(`Invalid private key length: expected 32 bytes, got ${privateKeyBytes.length}`);
        }
        
        // Create Ed25519 private key in PEM format
        const privateKeyPem = createEd25519PrivateKeyPEM(privateKeyBytes);
        const keyObject = crypto.createPrivateKey(privateKeyPem);
        
        // Sign the message (UTF-8 encoded)
        const messageBytes = Buffer.from(message, 'utf-8');
        const signatureBuffer = crypto.sign(null, messageBytes, keyObject);
        const signature = signatureBuffer.toString('hex');
        
        return { epochTime, signature };
        
      } catch (error) {
        console.error('Signature generation error:', error);
        throw new Error(`Failed to generate Ed25519 signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    const { epochTime, signature } = generateSignature(clientId, privateKey);

    // Get fresh access token
    const LEMON_BASE_URL = 'https://cs-prod.lemonn.co.in';
    const tokenResponse = await fetch(`${LEMON_BASE_URL}/api-trading/api/v1/generate_access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': publicKey,
        'x-epoch-time': epochTime,
        'x-signature': signature
      },
      body: JSON.stringify({ client_id: clientId })
    });

    const tokenResult = await tokenResponse.json();

    if (tokenResult.status !== 'success' || !tokenResult.data?.access_token) {
      throw new Error(`Failed to refresh access token: ${JSON.stringify(tokenResult)}`);
    }

    const accessToken = tokenResult.data.access_token;
    console.log(`✅ Access token refreshed successfully\n`);

    // Get all positions without margin data
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
        total_positions: 0
      });
    }

    console.log(`📊 Found ${positions.length} positions without margin data\n`);

    // Group by unique symbols to minimize API calls
    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];
    console.log(`🎯 ${uniqueSymbols.length} unique symbols to process\n`);

    const marginCache: Record<string, { margin_per_share: number; leverage: number }> = {};
    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Fetch margin data for each unique symbol
    for (const symbol of uniqueSymbols) {
      try {
        console.log(`\n📈 Fetching margin for ${symbol}...`);

        const marginPayload = {
          symbol,
          exchange: 'NSE',
          transactionType: 'BUY',
          price: '1000', // Use a reference price
          quantity: '1',
          productType: 'MARGIN'
        };

        const response = await fetch(`${LEMON_BASE_URL}/api-trading/api/v2/margin-info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publicKey,
            'x-auth-key': accessToken,
            'x-client-id': clientId
          },
          body: JSON.stringify(marginPayload)
        });

        const result = await response.json();

        if (result.status === 'success' && result.data) {
          const approximateMargin = parseFloat(result.data.approximateMargin || '0');
          
          if (approximateMargin > 0) {
            // Calculate margin percentage based on reference price
            const marginPercentage = (approximateMargin / 1000) * 100;
            const leverage = 100 / marginPercentage;
            
            marginCache[symbol] = {
              margin_per_share: marginPercentage / 100, // Store as decimal
              leverage: leverage
            };
            
            console.log(`  ✅ Margin: ${marginPercentage.toFixed(2)}% | Leverage: ${leverage.toFixed(2)}x`);
          } else {
            console.log(`  ⚠️ API returned 0 margin, using fallback 20%`);
            marginCache[symbol] = {
              margin_per_share: 0.20,
              leverage: 5
            };
          }
        } else {
          console.log(`  ⚠️ API error, using fallback 20%`);
          marginCache[symbol] = {
            margin_per_share: 0.20,
            leverage: 5
          };
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`  ❌ Error fetching margin for ${symbol}:`, error);
        marginCache[symbol] = {
          margin_per_share: 0.20,
          leverage: 5
        };
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 UPDATING POSITIONS WITH MARGIN DATA');
    console.log(`${'='.repeat(80)}\n`);

    // Now update all positions with cached margin data
    for (const position of positions) {
      try {
        const marginData = marginCache[position.symbol];
        const entryPrice = parseFloat(position.entry_price);
        const marginPerShare = entryPrice * marginData.margin_per_share;
        const marginRequired = marginPerShare * position.entry_quantity;

        console.log(`📈 ${position.symbol}`);
        console.log(`   Entry: ₹${entryPrice} × ${position.entry_quantity}`);
        console.log(`   Margin/Share: ₹${marginPerShare.toFixed(2)} (${(marginData.margin_per_share * 100).toFixed(2)}%)`);
        console.log(`   Total Margin: ₹${marginRequired.toFixed(2)}`);
        console.log(`   Leverage: ${marginData.leverage.toFixed(2)}x`);

        if (!dry_run) {
          const { error: updateError } = await supabase
            .from('user_positions')
            .update({
              margin_required: marginRequired,
              leverage: marginData.leverage,
              margin_per_share: marginPerShare,
              updated_at: new Date().toISOString()
            })
            .eq('id', position.id);

          if (updateError) {
            console.log(`   ❌ Update failed: ${updateError.message}\n`);
            failCount++;
            results.push({
              position_id: position.id,
              symbol: position.symbol,
              status: 'failed',
              error: updateError.message
            });
            continue;
          }
          console.log(`   ✅ Updated\n`);
        } else {
          console.log(`   ⚠️ DRY RUN - not updated\n`);
        }

        successCount++;
        results.push({
          position_id: position.id,
          symbol: position.symbol,
          margin_required: marginRequired,
          leverage: marginData.leverage,
          margin_per_share: marginPerShare,
          status: 'success'
        });

      } catch (error) {
        console.error(`❌ Error processing ${position.symbol}:`, error);
        failCount++;
      }
    }

    const summary = {
      success: true,
      dry_run,
      total_positions: positions.length,
      unique_symbols: uniqueSymbols.length,
      successful_updates: successCount,
      failed_updates: failCount,
      margin_cache: marginCache,
      sample_results: results.slice(0, 10)
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 BACKFILL SUMMARY:');
    console.log(`${'='.repeat(80)}`);
    console.log(`Mode: ${dry_run ? 'DRY RUN ⚠️' : 'LIVE MODE ✅'}`);
    console.log(`Total Positions: ${positions.length}`);
    console.log(`Unique Symbols: ${uniqueSymbols.length}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`${'='.repeat(80)}\n`);

    if (dry_run) {
      console.log('⚠️ This was a DRY RUN - no data was updated');
      console.log('To apply changes, call this endpoint with { "dry_run": false }\n');
    }

    return NextResponse.json(summary);

  } catch (error) {
    console.error('Error in direct margin backfill:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Direct margin backfill using Lemon API',
    usage: {
      method: 'POST',
      body: {
        dry_run: 'boolean (default: true)',
        user_id: 'string (optional) - user ID with API credentials'
      }
    }
  });
}

