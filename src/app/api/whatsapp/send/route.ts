import { NextRequest, NextResponse } from 'next/server';
import WhatsAppService from '@/services/whatsappService';
import { WhatsAppMessageRequest } from '@/types/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body: WhatsAppMessageRequest = await request.json();

    // Validate required fields
    const { phoneNumber, message1, message2, message3, message4 } = body;
    
    if (!phoneNumber || !message1 || !message2 || !message3 || !message4) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'All fields are required: phoneNumber, message1, message2, message3, message4' 
        },
        { status: 400 }
      );
    }

    // Initialize WhatsApp service
    const whatsappService = new WhatsAppService();
    
    // Send message
    const result = await whatsappService.sendMessage(body);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'WhatsApp message sent successfully'
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// Optional: GET method to check API health
export async function GET() {
  return NextResponse.json({
    message: 'WhatsApp API endpoint is working',
    timestamp: new Date().toISOString()
  });
}
