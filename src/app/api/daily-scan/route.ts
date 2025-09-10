import { NextRequest, NextResponse } from 'next/server';
import UltimateScannerService from '@/services/ultimateScannerService';
import PositionManagerService from '@/services/positionManagerService';
import { ExchangeCode } from '@/types/chart';

export async function POST(request: NextRequest) {
  try {
    const body: { exchange?: ExchangeCode; send_whatsapp?: boolean } = await request.json();
    const exchange = body.exchange || 'NSE';
    const sendWhatsApp = body.send_whatsapp !== false; // Default to true

    console.log('🚀 Starting Daily Position-Managed Scan (3:15 PM IST)...');
    
    const scanner = new UltimateScannerService();
    const scanResults = await scanner.ultimateScanWithPositionManagement(exchange, sendWhatsApp);
    
    console.log('✅ Daily scan completed successfully!');

    return NextResponse.json({
      success: true,
      scan_results: scanResults.summary,
      position_management: scanResults.position_management,
      entry_signals: scanResults.results.filter(r => r.signal === 'ENTRY').map(r => ({
        symbol: r.symbol,
        current_price: r.current_price,
        reasoning: r.reasoning
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Daily Scan API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const positionManager = new PositionManagerService();
    const positionsData = await positionManager.getPositionsWithSummary();
    
    return NextResponse.json({
      success: true,
      positions: positionsData.positions,
      summary: positionsData.summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Positions API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
