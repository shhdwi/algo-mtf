// Test utility for WhatsApp service
// This file can be used to test the WhatsApp service functionality

export const testWhatsAppMessage = async () => {
  const testData = {
    phoneNumber: "+917977814522", // Replace with your test number
    message1: "Reliance Industries: +1.5% at ₹2850.00",
    message2: "Tata Motors: -0.8% at ₹975.50",
    message3: "Infosys Ltd: +2.1% at ₹1502.25",
    message4: "HDFC Bank: Unchanged at ₹1700.00"
  };

  try {
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    console.log('WhatsApp API Response:', result);
    return result;
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
};

// Example usage:
// testWhatsAppMessage().then(console.log).catch(console.error);
