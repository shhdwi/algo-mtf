import { WhatsAppMessageRequest, WhatsAppApiResponse, WhatsAppApiError, SendMessageResponse } from '@/types/whatsapp';

class WhatsAppService {
  private readonly apiUrl: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v22.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '541000889093561';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';

    if (!this.accessToken) {
      throw new Error('WhatsApp access token is required');
    }
  }

  async sendMessage(request: WhatsAppMessageRequest): Promise<SendMessageResponse> {
    try {
      // Validate phone number format
      const cleanPhoneNumber = this.formatPhoneNumber(request.phoneNumber);
      
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhoneNumber,
        type: "template",
        template: {
          name: "portfolio_update_earnings",
          language: {
            code: "en"
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: request.message1
                },
                {
                  type: "text",
                  text: request.message2
                },
                {
                  type: "text",
                  text: request.message3
                },
                {
                  type: "text",
                  text: request.message4
                }
              ]
            }
          ]
        }
      };

      const response = await fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as WhatsAppApiError;
        return {
          success: false,
          error: error.error?.message || 'Failed to send WhatsApp message'
        };
      }

      const successData = data as WhatsAppApiResponse;
      return {
        success: true,
        messageId: successData.messages?.[0]?.id
      };

    } catch (error) {
      console.error('WhatsApp service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add + if not present and number doesn't start with country code
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    
    return '+' + cleaned;
  }

  // Alternative method for sending simple text messages (if you have a different template)
  async sendSimpleMessage(phoneNumber: string, message: string): Promise<SendMessageResponse> {
    try {
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);
      
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhoneNumber,
        type: "text",
        text: {
          body: message
        }
      };

      const response = await fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data as WhatsAppApiError;
        return {
          success: false,
          error: error.error?.message || 'Failed to send WhatsApp message'
        };
      }

      const successData = data as WhatsAppApiResponse;
      return {
        success: true,
        messageId: successData.messages?.[0]?.id
      };

    } catch (error) {
      console.error('WhatsApp service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export default WhatsAppService;
