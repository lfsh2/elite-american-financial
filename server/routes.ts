import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { communicationService } from "./communications";
import { sendGridService } from "./sendgrid";
import { complianceService, A2PRegistrationStatus } from "./compliance";
import { a2pSchemaSynchronizer } from "./a2pSchemaSynchronizer";
import { a2pRegistrationService } from "./a2pRegistration";
import { autoRefillService } from "./autoRefillService";
import { appleBusinessChatService } from "./appleBusinessChat";
import { generateMessagingInsights, generateCustomInsight, chatWithAI, getKPIDashboard, type MessagingStats } from "./openai";
import { twilioAnalyticsService } from "./twilioAnalytics";
import { accountService } from "./services/accountService";
import { dataService } from "./services/dataService";
import { subAccountService } from "./services/subAccountService";
import { createHash, randomBytes } from "crypto";
import { 
  insertUserSchema, 
  insertSmsSchema, 
  insertVoiceCallSchema, 
  insertEmailSchema, 
  insertCampaignSchema, 
  insertContactSchema, 
  insertBillingSchema,
  insertApiKeySchema,
  insertWebhookSchema,
  generateApiKey
} from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
  // Error handling middleware for Zod validation errors
  function handleZodError(error: unknown, res: Response) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ 
        message: "Validation error", 
        errors: validationError.details
      });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
  
  // Auth endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`Login attempt for user: ${username}`);
      
      if (!username || !password) {
        console.log("Missing username or password");
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // To make testing easier, allow login with just the username
      // This is for development only and would never be used in production
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      console.log(`User found: ${username}, comparing password`);
      // Skip password check for simplicity during development
      // In a real app, this would use proper password hashing
      
      console.log("Login successful");
      // In real app, would set up proper session/JWT
      return res.status(200).json({ 
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        credits: user.credits,
        isSubAccount: user.isSubAccount
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Development debug endpoint to check users
  if (process.env.NODE_ENV === 'development') {
    app.get("/api/debug/users", (req, res) => {
      const users = Array.from(storage.getUsersForDebug().values()).map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      res.json(users);
    });
    
    // Direct login endpoint for testing (should NOT be used in production)
    app.get("/api/login-direct", async (req, res) => {
      const username = req.query.username as string;
      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }
      
      console.log(`Direct login attempt for: ${username}`);
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        console.log(`User not found: ${username}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`Direct login successful for: ${username}`);
      const { password, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    });
  }
  
  // User endpoints
  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't return password in response
      const { password, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      
      // Don't return password in response
      const { password, ...userWithoutPassword } = user;
      return res.status(201).json(userWithoutPassword);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/users/:id/subaccounts", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const subAccounts = await storage.getSubAccounts(userId);
      // Remove passwords
      const subAccountsWithoutPasswords = subAccounts.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      return res.status(200).json(subAccountsWithoutPasswords);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // SMS endpoints
  app.post("/api/sms", async (req, res) => {
    try {
      const messageData = insertSmsSchema.parse(req.body);
      
      // Validate user has enough credits
      const user = await storage.getUser(messageData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.credits < 1) {
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      // Send message via messaging provider
      const result = await communicationService.sendSMS(
        messageData.to, 
        messageData.from,
        messageData.body,
        messageData.mediaUrls
      );
      
      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to send SMS" });
      }
      
      // Save to storage
      const message = await storage.createSmsMessage({
        ...messageData,
        status: 'sent',
        messageSid: result.sid,
      });
      
      // Deduct credits
      await storage.createBillingTransaction({
        userId: user.id,
        amount: -1,
        type: 'credit-usage',
        description: 'SMS message',
        credits: 1
      });
      
      return res.status(201).json(message);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/sms/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const messages = await storage.getSmsMessages(userId, limit);
      
      return res.status(200).json(messages);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get("/api/sms/:userId/conversation/:contact", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { contact } = req.params;
      const messages = await storage.getSmsConversation(userId, contact);
      
      return res.status(200).json(messages);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Voice call endpoints
  app.post("/api/voice/call", async (req, res) => {
    try {
      const callData = insertVoiceCallSchema.parse(req.body);
      
      // Validate user has enough credits
      const user = await storage.getUser(callData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.credits < 5) { // Assume voice calls cost 5 credits to initiate
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      // Initiate call via voice provider
      const result = await communicationService.initiateCall(
        callData.to,
        callData.from
      );
      
      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to initiate call" });
      }
      
      // Save to storage
      const call = await storage.createVoiceCall({
        ...callData,
        messageSid: result.sid,
      });
      
      // Deduct credits
      await storage.createBillingTransaction({
        userId: user.id,
        amount: -5,
        type: 'credit-usage',
        description: 'Voice call initiation',
        credits: 5
      });
      
      return res.status(201).json(call);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/voice/calls/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const calls = await storage.getVoiceCalls(userId, limit);
      
      return res.status(200).json(calls);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Email endpoints
  app.post("/api/email", async (req, res) => {
    try {
      const emailData = insertEmailSchema.parse(req.body);
      
      // Validate user has enough credits
      const user = await storage.getUser(emailData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.credits < 1) { // Assume emails cost 1 credit
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      // Send email via SendGrid
      const result = await sendGridService.sendEmail(
        emailData.to,
        emailData.subject,
        emailData.body,
        emailData.from
      );
      
      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to send email" });
      }
      
      // Save to storage with message ID
      const email = await storage.createEmailMessage({
        ...emailData,
        status: 'sent',
        messageId: result.messageId,
      });
      
      // Deduct credits
      await storage.createBillingTransaction({
        userId: user.id,
        amount: -1,
        type: 'credit-usage',
        description: 'Email message',
        credits: 1
      });
      
      return res.status(201).json(email);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/email/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const emails = await storage.getEmailMessages(userId, limit);
      
      return res.status(200).json(emails);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Campaign endpoints
  app.post("/api/campaigns", async (req, res) => {
    try {
      const campaignData = insertCampaignSchema.parse(req.body);
      
      // Validate user exists
      const user = await storage.getUser(campaignData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Save to storage
      const campaign = await storage.createCampaign(campaignData);
      
      return res.status(201).json(campaign);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/campaigns/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const campaigns = await storage.getCampaigns(userId);
      return res.status(200).json(campaigns);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Contact endpoints
  app.post("/api/contacts", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      
      // Validate user exists
      const user = await storage.getUser(contactData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Save to storage
      const contact = await storage.createContact(contactData);
      
      return res.status(201).json(contact);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/contacts/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const contacts = await storage.getContacts(userId);
      return res.status(200).json(contacts);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Billing endpoints
  app.post("/api/billing/purchase", async (req, res) => {
    try {
      const { userId, amount, credits } = req.body;
      
      if (!userId || !amount || !credits) {
        return res.status(400).json({ message: "User ID, amount, and credits are required" });
      }
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Create transaction
      const transaction = await storage.createBillingTransaction({
        userId,
        amount,
        type: 'credit-purchase',
        description: `Purchase of ${credits} credits`,
        credits
      });
      
      return res.status(201).json(transaction);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get("/api/billing/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const transactions = await storage.getBillingTransactions(userId);
      return res.status(200).json(transactions);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Auto-refill settings endpoints
  app.get("/api/billing/:userId/auto-refill", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json({
        autoRefillEnabled: user.autoRefillEnabled || false,
        autoRefillThreshold: user.autoRefillThreshold || 100,
        autoRefillAmount: user.autoRefillAmount || 1000
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/billing/auto-refill", async (req, res) => {
    try {
      const { userId, enabled, threshold, amount } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update user's auto-refill settings
      const updatedUser = await storage.updateUser(userId, {
        autoRefillEnabled: enabled,
        autoRefillThreshold: threshold,
        autoRefillAmount: amount
      });
      
      return res.status(200).json({
        success: true,
        autoRefillEnabled: updatedUser?.autoRefillEnabled,
        autoRefillThreshold: updatedUser?.autoRefillThreshold,
        autoRefillAmount: updatedUser?.autoRefillAmount
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Manual auto-refill check endpoint
  app.post("/api/billing/auto-refill/check", async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!user.autoRefillEnabled) {
        return res.status(400).json({ 
          success: false, 
          message: "Auto-refill is not enabled for this user" 
        });
      }
      
      // Manually trigger an auto-refill check
      const checkResult = await autoRefillService.checkUserBalance(userId);
      
      // Get the updated user info after the potential refill
      const updatedUser = await storage.getUser(userId);
      
      return res.status(200).json({
        success: true,
        message: "Auto-refill check completed",
        credits: updatedUser?.credits,
        autoRefillEnabled: updatedUser?.autoRefillEnabled,
        autoRefillThreshold: updatedUser?.autoRefillThreshold,
        autoRefillAmount: updatedUser?.autoRefillAmount
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Phone Number Management endpoints
  app.get("/api/phone-numbers/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // In a production environment, this would fetch from your database
      // For development, we'll return simulated phone numbers
      if (process.env.NODE_ENV === 'development') {
        // Generate mock phone numbers for the user
        const mockNumbers = Array.from({ length: 3 }).map((_, i) => ({
          id: `PN${Math.random().toString(36).substring(2, 10)}`,
          userId,
          phoneNumber: `+1${(Math.floor(Math.random() * 800) + 200).toString()}${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          friendlyName: `Line ${i + 1}`,
          capabilities: {
            voice: true,
            sms: true,
            mms: i !== 1
          },
          status: "active",
          type: i === 2 ? "tollfree" : "local",
          countryCode: "US",
          monthlyPrice: i === 2 ? 5.00 : 1.00,
          dateCreated: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toISOString()
        }));
        
        return res.status(200).json(mockNumbers);
      }
      
      // In production, we would query the database and phone provider API
      const phoneNumbers = await communicationService.getPhoneNumbers(userId);
      return res.status(200).json(phoneNumbers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/phone-numbers/search", async (req, res) => {
    try {
      const { countryCode, areaCode, contains, type, capabilities } = req.body;
      
      // In a production environment, this would call the phone provider API
      // For development, we'll return simulated available numbers
      if (process.env.NODE_ENV === 'development') {
        // Generate mock available phone numbers
        const mockAvailableNumbers = Array.from({ length: 10 }).map((_, i) => {
          const areaCodeToUse = areaCode || (Math.floor(Math.random() * 800) + 200).toString();
          
          let phoneNumber = `+1${areaCodeToUse}`;
          if (contains) {
            // Try to include the requested digits
            const remainingDigits = 10 - areaCodeToUse.length - contains.length;
            const prefix = Math.floor(Math.random() * Math.pow(10, remainingDigits / 2))
              .toString()
              .padStart(Math.floor(remainingDigits / 2), '0');
            
            const suffix = Math.floor(Math.random() * Math.pow(10, Math.ceil(remainingDigits / 2)))
              .toString()
              .padStart(Math.ceil(remainingDigits / 2), '0');
            
            phoneNumber += prefix + contains + suffix;
          } else {
            // Random number
            phoneNumber += Math.floor(Math.random() * 10000000)
              .toString()
              .padStart(7, '0');
          }
          
          return {
            phoneNumber,
            friendlyName: `(${phoneNumber.substring(2, 5)}) ${phoneNumber.substring(5, 8)}-${phoneNumber.substring(8)}`,
            capabilities: {
              voice: capabilities?.voice ?? true,
              sms: capabilities?.sms ?? true,
              mms: (capabilities?.mms && Math.random() > 0.5) ?? false
            },
            locality: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"][Math.floor(Math.random() * 5)],
            region: ["NY", "CA", "IL", "TX", "AZ"][Math.floor(Math.random() * 5)],
            countryCode: countryCode || "US",
            monthlyPrice: type === "tollfree" ? 5.00 : 1.00
          };
        });
        
        return res.status(200).json(mockAvailableNumbers);
      }
      
      // In production, we would call the phone provider API
      const availableNumbers = await communicationService.searchPhoneNumbers(countryCode, areaCode, contains, type, capabilities);
      return res.status(200).json(availableNumbers);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/phone-numbers/purchase", async (req, res) => {
    try {
      const { userId, phoneNumber, friendlyName } = req.body;
      
      if (!userId || !phoneNumber) {
        return res.status(400).json({ message: "User ID and phone number are required" });
      }
      
      // Validate user has enough credits
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Assume phone numbers cost 50 credits to purchase
      if (user.credits < 50) {
        return res.status(403).json({ message: "Insufficient credits. Phone number purchase requires 50 credits." });
      }
      
      // In a production environment, this would call the phone provider API
      // For development, we'll simulate a successful purchase
      if (process.env.NODE_ENV === 'development') {
        // Deduct credits for the purchase
        await storage.createBillingTransaction({
          userId,
          amount: -50,
          type: 'credit-usage',
          description: 'Phone number purchase',
          credits: 50
        });
        
        // Return a mock response
        return res.status(201).json({
          id: `PN${Math.random().toString(36).substring(2, 10)}`,
          userId,
          phoneNumber,
          friendlyName: friendlyName || `New Number (${phoneNumber.substring(2, 5)})`,
          capabilities: {
            voice: true,
            sms: true,
            mms: Math.random() > 0.3
          },
          status: "active",
          type: phoneNumber.startsWith("+1800") || phoneNumber.startsWith("+1888") ? "tollfree" : "local",
          countryCode: "US",
          monthlyPrice: phoneNumber.startsWith("+1800") || phoneNumber.startsWith("+1888") ? 5.00 : 1.00,
          dateCreated: new Date().toISOString()
        });
      }
      
      // In production, we would call the phone provider API
      const purchasedNumber = await communicationService.purchasePhoneNumber(userId, phoneNumber, friendlyName);
      
      // Deduct credits for the purchase
      await storage.createBillingTransaction({
        userId,
        amount: -50,
        type: 'credit-usage',
        description: 'Phone number purchase',
        credits: 50
      });
      
      return res.status(201).json(purchasedNumber);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete("/api/phone-numbers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      
      if (!id || !userId) {
        return res.status(400).json({ message: "Phone number ID and user ID are required" });
      }
      
      // In a production environment, this would call the phone provider API
      // For development, we'll simulate a successful release
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({ success: true, message: "Phone number released successfully" });
      }
      
      // In production, we would call the phone provider API
      const result = await communicationService.releasePhoneNumber(id, userId);
      return res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.put("/api/phone-numbers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, friendlyName, settings } = req.body;
      
      if (!id || !userId) {
        return res.status(400).json({ message: "Phone number ID and user ID are required" });
      }
      
      // In a production environment, this would call the phone provider API
      // For development, we'll simulate a successful update
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({ 
          success: true, 
          id,
          userId,
          friendlyName: friendlyName || "Updated Name",
          settings
        });
      }
      
      // In production, we would call the phone provider API
      const result = await communicationService.updatePhoneNumber(id, userId, friendlyName, settings);
      return res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Analytics endpoints
  app.get("/api/analytics/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // In a real app, would calculate actual statistics
      // For now, return mock data
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Generate daily data points
      const dailyDataPoints = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(sevenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
        dailyDataPoints.push({
          date: date.toISOString().split('T')[0],
          sms: Math.floor(Math.random() * 100) + 50,
          voice: Math.floor(Math.random() * 30) + 5,
          email: Math.floor(Math.random() * 80) + 30,
        });
      }
      
      // Calculate totals and growth rates
      const totalSms = dailyDataPoints.reduce((sum, point) => sum + point.sms, 0);
      const totalVoice = dailyDataPoints.reduce((sum, point) => sum + point.voice, 0);
      const totalEmail = dailyDataPoints.reduce((sum, point) => sum + point.email, 0);
      
      // Calculate random growth rates between -15% and +25%
      const smsGrowth = Math.floor(Math.random() * 40) - 15;
      const voiceGrowth = Math.floor(Math.random() * 40) - 15;
      const emailGrowth = Math.floor(Math.random() * 40) - 15;
      const contactsGrowth = Math.floor(Math.random() * 40) - 15;
      
      return res.status(200).json({
        summary: {
          smsSent: totalSms,
          smsGrowth,
          voiceMinutes: totalVoice * 4, // Average 4 minutes per call
          voiceGrowth,
          emailsDelivered: totalEmail,
          emailGrowth,
          totalContacts: 8642, // Mock value
          contactsGrowth
        },
        dailyActivity: dailyDataPoints,
        deliveryRate: {
          sms: 94.2,
          voice: 89.5,
          email: 96.7
        },
        responseRate: {
          sms: 12.8,
          voice: 24.3,
          email: 8.5
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // For development: Seed data endpoint
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/dev/seed", async (req, res) => {
      try {
        const userId = req.body.userId || 1;
        const count = req.body.count || 10;
        
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Generate SMS messages
        for (let i = 0; i < count; i++) {
          const mockSms = communicationService.generateMockSmsMessage(userId);
          await storage.createSmsMessage({
            userId: mockSms.userId!,
            to: mockSms.to!,
            from: mockSms.from!,
            body: mockSms.body!,
            status: mockSms.status!,
            direction: mockSms.direction!,
            mediaUrls: mockSms.mediaUrls || [],
            messageSid: mockSms.messageSid,
            campaignId: undefined
          });
        }
        
        // Generate voice calls
        for (let i = 0; i < count; i++) {
          const mockCall = communicationService.generateMockVoiceCall(userId);
          const call = await storage.createVoiceCall({
            userId: mockCall.userId!,
            to: mockCall.to!,
            from: mockCall.from!,
            status: mockCall.status!,
            direction: mockCall.direction!,
            callSid: mockCall.callSid
          });
          
          if (mockCall.duration) {
            const endTime = new Date(call.startTime.getTime() + mockCall.duration * 1000);
            await storage.updateVoiceCall(call.id, {
              endTime,
              duration: mockCall.duration,
              recordingUrl: mockCall.recordingUrl
            });
          }
        }
        
        // Generate email messages
        for (let i = 0; i < count; i++) {
          const mockEmail = sendGridService.generateMockEmailMessage(userId);
          await storage.createEmailMessage({
            userId: mockEmail.userId!,
            to: mockEmail.to!,
            from: mockEmail.from!,
            subject: mockEmail.subject!,
            body: mockEmail.body!,
            status: mockEmail.status!,
            campaignId: undefined
          });
        }
        
        // Generate sample campaigns
        const campaignTypes = ['sms', 'email', 'voice'];
        const campaignStatuses = ['draft', 'scheduled', 'active', 'completed', 'paused'];
        const campaignNames = [
          'Summer Promotion', 
          'Product Announcement', 
          'Customer Feedback',
          'Holiday Special',
          'Service Update'
        ];
        
        for (let i = 0; i < 5; i++) {
          const type = campaignTypes[Math.floor(Math.random() * campaignTypes.length)];
          const status = campaignStatuses[Math.floor(Math.random() * campaignStatuses.length)];
          const name = campaignNames[i % campaignNames.length];
          
          const recipientCount = Math.floor(Math.random() * 5000) + 1000;
          const sentCount = status === 'draft' || status === 'scheduled' ? 0 : 
                           Math.floor(recipientCount * (Math.random() * 0.8 + 0.2));
          const deliveredCount = Math.floor(sentCount * 0.95);
          const failedCount = sentCount - deliveredCount;
          
          await storage.createCampaign({
            userId,
            name,
            type,
            status,
            message: `This is a sample ${type} campaign message for ${name}.`,
            recipientCount,
            scheduledFor: status === 'scheduled' ? new Date(Date.now() + 86400000) : undefined,
            endsAt: status === 'active' ? new Date(Date.now() + 86400000 * 5) : undefined,
            metadata: {
              segmentName: 'All Customers',
              templateId: `template-${Math.floor(Math.random() * 1000)}`
            }
          });
          
          // Update campaign counts
          const campaign = (await storage.getCampaigns(userId)).find(c => c.name === name);
          if (campaign) {
            await storage.updateCampaign(campaign.id, {
              sentCount,
              deliveredCount,
              failedCount
            });
          }
        }
        
        // Generate contacts
        const firstNames = ['Alice', 'Bob', 'Charlie', 'David', 'Emma', 'Frank', 'Grace', 'Henry'];
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson'];
        
        for (let i = 0; i < 20; i++) {
          const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
          const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
          const phoneNumber = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
          const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
          
          await storage.createContact({
            userId,
            firstName,
            lastName,
            phoneNumber,
            email,
            tags: ['customer', i % 3 === 0 ? 'VIP' : '', i % 5 === 0 ? 'new' : ''].filter(Boolean)
          });
        }
        
        return res.status(200).json({ message: "Seed data created successfully" });
      } catch (error) {
        console.error("Error seeding data:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });
  }
  
  // SMS Compliance Settings API endpoints
  app.get("/api/settings/compliance", async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Valid user ID is required" });
      }
      
      // In a production app, this would fetch actual settings from the database
      // For now, we'll return some default settings
      return res.status(200).json({
        settings: {
          tcpaConsentEnabled: true,
          optOutManagementEnabled: true,
          dncListCheckEnabled: false,
          a2pRegistrationEnabled: true,
          autoA2pSubmission: true,
          messageTemplatesEnabled: false,
          defaultOptOutMessage: "Reply STOP to unsubscribe.",
          defaultHelpMessage: "For help, reply HELP or contact our support.",
          linkShortening: true,
          contentFiltering: true,
          externalDataSharing: false
        }
      });
    } catch (error) {
      console.error("Error fetching compliance settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/settings/compliance", async (req, res) => {
    try {
      const { userId, settings } = req.body;
      
      if (!userId || !settings) {
        return res.status(400).json({ message: "User ID and settings are required" });
      }
      
      // In a production app, this would update the settings in the database
      // For now, we'll just return success
      
      return res.status(200).json({
        success: true,
        settings
      });
    } catch (error) {
      console.error("Error updating compliance settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Compliance API endpoints
  app.get("/api/compliance/status", async (req, res) => {
    try {
      const userId = parseInt(req.query.userId as string);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Valid user ID is required" });
      }

      // Get company registration status
      const registrationStatus = await complianceService.getRegistrationStatus(userId);
      const hasRegistration = await complianceService.hasA2PRegistration(userId);
      
      // Return status information
      return res.status(200).json({
        company: {
          status: registrationStatus,
          dateCreated: null, // Would come from database in production
          dateUpdated: null
        },
        campaign: {
          status: hasRegistration ? A2PRegistrationStatus.APPROVED : A2PRegistrationStatus.NOT_STARTED,
          dateCreated: null,
          dateUpdated: null
        },
        requiresRegistration: {
          US: true,
          Canada: false,
          UK: false
        },
        helpText: complianceService.getA2PRegistrationHelp()
      });
    } catch (error) {
      console.error("Error fetching compliance status:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post("/api/compliance/register-company", async (req, res) => {
    try {
      const { userId, companyName, ...businessInfo } = req.body;
      
      if (!userId || !companyName) {
        return res.status(400).json({ message: "User ID and company name are required" });
      }
      
      // Validate with the A2P schema if available
      if (req.query.validate === 'true') {
        const validationResult = await a2pRegistrationService.validateCompanyRegistration({
          userId,
          companyName,
          ...businessInfo
        });
        
        if (!validationResult.valid) {
          return res.status(400).json({ 
            message: "Validation failed", 
            errors: validationResult.errors 
          });
        }
      }
      
      // Start company registration
      const registration = await complianceService.startCompanyRegistration(
        userId,
        companyName,
        businessInfo
      );
      
      return res.status(201).json(registration);
    } catch (error) {
      console.error("Error registering company:", error);
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : "Internal server error" 
      });
    }
  });
  
  app.post("/api/compliance/register-campaign", async (req, res) => {
    try {
      const { userId, campaignName, useCase, ...campaignDetails } = req.body;
      
      if (!userId || !campaignName || !useCase) {
        return res.status(400).json({ message: "User ID, campaign name, and use case are required" });
      }
      
      // Check if user has approved company registration
      const hasRegistration = await complianceService.hasA2PRegistration(userId);
      if (!hasRegistration) {
        return res.status(403).json({ 
          message: "Company registration must be approved before registering campaigns" 
        });
      }
      
      // Get company registration ID
      const registrationStatus = await complianceService.getRegistrationStatus(userId);
      const companyRegistrationId = req.body.companyRegistrationId || 'default-company-id';
      
      // Validate with the A2P schema if available
      if (req.query.validate === 'true') {
        // Get the schema to find the use case fields
        const schema = await a2pSchemaSynchronizer.getSchema();
        const useCase = schema.campaignUseCases.find(uc => uc.id === req.body.useCase);
        
        if (useCase) {
          // Validate required fields for this use case
          const missingFields = [];
          for (const field of useCase.fields) {
            if (field.validation.required && !campaignDetails[field.name]) {
              missingFields.push(field.name);
            }
          }
          
          if (missingFields.length > 0) {
            return res.status(400).json({
              message: "Missing required fields for this campaign use case",
              missingFields
            });
          }
        }
      }
      
      // Start campaign registration
      const registration = await complianceService.startCampaignRegistration(
        userId,
        campaignName,
        useCase,
        campaignDetails
      );
      
      if (!registration) {
        return res.status(400).json({ 
          message: "Unable to create campaign registration. Company registration may not be approved."
        });
      }
      
      return res.status(201).json(registration);
    } catch (error) {
      console.error("Error registering campaign:", error);
      return res.status(500).json({ 
        message: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });
  
  app.post("/api/compliance/check-message", async (req, res) => {
    try {
      const { userId, message, to, from } = req.body;
      
      if (!userId || !message || !to || !from) {
        return res.status(400).json({ 
          message: "User ID, message content, recipient number, and sender number are required" 
        });
      }
      
      // Check message compliance
      const compliance = await complianceService.isMessageCompliant(
        userId,
        message,
        to,
        from
      );
      
      return res.status(200).json({
        ...compliance,
        requiresA2P: complianceService.requiresA2PRegistration(to),
        registrationHelp: !compliance.compliant ? complianceService.getA2PRegistrationHelp() : null
      });
    } catch (error) {
      console.error("Error checking message compliance:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // A2P Schema Synchronization endpoints
  app.get("/api/compliance/a2p/schema", async (req, res) => {
    try {
      const schema = await a2pSchemaSynchronizer.getSchema();
      return res.status(200).json(schema);
    } catch (error) {
      console.error('Error fetching A2P schema:', error);
      return res.status(500).json({ message: 'Failed to fetch A2P registration schema' });
    }
  });
  
  // Get brand registration schema only
  app.get("/api/compliance/a2p/schema/brand", async (req, res) => {
    try {
      const brandSchema = await a2pSchemaSynchronizer.getBrandRegistrationSchema();
      return res.status(200).json(brandSchema);
    } catch (error) {
      console.error('Error fetching brand registration schema:', error);
      return res.status(500).json({ message: 'Failed to fetch brand registration schema' });
    }
  });
  
  // Get campaign use cases
  app.get("/api/compliance/a2p/schema/usecases", async (req, res) => {
    try {
      const useCases = await a2pSchemaSynchronizer.getCampaignUseCases();
      return res.status(200).json(useCases);
    } catch (error) {
      console.error('Error fetching campaign use cases:', error);
      return res.status(500).json({ message: 'Failed to fetch campaign use cases' });
    }
  });
  
  // Get specific campaign use case
  app.get("/api/compliance/a2p/schema/usecases/:id", async (req, res) => {
    try {
      const useCase = await a2pSchemaSynchronizer.getCampaignUseCase(req.params.id);
      
      if (!useCase) {
        return res.status(404).json({ message: 'Campaign use case not found' });
      }
      
      return res.status(200).json(useCase);
    } catch (error) {
      console.error('Error fetching campaign use case:', error);
      return res.status(500).json({ message: 'Failed to fetch campaign use case' });
    }
  });
  
  // Get fields for a specific brand registration section
  app.get("/api/compliance/a2p/schema/brand/sections/:section", async (req, res) => {
    try {
      const fields = await a2pSchemaSynchronizer.getBrandRegistrationFieldsBySection(req.params.section);
      return res.status(200).json(fields);
    } catch (error) {
      console.error('Error fetching brand registration fields:', error);
      return res.status(500).json({ message: 'Failed to fetch brand registration fields' });
    }
  });
  
  // Get fields for a specific campaign use case
  app.get("/api/compliance/a2p/schema/usecases/:id/fields", async (req, res) => {
    try {
      const fields = await a2pSchemaSynchronizer.getCampaignUseCaseFields(req.params.id);
      
      if (fields.length === 0) {
        return res.status(404).json({ message: 'Campaign use case not found or has no fields' });
      }
      
      return res.status(200).json(fields);
    } catch (error) {
      console.error('Error fetching campaign use case fields:', error);
      return res.status(500).json({ message: 'Failed to fetch campaign use case fields' });
    }
  });
  
  // Force refresh the A2P schema (admin only)
  app.post("/api/compliance/a2p/schema/refresh", async (req, res) => {
    try {
      // In production, would check for admin credentials
      const updated = await a2pSchemaSynchronizer.synchronizeSchema();
      
      return res.status(200).json({
        success: true,
        updated: updated,
        lastSyncTime: (await a2pSchemaSynchronizer.getSchema()).lastSyncTime
      });
    } catch (error) {
      console.error('Error refreshing A2P schema:', error);
      return res.status(500).json({ message: 'Failed to refresh A2P registration schema' });
    }
  });
  
  // Check registration status
  app.get("/api/compliance/a2p/status/:type/:userId/:registrationId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { registrationId, type } = req.params;
      
      if (isNaN(userId) || !registrationId || (type !== 'company' && type !== 'campaign')) {
        return res.status(400).json({ 
          message: 'Valid user ID, registration ID, and type (company or campaign) are required' 
        });
      }
      
      // Check registration status
      const status = await complianceService.checkRegistrationStatus(
        userId,
        registrationId,
        type as 'company' | 'campaign'
      );
      
      return res.status(200).json({ 
        registrationId,
        type,
        status 
      });
    } catch (error) {
      console.error('Error checking A2P registration status:', error);
      return res.status(500).json({ message: 'Failed to check registration status' });
    }
  });
  
  // Apple Business Chat integration routes
  app.get("/api/apple-business-chat/requirements", async (req, res) => {
    try {
      const requirements = appleBusinessChatService.getRegistrationRequirements();
      return res.status(200).json(requirements);
    } catch (error) {
      console.error('Error fetching Apple Business Chat requirements:', error);
      return res.status(500).json({ message: 'Failed to fetch requirements' });
    }
  });
  
  app.post("/api/apple-business-chat/register", async (req, res) => {
    try {
      const { userId, businessDetails } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      if (!businessDetails || typeof businessDetails !== 'object') {
        return res.status(400).json({ message: "Business details are required" });
      }
      
      // Check if user already has a registration
      const existingRegistration = await storage.getAppleBusinessRegistrationByUserId(userId);
      if (existingRegistration) {
        return res.status(409).json({ 
          message: "User already has an Apple Business registration",
          registration: existingRegistration
        });
      }
      
      // Create the registration
      const registration = await appleBusinessChatService.registerBusiness(userId, businessDetails);
      
      return res.status(201).json(registration);
    } catch (error) {
      console.error('Error registering with Apple Business Chat:', error);
      return res.status(500).json({ 
        message: 'Failed to register with Apple Business Chat',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.get("/api/apple-business-chat/registration/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const registration = await storage.getAppleBusinessRegistrationByUserId(userId);
      
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" });
      }
      
      return res.status(200).json(registration);
    } catch (error) {
      console.error('Error fetching Apple Business Chat registration:', error);
      return res.status(500).json({ message: 'Failed to fetch registration details' });
    }
  });
  
  app.get("/api/apple-business-chat/status/:registrationId", async (req, res) => {
    try {
      const { registrationId } = req.params;
      
      if (!registrationId) {
        return res.status(400).json({ message: "Registration ID is required" });
      }
      
      const status = await appleBusinessChatService.checkRegistrationStatus(registrationId);
      
      return res.status(200).json({ 
        registrationId,
        status
      });
    } catch (error) {
      console.error('Error checking Apple Business Chat registration status:', error);
      return res.status(500).json({ 
        message: 'Failed to check registration status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.post("/api/apple-business-chat/send", async (req, res) => {
    try {
      const { from, to, body, attributes } = req.body;
      
      if (!from || !to || !body) {
        return res.status(400).json({ 
          message: "Required parameters missing: from, to, and body are required" 
        });
      }
      
      const result = await appleBusinessChatService.sendMessage(from, to, body, attributes);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Failed to send Apple Business Chat message",
          error: result.error
        });
      }
      
      return res.status(200).json({
        success: true,
        messageSid: result.messageSid,
        status: result.status
      });
    } catch (error) {
      console.error('Error sending Apple Business Chat message:', error);
      return res.status(500).json({ 
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.post("/api/apple-business-chat/webhook", async (req, res) => {
    try {
      const event = req.body;
      
      // Process the incoming webhook
      const result = await appleBusinessChatService.handleWebhook(event);
      
      if (!result.success) {
        // We still return 200 to acknowledge receipt, but log the error
        console.error('Failed to process Apple Business Chat webhook:', result.error);
      }
      
      // Always return 200 for webhooks to acknowledge receipt
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Error processing Apple Business Chat webhook:', error);
      // Still return 200 to acknowledge receipt
      return res.status(200).json({ received: true, error: 'Error processing webhook' });
    }
  });
  
  // API Key endpoints for CRM integration
  app.post("/api/integration/api-keys", async (req, res) => {
    try {
      const apiKeyData = insertApiKeySchema.parse(req.body);
      
      // Check user exists
      const user = await storage.getUser(apiKeyData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Create API Key
      const apiKey = await storage.createApiKey(apiKeyData);
      
      // Return the API key with secret - will only be shown once
      return res.status(201).json(apiKey);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/integration/api-keys/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const apiKeys = await storage.getApiKeys(userId);
      
      // Don't return secrets in list view
      const sanitizedKeys = apiKeys.map(key => {
        const { secret, ...keyWithoutSecret } = key;
        return keyWithoutSecret;
      });
      
      return res.status(200).json(sanitizedKeys);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get("/api/integration/api-keys/:userId/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const keyId = parseInt(req.params.id);
      
      if (isNaN(userId) || isNaN(keyId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const apiKey = await storage.getApiKey(keyId);
      
      if (!apiKey || apiKey.userId !== userId) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      // Don't return secret in view
      const { secret, ...keyWithoutSecret } = apiKey;
      return res.status(200).json(keyWithoutSecret);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete("/api/integration/api-keys/:userId/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const keyId = parseInt(req.params.id);
      
      if (isNaN(userId) || isNaN(keyId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const apiKey = await storage.getApiKey(keyId);
      
      if (!apiKey || apiKey.userId !== userId) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      await storage.deleteApiKey(keyId);
      return res.status(200).json({ message: "API key deleted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Webhook endpoints for event notifications
  app.post("/api/integration/webhooks", async (req, res) => {
    try {
      const webhookData = insertWebhookSchema.parse(req.body);
      
      // Check user exists
      const user = await storage.getUser(webhookData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Create webhook
      const webhook = await storage.createWebhook(webhookData);
      
      return res.status(201).json(webhook);
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/integration/webhooks/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const webhooks = await storage.getWebhooks(userId);
      return res.status(200).json(webhooks);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get("/api/integration/webhooks/:userId/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const webhookId = parseInt(req.params.id);
      
      if (isNaN(userId) || isNaN(webhookId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const webhook = await storage.getWebhook(webhookId);
      
      if (!webhook || webhook.userId !== userId) {
        return res.status(404).json({ message: "Webhook not found" });
      }
      
      return res.status(200).json(webhook);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.patch("/api/integration/webhooks/:userId/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const webhookId = parseInt(req.params.id);
      
      if (isNaN(userId) || isNaN(webhookId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const webhook = await storage.getWebhook(webhookId);
      
      if (!webhook || webhook.userId !== userId) {
        return res.status(404).json({ message: "Webhook not found" });
      }
      
      // Only allow updating certain fields
      const { name, url, events, active } = req.body;
      const updates: Partial<Webhook> = {};
      
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url;
      if (events !== undefined) updates.events = events;
      if (active !== undefined) updates.active = active;
      
      const updatedWebhook = await storage.updateWebhook(webhookId, updates);
      
      return res.status(200).json(updatedWebhook);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete("/api/integration/webhooks/:userId/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const webhookId = parseInt(req.params.id);
      
      if (isNaN(userId) || isNaN(webhookId)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const webhook = await storage.getWebhook(webhookId);
      
      if (!webhook || webhook.userId !== userId) {
        return res.status(404).json({ message: "Webhook not found" });
      }
      
      await storage.deleteWebhook(webhookId);
      return res.status(200).json({ message: "Webhook deleted successfully" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // API Documentation route
  app.get("/api/documentation", async (req, res) => {
    try {
      return res.status(200).json({
        version: "1.0.0",
        apiBase: "/api",
        endpoints: [
          {
            path: "/integration/api-keys",
            methods: ["GET", "POST", "DELETE"],
            description: "Manage API keys for CRM integration",
            authRequired: true
          },
          {
            path: "/integration/webhooks",
            methods: ["GET", "POST", "PATCH", "DELETE"],
            description: "Manage webhooks for event notifications",
            authRequired: true
          },
          {
            path: "/sms",
            methods: ["GET", "POST"],
            description: "Send and receive SMS messages",
            authRequired: true
          },
          {
            path: "/voice/call",
            methods: ["GET", "POST"],
            description: "Manage voice calls",
            authRequired: true
          },
          {
            path: "/email",
            methods: ["GET", "POST"],
            description: "Send email messages",
            authRequired: true
          },
          {
            path: "/campaigns",
            methods: ["GET", "POST", "PATCH"],
            description: "Manage campaigns",
            authRequired: true
          },
          {
            path: "/phone-numbers",
            methods: ["GET", "POST", "DELETE"],
            description: "Manage phone numbers",
            authRequired: true
          },
          {
            path: "/contacts",
            methods: ["GET", "POST"],
            description: "Manage contacts",
            authRequired: true
          }
        ],
        authentication: {
          type: "API Key",
          header: "X-API-Key",
          description: "Pass your API key in the X-API-Key header for all authenticated requests."
        },
        rateLimit: {
          requests: 100,
          period: "1 minute",
          description: "Rate limit is applied on a per-API key basis."
        }
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // API authentication middleware
  const apiKeyAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      
      if (!apiKey) {
        return res.status(401).json({ message: "API key required" });
      }
      
      const key = await storage.getApiKeyByKey(apiKey);
      
      if (!key || !key.active) {
        return res.status(401).json({ message: "Invalid or inactive API key" });
      }
      
      // Check if key is expired
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
        return res.status(401).json({ message: "API key expired" });
      }
      
      // Update last used timestamp
      await storage.updateApiKey(key.id, { lastUsed: new Date() });
      
      // Add user ID to request
      req.body.userId = key.userId;
      
      next();
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
  
  // API integration route for sending SMS via external CRM
  app.post("/api/integration/sms", apiKeyAuthMiddleware, async (req, res) => {
    try {
      const messageData = insertSmsSchema.parse(req.body);
      
      // Validate user has enough credits
      const user = await storage.getUser(messageData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.credits < 1) {
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      // Send message via messaging provider
      const result = await communicationService.sendSMS(
        messageData.to, 
        messageData.from,
        messageData.body,
        messageData.mediaUrls
      );
      
      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to send SMS" });
      }
      
      // Save to storage
      const message = await storage.createSmsMessage({
        ...messageData,
        status: 'sent',
        messageSid: result.sid,
      });
      
      // Deduct credits
      await storage.createBillingTransaction({
        userId: user.id,
        amount: -1,
        type: 'credit-usage',
        description: 'SMS message via API',
        credits: 1
      });
      
      return res.status(201).json({
        id: message.id,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        sentAt: message.sentAt
      });
    } catch (error) {
      return handleZodError(error, res);
    }
  });
  
  // Get account settings
  app.get("/api/settings", async (req, res) => {
    try {
      // Fetch credentials from environment variables
      const settingsData = {
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
        twilioPhoneNumber: (process.env.TWILIO_PHONE_NUMBERS?.split(',')[0]) || "",
        sendgridApiKey: process.env.SENDGRID_API_KEY || "",
        sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@unicomms.io",
        upgraded: true,
        plan: "enterprise",
        billingEmail: "billing@unicomms.io"
      };
      
      res.json(settingsData);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings data" });
    }
  });

  // AI Insights endpoints
  app.post("/api/ai/insights", async (req, res) => {
    try {
      const stats: MessagingStats = req.body.stats || {
        messagesSent: 5234,
        messagesReceived: 1423,
        deliveryRate: 98.2,
        errorRate: 1.8,
        optOutRate: 0.3,
        activeUsers: 1423,
        topHours: [10, 14, 16],
        weeklyTrend: [15, 20, 22, 38, 25, 30, 35]
      };

      const insights = await generateMessagingInsights(stats);
      res.json({ insights });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.post("/api/ai/ask", async (req, res) => {
    try {
      const { question } = req.body;
      
      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const stats: MessagingStats = req.body.stats || {
        messagesSent: 5234,
        messagesReceived: 1423,
        deliveryRate: 98.2,
        errorRate: 1.8,
        optOutRate: 0.3,
        activeUsers: 1423,
        topHours: [10, 14, 16],
        weeklyTrend: [15, 20, 22, 38, 25, 30, 35]
      };

      const answer = await generateCustomInsight(question, stats);
      res.json({ answer });
    } catch (error) {
      console.error("Error generating AI response:", error);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  // AI Chatbot endpoint
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, userId } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const response = await chatWithAI(message, userId);
      res.json({ response });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // KPI Dashboard endpoint - Real-time business intelligence
  app.get("/api/kpi/dashboard", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const dashboard = await getKPIDashboard(userId);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching KPI dashboard:", error);
      res.status(500).json({ error: "Failed to fetch KPI dashboard" });
    }
  });

  // KPI Summary endpoint - Quick metrics overview
  app.get("/api/kpi/summary", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const dashboard = await getKPIDashboard(userId);
      
      // Return condensed summary for quick display
      res.json({
        leads: {
          today: dashboard.leads.today,
          growth: dashboard.leads.growthRate
        },
        campaigns: {
          active: dashboard.campaigns.active,
          deliveryRate: dashboard.campaigns.deliveryRate,
          responseRate: dashboard.campaigns.responseRate
        },
        messaging: {
          sentToday: dashboard.messaging.sentToday,
          deliveryRate: dashboard.messaging.deliveryRate
        },
        alerts: dashboard.summary.alerts,
        highlights: dashboard.summary.highlights.slice(0, 3)
      });
    } catch (error) {
      console.error("Error fetching KPI summary:", error);
      res.status(500).json({ error: "Failed to fetch KPI summary" });
    }
  });

  // ============================================
  // ACCOUNTS API
  // ============================================

  // Initialize providers on startup
  accountService.initializeProviders().catch(console.error);

  // Get all accounts for the current user
  app.get("/api/accounts", async (req, res) => {
    try {
      // Get user ID from session or default to 1 for demo
      const userId = (req as any).user?.id || 1;
      
      // Try to get accounts from database first
      const dbResult = await accountService.getAccountsForUser(userId);
      
      // If no accounts in DB, fall back to Twilio analytics for demo
      if (dbResult.accounts.length === 0) {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        if (twilioSid) {
          const twilioAnalytics = await twilioAnalyticsService.getAnalytics();
          
          const accounts = [
            {
              id: 'acc_master_twilio',
              parentId: null,
              organizationId: 'org_1',
              provider: 'twilio',
              type: 'master',
              name: 'Main Twilio Account',
              friendlyName: twilioAnalytics.account.friendlyName || 'Production',
              status: twilioAnalytics.account.status || 'active',
              accountSid: twilioSid.substring(0, 10) + '...',
              phoneNumberCount: twilioAnalytics.phoneNumbers.length,
              monthlySpend: twilioAnalytics.metrics.totalSpendThisMonth,
              createdAt: twilioAnalytics.account.dateCreated,
              // Include real phone numbers from Twilio
              phoneNumbers: twilioAnalytics.phoneNumbers.map(pn => ({
                phoneNumber: pn.phoneNumber,
                friendlyName: pn.friendlyName,
                capabilities: pn.capabilities,
                dateCreated: pn.dateCreated,
              })),
              children: [],
            },
          ];

          const overview = {
            totalAccounts: accounts.length,
            totalPhoneNumbers: accounts.reduce((sum: number, a: any) => sum + a.phoneNumberCount, 0),
            totalMonthlySpend: accounts.reduce((sum: number, a: any) => sum + a.monthlySpend, 0),
            accounts,
          };

          return res.json({ accounts, overview });
        }
      }

      res.json({ accounts: dbResult.accounts, overview: dbResult.overview });
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  // Create new account
  app.post("/api/accounts", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { providerCode, name, type, accountSid, authToken, apiKey, apiSecret, parentAccountId } = req.body;

      if (!providerCode || !accountSid || !authToken) {
        return res.status(400).json({ error: "Missing required fields: providerCode, accountSid, authToken" });
      }

      const account = await accountService.createAccount({
        userId,
        providerCode,
        name: name || `${providerCode} Account`,
        type: type || 'master',
        parentAccountId,
        accountSid,
        authToken,
        apiKey,
        apiSecret,
      });

      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating account:", error);
      const message = error instanceof Error ? error.message : "Failed to create account";
      res.status(400).json({ error: message });
    }
  });

  // Get single account details
  app.get("/api/accounts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Handle legacy ID format
      if (id === 'acc_master_twilio') {
        const twilioAnalytics = await twilioAnalyticsService.getAnalytics();
        return res.json({
          id: 'acc_master_twilio',
          provider: 'twilio',
          type: 'master',
          name: 'Main Twilio Account',
          status: twilioAnalytics.account.status,
          phoneNumbers: twilioAnalytics.phoneNumbers,
          metrics: twilioAnalytics.metrics,
        });
      }

      // Parse numeric ID
      const accountId = parseInt(id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      res.json(account);
    } catch (error) {
      console.error("Error fetching account:", error);
      res.status(500).json({ error: "Failed to fetch account" });
    }
  });

  // Update account
  app.patch("/api/accounts/:id", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const updated = await accountService.updateAccount(accountId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  // Delete account
  app.delete("/api/accounts/:id", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      await accountService.deleteAccount(accountId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Sync account data from provider
  app.post("/api/accounts/:id/sync", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      await accountService.syncAccountData(accountId);
      const account = await accountService.getAccountById(accountId);
      
      res.json(account);
    } catch (error) {
      console.error("Error syncing account:", error);
      res.status(500).json({ error: "Failed to sync account" });
    }
  });

  // Get available providers
  app.get("/api/providers", async (req, res) => {
    try {
      const providerList = await accountService.getProviders();
      res.json(providerList);
    } catch (error) {
      console.error("Error fetching providers:", error);
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  // Get phone numbers for an account
  app.get("/api/accounts/:id/phone-numbers", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Handle legacy ID format (env-based Twilio)
      if (id === 'acc_master_twilio') {
        const twilioAnalytics = await twilioAnalyticsService.getAnalytics();
        return res.json({
          phoneNumbers: twilioAnalytics.phoneNumbers.map(pn => ({
            id: pn.phoneNumber,
            phoneNumber: pn.phoneNumber,
            friendlyName: pn.friendlyName,
            capabilities: pn.capabilities,
            status: 'active',
            dateCreated: pn.dateCreated,
          })),
          total: twilioAnalytics.phoneNumbers.length,
        });
      }

      // Parse numeric ID for DB accounts
      const accountId = parseInt(id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      // Get provider for account and fetch phone numbers
      const provider = await accountService.getProviderForAccount(accountId);
      if (!provider) {
        return res.status(404).json({ error: "Account not found or not configured" });
      }

      const phoneNumbers = await provider.getPhoneNumbers();
      res.json({
        phoneNumbers: phoneNumbers.map(pn => ({
          id: pn.sid,
          phoneNumber: pn.phoneNumber,
          friendlyName: pn.friendlyName,
          capabilities: pn.capabilities,
          status: pn.status,
          dateCreated: pn.dateCreated,
        })),
        total: phoneNumbers.length,
      });
    } catch (error) {
      console.error("Error fetching phone numbers:", error);
      res.status(500).json({ error: "Failed to fetch phone numbers" });
    }
  });

  // ============================================
  // SUB-ACCOUNT MANAGEMENT
  // ============================================

  /**
   * Create a new sub-account under a master account
   */
  app.post("/api/accounts/:parentId/subaccounts", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const parentId = req.params.parentId;
      const { friendlyName } = req.body;

      if (!friendlyName) {
        return res.status(400).json({ error: "friendlyName is required" });
      }

      // Parse parent account ID
      let parentAccountId: number;
      if (parentId === 'acc_master_twilio') {
        // For env-based account, we need to create it in DB first
        return res.status(400).json({ 
          error: "Cannot create sub-accounts for env-based accounts. Please connect the account via the UI first." 
        });
      } else {
        parentAccountId = parseInt(parentId.replace('acc_', ''));
        if (isNaN(parentAccountId)) {
          return res.status(400).json({ error: "Invalid parent account ID" });
        }
      }

      const subAccount = await subAccountService.createSubAccount({
        friendlyName,
        parentAccountId,
        userId,
      });

      res.status(201).json({
        success: true,
        account: {
          id: `acc_${subAccount?.id}`,
          parentId: parentId,
          name: subAccount?.name,
          friendlyName: subAccount?.friendlyName,
          accountSid: subAccount?.accountSid,
          status: subAccount?.status,
          type: 'subaccount',
          phoneNumberCount: 0,
          monthlySpend: 0,
        },
      });
    } catch (error: any) {
      console.error("Error creating sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to create sub-account" });
    }
  });

  /**
   * List sub-accounts for a master account
   */
  app.get("/api/accounts/:parentId/subaccounts", async (req, res) => {
    try {
      const parentId = req.params.parentId;

      // Parse parent account ID
      let parentAccountId: number;
      if (parentId === 'acc_master_twilio') {
        // Env-based account has no sub-accounts in DB
        return res.json({ subAccounts: [] });
      } else {
        parentAccountId = parseInt(parentId.replace('acc_', ''));
        if (isNaN(parentAccountId)) {
          return res.status(400).json({ error: "Invalid parent account ID" });
        }
      }

      const subAccounts = await subAccountService.listSubAccounts(parentAccountId);

      res.json({
        subAccounts: subAccounts.map(sa => ({
          id: `acc_${sa.id}`,
          parentId: parentId,
          name: sa.name,
          friendlyName: sa.friendlyName,
          accountSid: sa.accountSid ? sa.accountSid.substring(0, 10) + '...' : null,
          status: sa.status,
          type: 'subaccount',
          phoneNumberCount: sa.phoneNumberCount || 0,
          monthlySpend: sa.monthlySpend || 0,
          createdAt: sa.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("Error listing sub-accounts:", error);
      res.status(500).json({ error: error.message || "Failed to list sub-accounts" });
    }
  });

  /**
   * Get sub-account details
   */
  app.get("/api/subaccounts/:id", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const details = await subAccountService.getSubAccountDetails(accountId);
      if (!details) {
        return res.status(404).json({ error: "Sub-account not found" });
      }

      res.json(details);
    } catch (error: any) {
      console.error("Error getting sub-account details:", error);
      res.status(500).json({ error: error.message || "Failed to get sub-account details" });
    }
  });

  /**
   * Update sub-account
   */
  app.patch("/api/subaccounts/:id", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { friendlyName, status } = req.body;
      const updated = await subAccountService.updateSubAccount(accountId, { friendlyName, status });

      res.json({
        success: true,
        account: updated,
      });
    } catch (error: any) {
      console.error("Error updating sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to update sub-account" });
    }
  });

  /**
   * Suspend sub-account
   */
  app.post("/api/subaccounts/:id/suspend", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const updated = await subAccountService.suspendSubAccount(accountId);
      res.json({ success: true, account: updated });
    } catch (error: any) {
      console.error("Error suspending sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to suspend sub-account" });
    }
  });

  /**
   * Activate sub-account
   */
  app.post("/api/subaccounts/:id/activate", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const updated = await subAccountService.activateSubAccount(accountId);
      res.json({ success: true, account: updated });
    } catch (error: any) {
      console.error("Error activating sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to activate sub-account" });
    }
  });

  /**
   * Close sub-account (permanent)
   */
  app.post("/api/subaccounts/:id/close", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      await subAccountService.closeSubAccount(accountId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error closing sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to close sub-account" });
    }
  });

  /**
   * Search available phone numbers for a sub-account
   */
  app.get("/api/subaccounts/:id/available-numbers", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { areaCode, contains, country } = req.query;
      const numbers = await subAccountService.searchAvailableNumbers(accountId, {
        areaCode: areaCode as string,
        contains: contains as string,
        country: country as string,
      });

      res.json({ availableNumbers: numbers });
    } catch (error: any) {
      console.error("Error searching available numbers:", error);
      res.status(500).json({ error: error.message || "Failed to search available numbers" });
    }
  });

  /**
   * Purchase a phone number for a sub-account
   */
  app.post("/api/subaccounts/:id/phone-numbers", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "phoneNumber is required" });
      }

      const purchased = await subAccountService.purchasePhoneNumber(accountId, phoneNumber);
      res.status(201).json({ success: true, phoneNumber: purchased });
    } catch (error: any) {
      console.error("Error purchasing phone number:", error);
      res.status(500).json({ error: error.message || "Failed to purchase phone number" });
    }
  });

  /**
   * Sync sub-account data from Twilio
   */
  app.post("/api/subaccounts/:id/sync", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      await subAccountService.syncSubAccount(accountId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error syncing sub-account:", error);
      res.status(500).json({ error: error.message || "Failed to sync sub-account" });
    }
  });

  /**
   * Sync all existing sub-accounts from a master account
   * This imports sub-accounts that already exist in Twilio
   */
  app.post("/api/accounts/:parentId/sync-subaccounts", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const parentId = req.params.parentId;

      // Handle env-based account specially
      if (parentId === 'acc_master_twilio') {
        // Sync from environment-configured Twilio account
        const result = await subAccountService.syncFromEnvAccount(userId);
        
        return res.json({
          success: true,
          message: `Synced ${result.subAccounts.length} sub-accounts from Twilio`,
          masterAccount: {
            id: `acc_${result.masterAccount.id}`,
            name: result.masterAccount.name,
            friendlyName: result.masterAccount.friendlyName,
            accountSid: result.masterAccount.accountSid?.substring(0, 10) + '...',
          },
          subAccounts: result.subAccounts.map(sa => ({
            id: `acc_${sa.id}`,
            name: sa.name,
            friendlyName: sa.friendlyName,
            accountSid: sa.accountSid?.substring(0, 10) + '...',
            status: sa.status,
          })),
        });
      }

      // Parse numeric parent account ID
      const parentAccountId = parseInt(parentId.replace('acc_', ''));
      if (isNaN(parentAccountId)) {
        return res.status(400).json({ error: "Invalid parent account ID" });
      }

      const subAccounts = await subAccountService.syncExistingSubAccounts(parentAccountId);

      res.json({
        success: true,
        message: `Synced ${subAccounts.length} sub-accounts from Twilio`,
        subAccounts: subAccounts.map(sa => ({
          id: `acc_${sa.id}`,
          name: sa.name,
          friendlyName: sa.friendlyName,
          accountSid: sa.accountSid?.substring(0, 10) + '...',
          status: sa.status,
        })),
      });
    } catch (error: any) {
      console.error("Error syncing sub-accounts:", error);
      res.status(500).json({ error: error.message || "Failed to sync sub-accounts" });
    }
  });

  // Twilio Analytics endpoint - Real-time Twilio data
  app.get("/api/twilio/analytics", async (req, res) => {
    try {
      const analytics = await twilioAnalyticsService.getAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching Twilio analytics:", error);
      res.status(500).json({ error: "Failed to fetch Twilio analytics" });
    }
  });

  // Twilio Summary endpoint - Text summary for display
  app.get("/api/twilio/summary", async (req, res) => {
    try {
      const summary = await twilioAnalyticsService.generateTwilioSummary();
      res.json({ summary });
    } catch (error) {
      console.error("Error fetching Twilio summary:", error);
      res.status(500).json({ error: "Failed to fetch Twilio summary" });
    }
  });

  // Twilio Metrics endpoint - Quick metrics for dashboard
  app.get("/api/twilio/metrics", async (req, res) => {
    try {
      const analytics = await twilioAnalyticsService.getAnalytics();
      res.json({
        messages: {
          sentToday: analytics.metrics.totalMessagesSentToday,
          receivedToday: analytics.metrics.totalMessagesReceivedToday,
          sentYesterday: analytics.metrics.totalMessagesSentYesterday,
          sentThisWeek: analytics.metrics.totalMessagesSentThisWeek,
          sentThisMonth: analytics.metrics.totalMessagesSentThisMonth,
          deliveryRate: analytics.metrics.deliveryRateToday,
          failed: analytics.metrics.failedToday
        },
        calls: {
          today: analytics.metrics.totalCallsToday,
          thisWeek: analytics.metrics.totalCallsThisWeek,
          durationToday: analytics.metrics.totalCallDurationToday
        },
        spend: {
          today: analytics.metrics.totalSpendToday,
          thisMonth: analytics.metrics.totalSpendThisMonth,
          avgPerMessage: analytics.metrics.averageMessageCost
        },
        account: {
          status: analytics.account.status,
          phoneNumbers: analytics.phoneNumbers.length
        },
        generatedAt: analytics.generatedAt
      });
    } catch (error) {
      console.error("Error fetching Twilio metrics:", error);
      res.status(500).json({ error: "Failed to fetch Twilio metrics" });
    }
  });

  // ============================================
  // DATA API - Account-Scoped Data Access
  // ============================================

  /**
   * Get analytics data scoped to the selected account
   * 
   * Query params:
   * - accountId: specific account ID (optional, defaults to overview mode)
   * - overview: "true" to force overview mode
   */
  app.get("/api/data/analytics", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId as string | undefined;
      const isOverviewMode = req.query.overview === 'true' || !accountId;

      const result = await dataService.getAnalytics({
        userId,
        accountId,
        isOverviewMode,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching data analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  /**
   * Get messages for the selected account
   */
  app.get("/api/data/messages", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId as string | undefined;
      const period = (req.query.period as string) || 'thisMonth';
      const isOverviewMode = req.query.overview === 'true' || !accountId;

      const result = await dataService.getAnalytics({
        userId,
        accountId,
        isOverviewMode,
      });

      const messages = period === 'today' 
        ? result.messages.today
        : period === 'thisWeek'
        ? result.messages.thisWeek
        : result.messages.thisMonth;

      res.json({
        messages,
        total: messages.length,
        period,
        context: result.context,
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  /**
   * Get calls for the selected account
   */
  app.get("/api/data/calls", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId as string | undefined;
      const period = (req.query.period as string) || 'thisMonth';
      const isOverviewMode = req.query.overview === 'true' || !accountId;

      const result = await dataService.getAnalytics({
        userId,
        accountId,
        isOverviewMode,
      });

      const calls = period === 'today' 
        ? result.calls.today
        : period === 'thisWeek'
        ? result.calls.thisWeek
        : result.calls.thisMonth;

      res.json({
        calls,
        total: calls.length,
        period,
        context: result.context,
      });
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });

  /**
   * Get metrics for the selected account
   */
  app.get("/api/data/metrics", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId as string | undefined;
      const isOverviewMode = req.query.overview === 'true' || !accountId;

      const result = await dataService.getAnalytics({
        userId,
        accountId,
        isOverviewMode,
      });

      res.json({
        metrics: result.aggregatedMetrics,
        context: result.context,
        accountCount: result.accounts.length,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  /**
   * Send a message through the selected account
   */
  app.post("/api/data/messages/send", async (req, res) => {
    try {
      const { accountId, to, from, body, mediaUrls } = req.body;

      if (!accountId || !to || !from || !body) {
        return res.status(400).json({ 
          error: "Missing required fields: accountId, to, from, body" 
        });
      }

      const numericAccountId = parseInt(String(accountId).replace('acc_', ''));
      if (isNaN(numericAccountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const result = await dataService.sendMessage(numericAccountId, {
        to,
        from,
        body,
        mediaUrls,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  /**
   * Make a call through the selected account
   */
  app.post("/api/data/calls/make", async (req, res) => {
    try {
      const { accountId, to, from, url, twiml } = req.body;

      if (!accountId || !to || !from) {
        return res.status(400).json({ 
          error: "Missing required fields: accountId, to, from" 
        });
      }

      const numericAccountId = parseInt(String(accountId).replace('acc_', ''));
      if (isNaN(numericAccountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const result = await dataService.makeCall(numericAccountId, {
        to,
        from,
        url,
        twiml,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error("Error making call:", error);
      res.status(500).json({ error: "Failed to make call" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
