# WhatsApp Communication Service

This service allows you to send WhatsApp messages using the WhatsApp Business API.

## Setup

1. Create a `.env.local` file in the root directory with the following variables:
```bash
WHATSAPP_API_URL=https://graph.facebook.com/v22.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
```

2. Replace the placeholder values with your actual WhatsApp Business API credentials.

## Usage

### API Endpoint

**POST** `/api/whatsapp/send`

#### Request Body
```json
{
  "phoneNumber": "+917977814522",
  "message1": "Reliance Industries: +1.5% at ₹2850.00",
  "message2": "Tata Motors: -0.8% at ₹975.50", 
  "message3": "Infosys Ltd: +2.1% at ₹1502.25",
  "message4": "HDFC Bank: Unchanged at ₹1700.00"
}
```

#### Response
```json
{
  "success": true,
  "messageId": "wamid.HBgMOTE3OTc3ODE0NTIyFQIAERgSMUQ1MjRDNkY0ODAxQjlFMENDAA==",
  "message": "WhatsApp message sent successfully"
}
```

### Using the Service Directly

```typescript
import WhatsAppService from '@/services/whatsappService';

const whatsappService = new WhatsAppService();

const result = await whatsappService.sendMessage({
  phoneNumber: "+917977814522",
  message1: "Your first message",
  message2: "Your second message", 
  message3: "Your third message",
  message4: "Your fourth message"
});

if (result.success) {
  console.log('Message sent:', result.messageId);
} else {
  console.error('Error:', result.error);
}
```

### Testing

Use the test utility:
```typescript
import { testWhatsAppMessage } from '@/utils/testWhatsApp';

// Test the service
testWhatsAppMessage().then(console.log).catch(console.error);
```

### cURL Example

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+917977814522",
    "message1": "Reliance Industries: +1.5% at ₹2850.00",
    "message2": "Tata Motors: -0.8% at ₹975.50",
    "message3": "Infosys Ltd: +2.1% at ₹1502.25", 
    "message4": "HDFC Bank: Unchanged at ₹1700.00"
  }'
```

## Features

- ✅ Validates phone number format
- ✅ Supports Indian phone numbers (automatically adds +91 prefix)
- ✅ Error handling and proper response formatting
- ✅ TypeScript support with proper types
- ✅ Template-based messaging using `portfolio_update_earnings` template
- ✅ Alternative simple text messaging method

## Error Handling

The service handles various error scenarios:
- Invalid phone numbers
- Missing required parameters
- WhatsApp API errors
- Network failures

All errors are properly caught and returned with descriptive messages.
