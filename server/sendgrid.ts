import { EmailMessage } from "@shared/schema";
import sgMail from "@sendgrid/mail";

// Service for interacting with SendGrid API
export class SendGridService {
  private apiKey: string;
  private fromEmail: string;
  private isConfigured: boolean = false;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || "";
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || "noreply@unicomms.io";
    
    // Check if SendGrid API key is properly configured
    if (!this.apiKey) {
      console.warn("SendGrid API key not configured. Email service will use simulation mode.");
      this.isConfigured = false;
    } else {
      try {
        // Initialize SendGrid client with the provided API key
        sgMail.setApiKey(this.apiKey);
        this.isConfigured = true;
        console.log("SendGrid email service initialized successfully.");
      } catch (error) {
        console.error("Failed to initialize SendGrid email service:", error);
        this.isConfigured = false;
      }
    }
  }

  async sendEmail(to: string, subject: string, body: string, from?: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const fromAddress = from || this.fromEmail;
      console.log(`Sending email from ${fromAddress} to ${to}: ${subject}`);
      
      // If SendGrid is not configured, use simulation
      if (!this.isConfigured) {
        console.log("Using simulated email sending (SendGrid API key not configured)");
        return {
          success: true,
          messageId: `SG.${Math.random().toString(36).substring(2, 15)}`
        };
      }
      
      // Use SendGrid to send real email
      const msg = {
        to,
        from: fromAddress,
        subject,
        text: body,
        html: body,
      };
      
      const response = await sgMail.send(msg);
      const messageId = response[0]?.headers['x-message-id'] || '';
      console.log(`Email sent successfully with message ID: ${messageId}`);
      
      return {
        success: true,
        messageId
      };
    } catch (error) {
      console.error("Failed to send email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async sendBulkEmails(recipients: string[], subject: string, body: string, from?: string): Promise<{
    success: boolean;
    messageIds?: string[];
    error?: string;
  }> {
    try {
      const fromAddress = from || this.fromEmail;
      console.log(`Sending bulk email from ${fromAddress} to ${recipients.length} recipients: ${subject}`);
      
      // If SendGrid is not configured, use simulation
      if (!this.isConfigured) {
        console.log("Using simulated bulk email sending (SendGrid API key not configured)");
        return {
          success: true,
          messageIds: recipients.map(() => `SG.${Math.random().toString(36).substring(2, 15)}`)
        };
      }
      
      // Use SendGrid to send real bulk emails
      const messages = recipients.map(recipient => ({
        to: recipient,
        from: fromAddress,
        subject,
        text: body,
        html: body,
      }));
      
      const response = await sgMail.send(messages);
      const messageIds = response[0]?.headers['x-message-id'] 
        ? [response[0].headers['x-message-id']] 
        : recipients.map(() => '');
      
      console.log(`${recipients.length} bulk emails sent successfully`);
      
      return {
        success: true,
        messageIds
      };
    } catch (error) {
      console.error("Failed to send bulk emails:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  // For development/testing: generate a mock email message
  generateMockEmailMessage(userId: number): Partial<EmailMessage> {
    const subjects = [
      "Monthly Newsletter", 
      "Product Update", 
      "Special Offer",
      "Account Update"
    ];
    const recipient = `user${Math.floor(Math.random() * 1000)}@example.com`;
    
    return {
      userId,
      to: recipient,
      from: this.fromEmail,
      subject: subjects[Math.floor(Math.random() * subjects.length)],
      body: "This is a sample email message body. It would contain the full content in a real application.",
      status: Math.random() > 0.9 ? 'failed' : 'delivered',
    };
  }
}

export const sendGridService = new SendGridService();
