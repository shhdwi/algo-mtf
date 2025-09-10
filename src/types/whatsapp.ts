export interface WhatsAppMessageRequest {
  phoneNumber: string;
  message1: string;
  message2: string;
  message3: string;
  message4: string;
  recipient?: string;
  message?: string;
  template?: string;
  parameters?: string[];
}

export interface WhatsAppMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text';
  text: string;
}

export interface WhatsAppTemplateComponent {
  type: 'body';
  parameters: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
  };
  components: WhatsAppTemplateComponent[];
}

export interface WhatsAppApiRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: WhatsAppTemplate;
}

export interface WhatsAppApiResponse {
  messages?: Array<{
    id: string;
  }>;
  error?: {
    message: string;
    code: number;
  };
}

export interface WhatsAppApiError {
  error: {
    message: string;
    code: number;
  };
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}
