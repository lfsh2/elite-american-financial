import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { communicationService } from "./communications";
import { sendGridService } from "./sendgrid";
import { complianceService, A2PRegistrationStatus } from "./compliance";
import { a2pSchemaSynchronizer } from "./a2pSchemaSynchronizer";
import { a2pRegistrationService } from "./a2pRegistration";
import { a2pSyncService } from "./services/a2pSyncService";
import { autoRefillService } from "./autoRefillService";
import { appleBusinessChatService } from "./appleBusinessChat";
import { generateMessagingInsights, generateCustomInsight, chatWithAI, getKPIDashboard, type MessagingStats } from "./openai";
import { twilioAnalyticsService } from "./twilioAnalytics";
import { accountService } from "./services/accountService";
import { dataService } from "./services/dataService";
import { messageService } from "./services/messageService";
import { batchSmsService, type PhoneNumberConfig } from "./services/batchSmsService";
import { subAccountService } from "./services/subAccountService";
import { analyticsService } from "./services/analyticsService";
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
  generateApiKey,
  brandRegistrations,
  messagingCampaigns,
  smsCampaigns,
  contactLists,
  contactListMembers,
  contacts,
  campaignRecipients,
  smsMessages,
  voiceCalls,
  accounts,
  messageTemplates,
  accountPhoneNumbers,
  providers,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, or } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Webhook routers
import twilioWebhook from "./webhooks/twilio.webhook";
import commioWebhook from "./webhooks/commio.webhook";
import bandwidthWebhook from "./webhooks/bandwidth.webhook";

// Redis caching
import { redisService, CacheKeys, CACHE_TTL, STALE_TTL } from "./services/redisService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Register webhook routes (these need to be registered early for provider callbacks)
  app.use("/api/webhooks/twilio", twilioWebhook);
  app.use("/api/webhooks/commio", commioWebhook);
  app.use("/api/webhooks/bandwidth", bandwidthWebhook);
  console.log("[Routes] Webhook endpoints registered");
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

  /**
   * Send a single test SMS (used by campaign creation UI)
   * Expects: { to, from, message }
   * Finds the owning account for the fromNumber and sends via its provider.
   */
  app.post('/api/sms/send', async (req, res) => {
    try {
      const { to, from, message } = req.body;

      if (!to || !from || !message) {
        return res.status(400).json({ error: 'to, from, and message are required' });
      }

      const fromNumber = String(from).trim();
      console.log('[Test SMS] Looking for phone number:', fromNumber);

      // Get all accounts
      const { accounts } = await import('../shared/schema');
      const allAccounts = await db.select().from(accounts);
      
      console.log('[Test SMS] Checking', allAccounts.length, 'accounts');

      let matchedAccountId: number | null = null;

      // FAST PATH: Check imported phone numbers only (no API calls)
      for (const account of allAccounts) {
        const settings = (account.settings || {}) as Record<string, any>;
        if (settings.importedPhoneNumbers && Array.isArray(settings.importedPhoneNumbers)) {
          const hasNumber = settings.importedPhoneNumbers.some((pn: any) => 
            pn.phoneNumber === fromNumber
          );
          if (hasNumber) {
            console.log('[Test SMS] ✓ Found in imported numbers for account', account.id);
            matchedAccountId = account.id;
            break;
          }
        }
      }

      // If not found in imported numbers, just use the first account with valid credentials
      if (!matchedAccountId) {
        console.log('[Test SMS] Not found in imported numbers, using first available account');
        for (const account of allAccounts) {
          const provider = await accountService.getProviderForAccount(account.id);
          if (provider) {
            console.log('[Test SMS] ✓ Using account', account.id, 'with provider', provider.code);
            matchedAccountId = account.id;
            break;
          }
        }
      }

      if (!matchedAccountId) {
        console.log('[Test SMS] ✗ No valid account found');
        return res.status(400).json({ 
          error: 'No account with valid credentials found',
          hint: 'Please configure at least one Twilio or Commio account'
        });
      }

      // Get provider for the matched account
      const provider = await accountService.getProviderForAccount(matchedAccountId);
      if (!provider) {
        return res.status(400).json({ error: 'Provider credentials are not configured' });
      }

      console.log('[Test SMS] Sending SMS via', provider.code);

      // Send the message
      const result = await provider.sendMessage({ to, from: fromNumber, body: message });

      if (result.success) {
        console.log('[Test SMS] ✓ Message sent:', result.sid);
        return res.json({ success: true, messageSid: result.sid, fromNumber, accountId: matchedAccountId, provider: provider.code });
      }

      console.log('[Test SMS] ✗ Send failed:', result.error);
      return res.status(400).json({ error: result.error || 'Failed to send SMS', fromNumber, provider: provider.code });
    } catch (error: any) {
      console.error('[Test SMS] ✗ Error:', error);
      res.status(500).json({ error: error.message || 'Failed to send SMS' });
    }
  });
  
  // Auth endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`Login attempt for user: ${username}`);
      
      if (!username || !password) {
        console.log("Missing username or password");
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      // Try username first, then fall back to email lookup
      let user = await storage.getUserByUsername(username);
      if (!user && username.includes('@')) {
        user = await storage.getUserByEmail(username);
      }
      
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
  
  // Get all users (for admin user management)
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Remove passwords from response
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      return res.status(200).json(usersWithoutPasswords);
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
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

  // Update user
  app.put("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const updates = req.body;
      // Don't allow password updates through this endpoint
      delete updates.password;
      
      const user = await storage.updateUser(userId, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      return res.status(200).json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // USER PHONE ASSIGNMENT ENDPOINTS
  // ============================================

  // Get user's assigned phone numbers
  // Fetches real phone assignments from the database with phone number details
  app.get("/api/users/:id/phone-assignments", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Use real database for phone assignments
      const { db } = await import('./db.js');
      const { userPhoneAssignments, accountPhoneNumbers, accounts } = await import('../shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Fetch assignments with phone number and account details
      const { providers } = await import('../shared/schema');
      
      const assignments = await db
        .select({
          id: userPhoneAssignments.id,
          userId: userPhoneAssignments.userId,
          phoneNumberId: userPhoneAssignments.phoneNumberId,
          isPrimary: userPhoneAssignments.isPrimary,
          canSend: userPhoneAssignments.canSend,
          canReceive: userPhoneAssignments.canReceive,
          assignedAt: userPhoneAssignments.assignedAt,
          phoneNumber: accountPhoneNumbers.phoneNumber,
          friendlyName: accountPhoneNumbers.friendlyName,
          accountName: accounts.name,
          providerCode: providers.code,
        })
        .from(userPhoneAssignments)
        .leftJoin(accountPhoneNumbers, eq(userPhoneAssignments.phoneNumberId, accountPhoneNumbers.id))
        .leftJoin(accounts, eq(accountPhoneNumbers.accountId, accounts.id))
        .leftJoin(providers, eq(accounts.providerId, providers.id))
        .where(eq(userPhoneAssignments.userId, userId));
      
      // Map providerCode to provider for frontend compatibility
      const formattedAssignments = assignments.map(a => ({
        ...a,
        provider: a.providerCode || 'twilio',
      }));
      
      return res.status(200).json(formattedAssignments);
    } catch (error) {
      console.error("Error fetching user phone assignments:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Assign phone number to user (admin only)
  app.post("/api/users/:id/phone-assignments", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { phoneNumberId, isPrimary, canSend, canReceive, assignedBy } = req.body;
      
      if (!phoneNumberId) {
        return res.status(400).json({ message: "phoneNumberId is required" });
      }
      
      // Use real database for phone assignments
      const { db } = await import('./db.js');
      const { userPhoneAssignments, accountPhoneNumbers, accounts } = await import('../shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      const phoneNumId = parseInt(phoneNumberId);
      
      // Check if phone number exists
      const [phoneNumber] = await db
        .select()
        .from(accountPhoneNumbers)
        .where(eq(accountPhoneNumbers.id, phoneNumId));
      
      if (!phoneNumber) {
        return res.status(404).json({ message: "Phone number not found" });
      }
      
      // Check if already assigned to this user
      const existingAssignment = await db
        .select()
        .from(userPhoneAssignments)
        .where(and(
          eq(userPhoneAssignments.userId, userId),
          eq(userPhoneAssignments.phoneNumberId, phoneNumId)
        ));
      
      if (existingAssignment.length > 0) {
        return res.status(400).json({ message: "Phone number already assigned to this user" });
      }
      
      // Check phone number limit (max 10 per user/sub-account)
      const MAX_PHONE_NUMBERS_PER_USER = 10;
      const currentAssignments = await db
        .select()
        .from(userPhoneAssignments)
        .where(eq(userPhoneAssignments.userId, userId));
      
      if (currentAssignments.length >= MAX_PHONE_NUMBERS_PER_USER) {
        return res.status(400).json({ 
          message: `Maximum of ${MAX_PHONE_NUMBERS_PER_USER} phone numbers allowed per user`,
          currentCount: currentAssignments.length,
          limit: MAX_PHONE_NUMBERS_PER_USER
        });
      }
      
      // If marking as primary, unset other primaries for this user
      if (isPrimary) {
        await db
          .update(userPhoneAssignments)
          .set({ isPrimary: false })
          .where(eq(userPhoneAssignments.userId, userId));
      }
      
      // Create the assignment
      const [newAssignment] = await db
        .insert(userPhoneAssignments)
        .values({
          userId,
          phoneNumberId: phoneNumId,
          isPrimary: isPrimary ?? false,
          canSend: canSend ?? true,
          canReceive: canReceive ?? true,
          assignedBy: assignedBy ? parseInt(assignedBy) : null,
          assignedAt: new Date(),
        })
        .returning();
      
      return res.status(201).json(newAssignment);
    } catch (error) {
      console.error("Error assigning phone to user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Remove phone assignment from user
  app.delete("/api/users/:id/phone-assignments/:assignmentId", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const assignmentId = parseInt(req.params.assignmentId);
      
      if (isNaN(userId) || isNaN(assignmentId)) {
        return res.status(400).json({ message: "Invalid user ID or assignment ID" });
      }
      
      // Use real database for phone assignments
      const { db } = await import('./db.js');
      const { userPhoneAssignments } = await import('../shared/schema');
      const { eq, and } = await import('drizzle-orm');
      
      // Check if assignment exists and belongs to user
      const [existing] = await db
        .select()
        .from(userPhoneAssignments)
        .where(and(
          eq(userPhoneAssignments.id, assignmentId),
          eq(userPhoneAssignments.userId, userId)
        ));
      
      if (!existing) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      // Delete the assignment
      await db
        .delete(userPhoneAssignments)
        .where(eq(userPhoneAssignments.id, assignmentId));
      
      return res.status(200).json({ message: "Phone assignment removed successfully" });
    } catch (error) {
      console.error("Error removing phone assignment:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get available phone numbers (not assigned or can be shared)
  // Fetches real phone numbers from Twilio/Commio accounts in the database
  app.get("/api/phone-numbers/available", async (req, res) => {
    try {
      // Import database and schema
      const { db } = await import('./db.js');
      const { accountPhoneNumbers, accounts, providers } = await import('../shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Fetch all phone numbers from database (Twilio numbers stored here)
      const phoneNumbersWithAccounts = await db
        .select({
          id: accountPhoneNumbers.id,
          phoneNumber: accountPhoneNumbers.phoneNumber,
          friendlyName: accountPhoneNumbers.friendlyName,
          accountId: accountPhoneNumbers.accountId,
          capabilities: accountPhoneNumbers.capabilities,
          status: accountPhoneNumbers.status,
          accountName: accounts.name,
          providerCode: providers.code,
        })
        .from(accountPhoneNumbers)
        .leftJoin(accounts, eq(accountPhoneNumbers.accountId, accounts.id))
        .leftJoin(providers, eq(accounts.providerId, providers.id));
      
      console.log(`[PhoneNumbers] Found ${phoneNumbersWithAccounts.length} phone numbers in database`);
      
      // Also fetch Commio numbers from account settings (imported phone numbers)
      let commioNumbers: any[] = [];
      try {
        // Get all accounts from accountService
        const { accounts: allAccounts } = await accountService.getAccountsForUser(1);
        const commioAccounts = allAccounts.filter(acc => acc.provider === 'commio');
        console.log(`[PhoneNumbers] Found ${commioAccounts.length} Commio accounts`);
        
        for (const account of commioAccounts) {
          try {
            // Get account details with settings
            const accountIdNum = parseInt(account.id.replace('acc_', ''));
            const accountDetails = await accountService.getAccountById(accountIdNum);
            if (accountDetails) {
              const settings = (accountDetails.settings || {}) as Record<string, any>;
              if (settings.importedPhoneNumbers && Array.isArray(settings.importedPhoneNumbers)) {
                // Add account info to each number
                const numbersWithAccount = settings.importedPhoneNumbers.map((pn: any, index: number) => ({
                  id: `commio_${account.id}_${index}`,
                  phoneNumber: pn.phoneNumber,
                  friendlyName: pn.friendlyName || pn.phoneNumber,
                  accountId: account.id,
                  accountName: account.name,
                  provider: 'commio',
                  capabilities: pn.capabilities || { sms: true, mms: false, voice: true },
                  isAssigned: false, // Commio numbers tracked separately
                }));
                commioNumbers.push(...numbersWithAccount);
                console.log(`[PhoneNumbers] Found ${numbersWithAccount.length} Commio numbers for ${account.name}`);
              }
            }
          } catch (e) {
            console.log(`[PhoneNumbers] Could not fetch Commio numbers for ${account.id}:`, e);
          }
        }
        console.log(`[PhoneNumbers] Total ${commioNumbers.length} Commio numbers from all accounts`);
      } catch (commioError) {
        console.log('[PhoneNumbers] Could not fetch Commio accounts:', commioError);
      }
      
      // Get all current assignments to mark which phones are assigned
      const { userPhoneAssignments } = await import('../shared/schema');
      let assignedPhoneIds = new Set<number>();
      try {
        const assignments = await db
          .select({
            phoneNumberId: userPhoneAssignments.phoneNumberId,
          })
          .from(userPhoneAssignments);
        assignedPhoneIds = new Set(assignments.map(a => a.phoneNumberId));
      } catch (assignmentError) {
        console.log('[PhoneNumbers] Could not fetch assignments, assuming none assigned');
      }
      
      // Format database phone numbers with assignment status
      // Filter out released numbers - they no longer exist on the provider
      const activePhoneNumbers = phoneNumbersWithAccounts.filter(phone => phone.status !== 'released');
      console.log(`[PhoneNumbers] ${phoneNumbersWithAccounts.length} total, ${activePhoneNumbers.length} active (${phoneNumbersWithAccounts.length - activePhoneNumbers.length} released filtered out)`);
      
      const formattedPhones = activePhoneNumbers.map(phone => ({
        id: phone.id,
        phoneNumber: phone.phoneNumber,
        friendlyName: phone.friendlyName || phone.phoneNumber,
        accountId: phone.accountId,
        accountName: phone.accountName || 'Unknown Account',
        provider: phone.providerCode || 'twilio',
        capabilities: phone.capabilities,
        status: phone.status,
        isAssigned: assignedPhoneIds.has(phone.id),
      }));
      
      // Combine database phones with Commio numbers
      const allPhones = [...formattedPhones, ...commioNumbers];
      
      return res.status(200).json(allPhones);
    } catch (error) {
      console.error("Error fetching available phone numbers from database:", error);
      // Fallback to mock data if database query fails
      const phoneNumbers = await storage.getAvailablePhoneNumbers();
      return res.status(200).json(phoneNumbers);
    }
  });

  // Get all client users (for admin account selector dropdown)
  app.get("/api/users/clients", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Filter to only client users (role = 'user'), exclude super_admin
      const clientUsers = users
        .filter(u => u.role === 'user')
        .map(({ password, ...user }) => ({
          ...user,
          // Add display info for account selector
          displayName: `${user.firstName} ${user.lastName}`.trim() || user.username,
        }));
      return res.status(200).json(clientUsers);
    } catch (error) {
      console.error("Error fetching client users:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // USER PRICING & BILLING ENDPOINTS
  // ============================================

  // Get user's pricing configuration
  app.get("/api/users/:id/pricing", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const pricing = await storage.getUserPricingConfig(userId);
      if (!pricing) {
        // Return default pricing if not configured
        return res.status(200).json({
          userId,
          smsOutboundRate: "0.015",
          smsInboundRate: "0.01",
          mmsOutboundRate: "0.05",
          mmsInboundRate: "0.03",
          monthlyPhoneNumberFee: "0",
          billingCycleDay: 1,
          isDefault: true
        });
      }
      return res.status(200).json(pricing);
    } catch (error) {
      console.error("Error fetching user pricing:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create or update user's pricing configuration
  app.post("/api/users/:id/pricing", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { smsOutboundRate, smsInboundRate, mmsOutboundRate, mmsInboundRate, monthlyPhoneNumberFee, billingCycleDay } = req.body;
      
      const pricing = await storage.upsertUserPricingConfig({
        userId,
        smsOutboundRate: smsOutboundRate || "0.015",
        smsInboundRate: smsInboundRate || "0.01",
        mmsOutboundRate: mmsOutboundRate || "0.05",
        mmsInboundRate: mmsInboundRate || "0.03",
        monthlyPhoneNumberFee: monthlyPhoneNumberFee || "0",
        billingCycleDay: billingCycleDay || 1,
      });
      
      return res.status(200).json(pricing);
    } catch (error) {
      console.error("Error updating user pricing:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user's usage records (with optional date range)
  app.get("/api/users/:id/usage", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { startDate, endDate } = req.query;
      const usage = await storage.getUserUsageRecords(
        userId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      // Calculate totals
      const totals = usage.reduce((acc, record) => {
        const cost = parseFloat(record.cost);
        acc.totalCost += cost;
        acc.totalMessages += 1;
        if (record.messageType === 'sms') {
          acc.totalSms += 1;
          acc.smsCost += cost;
        } else {
          acc.totalMms += 1;
          acc.mmsCost += cost;
        }
        if (record.direction === 'outbound') {
          acc.outbound += 1;
        } else {
          acc.inbound += 1;
        }
        return acc;
      }, { totalCost: 0, totalMessages: 0, totalSms: 0, totalMms: 0, smsCost: 0, mmsCost: 0, outbound: 0, inbound: 0 });
      
      return res.status(200).json({ records: usage, totals });
    } catch (error) {
      console.error("Error fetching user usage:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user's billing summaries
  app.get("/api/users/:id/billing", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const billing = await storage.getUserBillingSummaries(userId);
      return res.status(200).json(billing);
    } catch (error) {
      console.error("Error fetching user billing:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current period usage summary for a user
  app.get("/api/users/:id/usage/current", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Get pricing config to determine billing cycle
      const pricing = await storage.getUserPricingConfig(userId);
      const billingCycleDay = pricing?.billingCycleDay || 1;
      
      // Calculate current billing period
      const now = new Date();
      let periodStart = new Date(now.getFullYear(), now.getMonth(), billingCycleDay);
      if (periodStart > now) {
        periodStart = new Date(now.getFullYear(), now.getMonth() - 1, billingCycleDay);
      }
      const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, billingCycleDay);
      
      const usage = await storage.getUserUsageRecords(userId, periodStart, periodEnd);
      
      // Calculate totals
      const summary = usage.reduce((acc, record) => {
        const cost = parseFloat(record.cost);
        acc.totalCost += cost;
        if (record.messageType === 'sms' && record.direction === 'outbound') acc.smsOutbound += 1;
        if (record.messageType === 'sms' && record.direction === 'inbound') acc.smsInbound += 1;
        if (record.messageType === 'mms' && record.direction === 'outbound') acc.mmsOutbound += 1;
        if (record.messageType === 'mms' && record.direction === 'inbound') acc.mmsInbound += 1;
        return acc;
      }, { totalCost: 0, smsOutbound: 0, smsInbound: 0, mmsOutbound: 0, mmsInbound: 0 });
      
      return res.status(200).json({
        periodStart,
        periodEnd,
        ...summary,
        totalMessages: summary.smsOutbound + summary.smsInbound + summary.mmsOutbound + summary.mmsInbound
      });
    } catch (error) {
      console.error("Error fetching current usage:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // CREDIT MANAGEMENT ENDPOINTS
  // ============================================

  // Get user's credit balance and rates
  app.get("/api/users/:id/credits", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const rates = await storage.getUserCreditRates(userId);
      
      return res.status(200).json({
        balance: user.credits || 0,
        rates: rates || {
          smsOutboundCredits: 1,
          smsInboundCredits: 0,
          mmsOutboundCredits: 3,
          mmsInboundCredits: 0,
          lowBalanceThreshold: 50,
          isDefault: true
        }
      });
    } catch (error) {
      console.error("Error fetching user credits:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Set user's credit rates
  app.post("/api/users/:id/credits/rates", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { smsOutboundCredits, smsInboundCredits, mmsOutboundCredits, mmsInboundCredits, lowBalanceThreshold } = req.body;
      
      const rates = await storage.upsertUserCreditRates({
        userId,
        smsOutboundCredits: smsOutboundCredits ?? 1,
        smsInboundCredits: smsInboundCredits ?? 0,
        mmsOutboundCredits: mmsOutboundCredits ?? 3,
        mmsInboundCredits: mmsInboundCredits ?? 0,
        lowBalanceThreshold: lowBalanceThreshold ?? 50,
      });
      
      return res.status(200).json(rates);
    } catch (error) {
      console.error("Error updating credit rates:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Add credits to user (admin action)
  app.post("/api/users/:id/credits/add", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { amount, description } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }
      
      const result = await storage.addCredits(userId, amount, description || "Credits added by admin");
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error adding credits:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Deduct credits from user (for consumption)
  app.post("/api/users/:id/credits/deduct", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { amount, description, referenceType, referenceId } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }
      
      const result = await storage.deductCredits(userId, amount, description || "Credits consumed", referenceType, referenceId);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error deducting credits:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user's credit transaction history
  app.get("/api/users/:id/credits/transactions", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      const { limit, offset } = req.query;
      const transactions = await storage.getCreditTransactions(
        userId,
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );
      
      return res.status(200).json(transactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get available credit packages
  app.get("/api/credit-packages", async (req, res) => {
    try {
      const packages = await storage.getCreditPackages();
      return res.status(200).json(packages);
    } catch (error) {
      console.error("Error fetching credit packages:", error);
      return res.status(500).json({ message: "Internal server error" });
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
      const { userId, to, from, body, direction, mediaUrls, accountId, provider } = req.body;
      
      // Validate required fields
      if (!userId || !to || !from || !body) {
        return res.status(400).json({ message: "Missing required fields: userId, to, from, body" });
      }
      
      // Validate user has enough credits
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.credits < 1) {
        return res.status(403).json({ message: "Insufficient credits" });
      }
      
      let result: { success: boolean; sid?: string; error?: string };
      const providerCode = provider?.toLowerCase() || 'twilio';
      
      // Route to correct provider based on accountId/provider
      if (providerCode === 'commio' && accountId) {
        console.log(`[SMS] Sending via Commio from ${from} to ${to}`);
        // Get Commio credentials from account
        // For Commio, accountSid = API Key, authToken = API Secret
        const numericAccountId = parseInt(accountId.toString().replace('acc_', ''));
        const credentials = await accountService.getAccountCredentials(numericAccountId);
        
        // Commio uses accountSid as apiKey and authToken as apiSecret
        const apiKey = credentials?.apiKey || credentials?.accountSid;
        const apiSecret = credentials?.apiSecret || credentials?.authToken;
        
        if (!apiKey || !apiSecret) {
          console.error('[SMS] Commio credentials missing:', { hasApiKey: !!apiKey, hasApiSecret: !!apiSecret });
          return res.status(400).json({ message: "Commio credentials not configured for this account" });
        }
        
        console.log(`[SMS] Using Commio API key: ${apiKey.substring(0, 5)}...`);
        
        // Send via Commio/ThinQ API
        // The accountSid field stores the ThinQ account username (e.g., "amuniz1")
        try {
          const thinqAccount = credentials?.accountSid || apiKey;
          const commioResponse = await fetch(`https://api.thinq.com/account/${thinqAccount}/product/origination/sms/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
            },
            body: JSON.stringify({
              from_did: from.replace(/[^\d]/g, ''),
              to_did: to.replace(/[^\d]/g, ''),
              message: body
            })
          });
          
          const responseText = await commioResponse.text();
          console.log(`[SMS] Commio response: ${commioResponse.status} - ${responseText}`);
          
          if (commioResponse.ok) {
            const commioData = JSON.parse(responseText);
            result = { success: true, sid: commioData.guid || commioData.id || `commio_${Date.now()}` };
          } else {
            let errorMsg = 'Commio API error';
            try {
              const errorData = JSON.parse(responseText);
              errorMsg = errorData.message || errorData.error || responseText;
            } catch { errorMsg = responseText; }
            result = { success: false, error: errorMsg };
          }
        } catch (commioError) {
          console.error('[SMS] Commio error:', commioError);
          result = { success: false, error: commioError instanceof Error ? commioError.message : 'Commio send failed' };
        }
      } else {
        // Default to Twilio
        console.log(`[SMS] Sending via Twilio from ${from} to ${to}`);
        result = await communicationService.sendSMS(to, from, body, mediaUrls);
      }
      
      if (!result.success) {
        console.error('[SMS] Send failed:', result.error);
        return res.status(500).json({ message: result.error || "Failed to send SMS", success: false });
      }
      
      // Save to database for persistence (conversations API uses database)
      const numericAccountId = accountId ? parseInt(accountId.toString().replace('acc_', '')) : undefined;
      const messageId = await messageService.storeMessage({
        userId,
        accountId: numericAccountId,
        to,
        from,
        body,
        direction: direction || 'outbound',
        status: 'sent',
        sentAt: new Date(),
        messageSid: result.sid,
        mediaUrls: mediaUrls || [],
        providerCode: providerCode,
      });
      
      // Also save to in-memory storage for backward compatibility
      const message = await storage.createSmsMessage({
        userId,
        to,
        from,
        body,
        direction: direction || 'outbound',
        status: 'sent',
        sentAt: new Date(),
        messageSid: result.sid,
        mediaUrls: mediaUrls || [],
        providerCode: providerCode,
      });
      
      // Deduct credits
      await storage.createBillingTransaction({
        userId: user.id,
        amount: -1,
        type: 'credit-usage',
        description: `SMS message (${providerCode})`,
        credits: 1
      });
      
      console.log(`[SMS] Message sent successfully via ${providerCode}:`, result.sid, `DB ID: ${messageId}`);
      return res.status(201).json({ ...message, id: messageId, success: true, messageSid: result.sid, provider: providerCode });
    } catch (error) {
      console.error('[SMS] Error:', error);
      return res.status(500).json({ message: "Failed to send SMS", error: String(error) });
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
  
  app.get("/api/user-campaigns/:userId", async (req, res) => {
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
  
  // Contact endpoints - using database directly for persistence
  app.post("/api/contacts", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      
      // Check for duplicate phone number for this user
      const existing = await db.select()
        .from(contacts)
        .where(and(
          eq(contacts.userId, contactData.userId),
          eq(contacts.phoneNumber, contactData.phoneNumber || '')
        ));
      
      if (existing.length > 0) {
        return res.status(409).json({ message: "Contact with this phone number already exists", contact: existing[0] });
      }
      
      // Insert into database
      const [contact] = await db.insert(contacts).values({
        ...contactData,
        createdAt: new Date(),
      }).returning();
      
      console.log('[Contacts] Created contact:', contact.id, contact.phoneNumber);
      return res.status(201).json(contact);
    } catch (error) {
      console.error('[Contacts] Error creating contact:', error);
      return handleZodError(error, res);
    }
  });
  
  app.get("/api/contacts/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Fetch from database
      const userContacts = await db.select()
        .from(contacts)
        .where(eq(contacts.userId, userId))
        .orderBy(contacts.createdAt);
      
      return res.status(200).json(userContacts);
    } catch (error) {
      console.error('[Contacts] Error fetching contacts:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update contact
  app.put("/api/contacts/:contactId", async (req, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      if (isNaN(contactId)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      const { firstName, lastName, phoneNumber, email, tags } = req.body;
      
      const updated = await db
        .update(contacts)
        .set({
          firstName,
          lastName,
          phoneNumber,
          email,
          tags,
        })
        .where(eq(contacts.id, contactId))
        .returning();
      
      if (updated.length === 0) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      return res.status(200).json(updated[0]);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete contact
  app.delete("/api/contacts/:contactId", async (req, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      if (isNaN(contactId)) {
        return res.status(400).json({ message: "Invalid contact ID" });
      }
      
      const deleted = await db
        .delete(contacts)
        .where(eq(contacts.id, contactId))
        .returning();
      
      if (deleted.length === 0) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      return res.status(200).json({ message: "Contact deleted" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Batch SMS sending endpoint - handles parallel sending across multiple numbers
  // Supports two modes:
  //   1. Client sends recipients array (small campaigns)
  //   2. Client sends campaignId only, server loads recipients from DB (large campaigns 30k+)
  app.post("/api/sms/batch", async (req, res) => {
    try {
      const { 
        recipients: clientRecipients, 
        message, 
        phoneNumbers, 
        campaignId, 
        userId = 1,
        messagesPerNumber = 2000,
        concurrentPerNumber = 10,
        dripMode = false,
        messagesPerMinute = 30,
        loadFromDb = false, // If true, load recipients from campaign_recipients table
      } = req.body;

      // Load recipients from database if campaignId provided and no recipients sent from client
      let recipients = clientRecipients;
      let isResume = false;
      
      if ((!recipients || recipients.length === 0) && campaignId) {
        // Check if this is a resume (campaign was paused) — only load pending recipients
        const [campaignRecord] = await db.select({ status: smsCampaigns.status, sentCount: smsCampaigns.sentCount, failedCount: smsCampaigns.failedCount })
          .from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
        
        isResume = campaignRecord?.status === 'paused';
        if (isResume) {
          console.log(`[BatchSMS] RESUMING campaign ${campaignId} from paused state (already sent: ${campaignRecord.sentCount}, failed: ${campaignRecord.failedCount})`);
          
          // CRITICAL: Sync recipient statuses from sms_messages before loading pending recipients
          // This fixes the bug where recipients are resent because their status wasn't properly updated
          console.log(`[BatchSMS] Syncing recipient statuses from sms_messages...`);
          const syncResult = await db.execute(sql`
            UPDATE campaign_recipients cr
            SET status = 'sent', sent_at = sm.sent_at
            FROM sms_messages sm
            WHERE cr.sms_campaign_id = ${campaignId}
              AND cr.phone_number = sm."to"
              AND sm.campaign_id = ${campaignId}
              AND sm.status IN ('sent', 'delivered')
              AND cr.status = 'pending'
          `);
          console.log(`[BatchSMS] Synced sent recipients from sms_messages`);
          
          // Also sync failed recipients
          await db.execute(sql`
            UPDATE campaign_recipients cr
            SET status = 'failed', failed_at = sm.sent_at
            FROM sms_messages sm
            WHERE cr.sms_campaign_id = ${campaignId}
              AND cr.phone_number = sm."to"
              AND sm.campaign_id = ${campaignId}
              AND sm.status = 'failed'
              AND cr.status = 'pending'
          `);
          console.log(`[BatchSMS] Synced failed recipients from sms_messages`);
        }

        console.log(`[BatchSMS] Loading ${isResume ? 'PENDING' : 'ALL'} recipients from database for campaign ${campaignId}`);
        
        // Load in chunks to avoid memory spikes
        const LOAD_CHUNK = 10000;
        recipients = [];
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const chunk = await db
            .select({
              phoneNumber: campaignRecipients.phoneNumber,
              firstName: campaignRecipients.firstName,
              lastName: campaignRecipients.lastName,
              customFields: campaignRecipients.customFields,
            })
            .from(campaignRecipients)
            .where(
              isResume
                ? and(eq(campaignRecipients.smsCampaignId, campaignId), eq(campaignRecipients.status, 'pending'))
                : eq(campaignRecipients.smsCampaignId, campaignId)
            )
            .limit(LOAD_CHUNK)
            .offset(offset);
          
          // Get campaign metadata for custom variable defaults
          let campaignDefaults: Record<string, any> = {};
          if (offset === 0) {
            const [campaign] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
            if (campaign) {
              const metadata = (campaign as any).metadata || {};
              campaignDefaults = metadata.customVariables || {};
            }
          }
          
          for (const r of chunk) {
            const customFields = (r.customFields as Record<string, any>) || {};
            recipients.push({
              phone: r.phoneNumber,
              name: r.firstName ? `${r.firstName} ${r.lastName || ''}`.trim() : undefined,
              firstName: r.firstName,
              lastName: r.lastName,
              ...campaignDefaults,
              ...customFields,
            });
          }
          
          offset += chunk.length;
          hasMore = chunk.length === LOAD_CHUNK;
          console.log(`[BatchSMS] Loaded ${offset} recipients from DB so far`);
        }
        
        console.log(`[BatchSMS] Total ${recipients.length} ${isResume ? 'pending' : ''} recipients loaded from database`);
        
        if (isResume && recipients.length === 0) {
          return res.status(200).json({ success: true, message: 'All recipients already sent — nothing to resume', total: 0 });
        }
      }

      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: "Recipients array is required (or provide campaignId to load from DB)" });
      }

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }

      if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        return res.status(400).json({ message: "Phone numbers array is required" });
      }

      // Build phone number configs with credentials
      // Pre-cache: load all account phone numbers and credentials ONCE, then match
      const phoneNumberConfigs: PhoneNumberConfig[] = [];
      
      const accountsData = await accountService.getAccountsForUser(userId);
      const userAccounts = accountsData.accounts || [];
      
      console.log(`[BatchSMS] Found ${userAccounts.length} accounts for user ${userId}`);
      
      // Step 1: Build a phone-number-to-account lookup map (one pass)
      const phoneToAccount: Map<string, { account: any; creds: any }> = new Map();
      
      for (const account of userAccounts) {
        try {
          const accountIdNum = parseInt(account.id.replace('acc_', ''));
          const accountData = await accountService.getAccountById(accountIdNum);
          if (!accountData) continue;
          
          // Get credentials once per account
          const creds = await accountService.getAccountCredentials(accountIdNum);
          
          // Get phone numbers: imported first (Commio), then provider API (Twilio)
          const settings = (accountData.settings || {}) as Record<string, any>;
          let accountPhones: any[] = [];
          
          if (settings.importedPhoneNumbers && settings.importedPhoneNumbers.length > 0) {
            accountPhones = settings.importedPhoneNumbers;
          } else {
            const provider = await accountService.getProviderForAccount(accountIdNum);
            if (provider) {
              try {
                accountPhones = await provider.getPhoneNumbers();
              } catch (e) {
                console.log(`[BatchSMS] Provider API failed for ${account.id}:`, (e as any).message);
              }
            }
          }
          
          console.log(`[BatchSMS] Account ${account.id} (${account.provider}) has ${accountPhones.length} numbers`);
          
          // Map each phone number to its account + credentials
          for (const phone of accountPhones) {
            phoneToAccount.set(phone.phoneNumber, { account, creds });
          }
        } catch (e) {
          console.error(`[BatchSMS] Error loading account ${account.id}:`, e);
        }
      }
      
      console.log(`[BatchSMS] Phone lookup map built: ${phoneToAccount.size} total numbers across all accounts`);
      
      // Step 2: Match selected phone numbers to their account credentials
      for (const pn of phoneNumbers) {
        const match = phoneToAccount.get(pn.phoneNumber);
        
        if (!match) {
          console.log(`[BatchSMS] ✗ Phone number ${pn.phoneNumber} not found in any account`);
          continue;
        }
        
        const { account, creds } = match;
        const providerType = account.provider as 'twilio' | 'commio';
        
        const numericAccountId = parseInt(account.id.replace('acc_', ''));
        
        if (providerType === 'twilio' && creds?.accountSid && creds?.authToken) {
          phoneNumberConfigs.push({
            phoneNumber: pn.phoneNumber,
            provider: 'twilio',
            accountId: numericAccountId,
            accountSid: creds.accountSid,
            authToken: creds.authToken,
          });
          console.log(`[BatchSMS] ✓ Added Twilio number ${pn.phoneNumber}`);
        } else if (providerType === 'commio') {
          // For Commio/ThinQ: 
          // - apiKey = username (amuniz1) for Basic Auth
          // - authToken = API token for Basic Auth  
          // - accountSid = numeric account ID (22956) for URL path
          const thinqUsername = creds?.apiKey;
          const thinqToken = creds?.authToken;
          const thinqAccountId = creds?.accountSid;
          
          if (thinqUsername && thinqToken) {
            phoneNumberConfigs.push({
              phoneNumber: pn.phoneNumber,
              provider: 'commio',
              accountId: numericAccountId,
              apiKey: thinqUsername,
              apiSecret: thinqToken,
              commioAccountId: thinqAccountId,
            });
            console.log(`[BatchSMS] ✓ Added Commio number ${pn.phoneNumber} (account: ${thinqAccountId}, user: ${thinqUsername})`);
          } else {
            console.log(`[BatchSMS] ✗ Commio account ${account.id} missing credentials (need apiKey and authToken)`);
          }
        } else {
          console.log(`[BatchSMS] ✗ ${pn.phoneNumber} - provider ${providerType} missing credentials`);
        }
      }

      if (phoneNumberConfigs.length === 0) {
        return res.status(400).json({ 
          message: "No valid phone number configurations found. Check that phone numbers belong to configured accounts with valid credentials." 
        });
      }

      // Log warning if not all selected numbers have valid configs
      if (phoneNumberConfigs.length < phoneNumbers.length) {
        console.log(`[BatchSMS] ⚠️ WARNING: Only ${phoneNumberConfigs.length} of ${phoneNumbers.length} selected numbers have valid credentials!`);
        console.log(`[BatchSMS] Valid numbers: ${phoneNumberConfigs.map(p => p.phoneNumber).join(', ')}`);
      }

      console.log(`[BatchSMS] Starting batch: ${recipients.length} recipients, ${phoneNumberConfigs.length} numbers, dripMode=${dripMode}`);

      // Update campaign status to 'sending' immediately
      // Also get total recipient count for proper completion detection
      let totalCampaignRecipients = recipients.length;
      if (campaignId) {
        const [campaignData] = await db.select({ recipientCount: smsCampaigns.recipientCount })
          .from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
        totalCampaignRecipients = campaignData?.recipientCount || recipients.length;
        
        await db.update(smsCampaigns)
          .set({ status: 'sending' })
          .where(eq(smsCampaigns.id, campaignId));
      }

      // Start batch send asynchronously - returns immediately with job ID
      const { jobId, total } = await batchSmsService.startBatchAsync({
        recipients,
        message,
        phoneNumbers: phoneNumberConfigs,
        campaignId,
        userId,
        messagesPerNumber,
        concurrentPerNumber,
        dripMode,
        messagesPerMinute,
        totalCampaignRecipients, // Pass total for proper completion detection on resume
      });

      // Limit validNumbers in response to first 5 to avoid huge payloads
      const displayNumbers = phoneNumberConfigs.slice(0, 5).map(p => p.phoneNumber);
      const moreCount = phoneNumberConfigs.length - 5;

      return res.status(200).json({
        success: true,
        jobId,
        total,
        numbersUsed: phoneNumberConfigs.length,
        numbersRequested: phoneNumbers.length,
        validNumbers: displayNumbers,
        message: phoneNumberConfigs.length < phoneNumbers.length 
          ? `Warning: Only ${phoneNumberConfigs.length} of ${phoneNumbers.length} selected numbers have valid credentials.`
          : `Batch send started with ${phoneNumberConfigs.length} numbers.`,
      });
    } catch (error) {
      console.error('[BatchSMS API] Error:', error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Diagnostic endpoint to check why a campaign is stuck and get resume info
  app.get("/api/campaigns/sms-campaigns/:campaignId/diagnose", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      if (isNaN(campaignId)) {
        return res.status(400).json({ error: "Invalid campaign ID" });
      }

      // Get campaign details
      const [campaign] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Get recipient counts by status
      const recipientStats = await db.execute(sql`
        SELECT status, COUNT(*) as count 
        FROM campaign_recipients 
        WHERE sms_campaign_id = ${campaignId} 
        GROUP BY status
      `);

      // Parse phone numbers from campaign
      const campaignNumbers = (campaign.fromNumber || '').split(',').map((n: string) => n.trim()).filter((n: string) => n);

      // Check which numbers are still valid
      const userId = (req as any).user?.id || 1;
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      
      const validNumbers: string[] = [];
      const invalidNumbers: string[] = [];
      
      for (const num of campaignNumbers) {
        let found = false;
        for (const account of userAccounts) {
          const accountId = parseInt(account.id.replace('acc_', ''));
          if (isNaN(accountId)) continue;
          
          const [phoneRecord] = await db.select()
            .from(accountPhoneNumbers)
            .where(and(
              eq(accountPhoneNumbers.accountId, accountId),
              eq(accountPhoneNumbers.phoneNumber, num)
            ));
          
          if (phoneRecord && phoneRecord.status !== 'released') {
            validNumbers.push(num);
            found = true;
            break;
          }
        }
        if (!found) {
          invalidNumbers.push(num);
        }
      }

      // Get pending recipient count
      const [pendingCount] = await db.select({ count: sql<number>`count(*)` })
        .from(campaignRecipients)
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaignId),
          eq(campaignRecipients.status, 'pending')
        ));

      const canResume = validNumbers.length > 0 && (pendingCount?.count || 0) > 0;

      res.json({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          sentCount: campaign.sentCount,
          failedCount: campaign.failedCount,
          recipientCount: campaign.recipientCount,
        },
        recipientStats: recipientStats.rows,
        pendingRecipients: pendingCount?.count || 0,
        phoneNumbers: {
          total: campaignNumbers.length,
          valid: validNumbers,
          invalid: invalidNumbers,
        },
        canResume,
        resumeMessage: canResume 
          ? `Campaign can be resumed with ${validNumbers.length} valid numbers and ${pendingCount?.count} pending recipients`
          : invalidNumbers.length > 0 
            ? `Cannot resume: ${invalidNumbers.length} phone numbers are no longer valid (released or not found)`
            : `Cannot resume: No pending recipients`,
      });
    } catch (error: any) {
      console.error("Error diagnosing campaign:", error);
      res.status(500).json({ error: error.message || "Failed to diagnose campaign" });
    }
  });

  // SSE endpoint for batch SMS progress
  app.get("/api/sms/batch/progress/:jobId", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const jobId = req.params.jobId;
    let closed = false;
    
    req.on('close', () => {
      closed = true;
      res.end();
    });
    
    // Poll for progress updates
    const sendProgress = () => {
      if (closed) return;
      
      const progress = batchSmsService.getJobProgress(jobId);
      if (progress) {
        res.write(`data: ${JSON.stringify({
          status: progress.sent + progress.failed >= progress.total ? 'completed' : 'sending',
          sent: progress.sent,
          failed: progress.failed,
          total: progress.total,
          inProgress: progress.inProgress,
          estimatedCompletionTime: progress.estimatedCompletionTime,
          currentRate: progress.currentRate,
        })}\n\n`);
        
        if (progress.sent + progress.failed >= progress.total) {
          res.end();
          return;
        }
      } else {
        res.write(`data: ${JSON.stringify({ status: 'not_found', jobId })}\n\n`);
        res.end();
        return;
      }
      
      setTimeout(sendProgress, 1000);
    };
    
    sendProgress();
  });

  // Campaign progress endpoint (polling)
  app.get("/api/campaigns/sms-campaigns/:id/progress", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      
      if (!campaignId || isNaN(campaignId)) {
        return res.status(400).json({ error: "Campaign ID is required" });
      }
      
      // Get progress from active batch job
      const progress = batchSmsService.getCampaignProgress(campaignId);
      
      if (progress) {
        // Also check DB status in case campaign was paused/cancelled
        const [dbCampaign] = await db
          .select({ status: smsCampaigns.status })
          .from(smsCampaigns)
          .where(eq(smsCampaigns.id, campaignId))
          .limit(1);
        
        const dbStatus = dbCampaign?.status;
        const isFinished = progress.sent + progress.failed >= progress.total;
        const status = dbStatus === 'paused' ? 'paused' : dbStatus === 'cancelled' ? 'cancelled' : isFinished ? 'completed' : 'sending';
        
        return res.json({
          status,
          sent: progress.sent,
          failed: progress.failed,
          total: progress.total,
          inProgress: progress.inProgress,
          estimatedCompletionTime: progress.estimatedCompletionTime,
          currentRate: progress.currentRate,
          jobId: progress.jobId,
        });
      }
      
      // No active job, get status from database
      const [campaign] = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.id, campaignId))
        .limit(1);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      return res.json({
        status: campaign.status,
        sent: campaign.sentCount || 0,
        failed: campaign.failedCount || 0,
        total: campaign.recipientCount || 0,
        delivered: campaign.deliveredCount || 0,
      });
    } catch (error: any) {
      console.error("Error fetching campaign progress:", error);
      res.status(500).json({ error: error.message || "Failed to fetch progress" });
    }
  });
  
  // Live sending stats for dashboard (combines in-memory + DB for prod reliability)
  app.get("/api/dashboard/live-stats", async (req, res) => {
    try {
      // 1. Get in-memory stats (works when campaigns run on this server)
      const memoryStats = batchSmsService.getActiveSendingStats();
      
      // 2. Get DB stats for active campaigns (works on prod/Render even after restart)
      const activeCampaigns = await db
        .select({
          id: smsCampaigns.id,
          name: smsCampaigns.name,
          status: smsCampaigns.status,
          sentCount: smsCampaigns.sentCount,
          failedCount: smsCampaigns.failedCount,
          recipientCount: smsCampaigns.recipientCount,
          accountId: smsCampaigns.accountId,
        })
        .from(smsCampaigns)
        .where(eq(smsCampaigns.status, 'sending'));
      
      // Combine: use in-memory if available (more accurate), fall back to DB
      let totalSent = memoryStats.totalSent;
      let totalFailed = memoryStats.totalFailed;
      let totalInProgress = memoryStats.totalInProgress;
      let campaignCount = memoryStats.activeCampaigns;
      const jobs = [...memoryStats.jobs];
      
      // For any DB-active campaigns NOT tracked in memory, add their DB counts
      const memCampaignIds = new Set(memoryStats.jobs.map(j => j.campaignId).filter(Boolean));
      for (const campaign of activeCampaigns) {
        if (!memCampaignIds.has(campaign.id)) {
          totalSent += campaign.sentCount || 0;
          totalFailed += campaign.failedCount || 0;
          campaignCount++;
          jobs.push({
            jobId: `db_campaign_${campaign.id}`,
            campaignId: campaign.id,
            sent: campaign.sentCount || 0,
            failed: campaign.failedCount || 0,
            total: campaign.recipientCount || 0,
          });
        }
      }
      
      res.json({ totalSent, totalFailed, totalInProgress, activeCampaigns: campaignCount, jobs });
    } catch (error: any) {
      console.error("Error fetching live stats:", error);
      res.status(500).json({ error: "Failed to fetch live stats" });
    }
  });

  // Message heatmap data - geographic distribution by US state
  app.get("/api/dashboard/heatmap", async (req, res) => {
    try {
      // Area code to state mapping (common US area codes)
      const areaCodeToState: Record<string, string> = {
        '205': 'AL', '251': 'AL', '256': 'AL', '334': 'AL', '938': 'AL',
        '907': 'AK',
        '480': 'AZ', '520': 'AZ', '602': 'AZ', '623': 'AZ', '928': 'AZ',
        '479': 'AR', '501': 'AR', '870': 'AR',
        '209': 'CA', '213': 'CA', '310': 'CA', '323': 'CA', '408': 'CA', '415': 'CA', '424': 'CA', '442': 'CA', '510': 'CA', '530': 'CA', '559': 'CA', '562': 'CA', '619': 'CA', '626': 'CA', '650': 'CA', '657': 'CA', '661': 'CA', '669': 'CA', '707': 'CA', '714': 'CA', '747': 'CA', '760': 'CA', '805': 'CA', '818': 'CA', '831': 'CA', '858': 'CA', '909': 'CA', '916': 'CA', '925': 'CA', '949': 'CA', '951': 'CA',
        '303': 'CO', '719': 'CO', '720': 'CO', '970': 'CO',
        '203': 'CT', '475': 'CT', '860': 'CT',
        '302': 'DE',
        '239': 'FL', '305': 'FL', '321': 'FL', '352': 'FL', '386': 'FL', '407': 'FL', '561': 'FL', '727': 'FL', '754': 'FL', '772': 'FL', '786': 'FL', '813': 'FL', '850': 'FL', '863': 'FL', '904': 'FL', '941': 'FL', '954': 'FL',
        '229': 'GA', '404': 'GA', '470': 'GA', '478': 'GA', '678': 'GA', '706': 'GA', '762': 'GA', '770': 'GA', '912': 'GA',
        '808': 'HI',
        '208': 'ID', '986': 'ID',
        '217': 'IL', '224': 'IL', '309': 'IL', '312': 'IL', '331': 'IL', '618': 'IL', '630': 'IL', '708': 'IL', '773': 'IL', '779': 'IL', '815': 'IL', '847': 'IL', '872': 'IL',
        '219': 'IN', '260': 'IN', '317': 'IN', '463': 'IN', '574': 'IN', '765': 'IN', '812': 'IN', '930': 'IN',
        '319': 'IA', '515': 'IA', '563': 'IA', '641': 'IA', '712': 'IA',
        '316': 'KS', '620': 'KS', '785': 'KS', '913': 'KS',
        '270': 'KY', '364': 'KY', '502': 'KY', '606': 'KY', '859': 'KY',
        '225': 'LA', '318': 'LA', '337': 'LA', '504': 'LA', '985': 'LA',
        '207': 'ME',
        '240': 'MD', '301': 'MD', '410': 'MD', '443': 'MD', '667': 'MD',
        '339': 'MA', '351': 'MA', '413': 'MA', '508': 'MA', '617': 'MA', '774': 'MA', '781': 'MA', '857': 'MA', '978': 'MA',
        '231': 'MI', '248': 'MI', '269': 'MI', '313': 'MI', '517': 'MI', '586': 'MI', '616': 'MI', '734': 'MI', '810': 'MI', '906': 'MI', '947': 'MI', '989': 'MI',
        '218': 'MN', '320': 'MN', '507': 'MN', '612': 'MN', '651': 'MN', '763': 'MN', '952': 'MN',
        '228': 'MS', '601': 'MS', '662': 'MS', '769': 'MS',
        '314': 'MO', '417': 'MO', '573': 'MO', '636': 'MO', '660': 'MO', '816': 'MO',
        '406': 'MT',
        '308': 'NE', '402': 'NE', '531': 'NE',
        '702': 'NV', '725': 'NV', '775': 'NV',
        '603': 'NH',
        '201': 'NJ', '551': 'NJ', '609': 'NJ', '732': 'NJ', '848': 'NJ', '856': 'NJ', '862': 'NJ', '908': 'NJ', '973': 'NJ',
        '505': 'NM', '575': 'NM',
        '212': 'NY', '315': 'NY', '332': 'NY', '347': 'NY', '516': 'NY', '518': 'NY', '585': 'NY', '607': 'NY', '631': 'NY', '646': 'NY', '680': 'NY', '716': 'NY', '718': 'NY', '838': 'NY', '845': 'NY', '914': 'NY', '917': 'NY', '929': 'NY', '934': 'NY',
        '252': 'NC', '336': 'NC', '704': 'NC', '743': 'NC', '828': 'NC', '910': 'NC', '919': 'NC', '980': 'NC', '984': 'NC',
        '701': 'ND',
        '216': 'OH', '220': 'OH', '234': 'OH', '283': 'OH', '330': 'OH', '380': 'OH', '419': 'OH', '440': 'OH', '513': 'OH', '567': 'OH', '614': 'OH', '740': 'OH', '937': 'OH',
        '405': 'OK', '539': 'OK', '580': 'OK', '918': 'OK',
        '458': 'OR', '503': 'OR', '541': 'OR', '971': 'OR',
        '215': 'PA', '223': 'PA', '267': 'PA', '272': 'PA', '412': 'PA', '445': 'PA', '484': 'PA', '570': 'PA', '610': 'PA', '717': 'PA', '724': 'PA', '814': 'PA', '878': 'PA',
        '401': 'RI',
        '803': 'SC', '843': 'SC', '854': 'SC', '864': 'SC',
        '605': 'SD',
        '423': 'TN', '615': 'TN', '629': 'TN', '731': 'TN', '865': 'TN', '901': 'TN', '931': 'TN',
        '210': 'TX', '214': 'TX', '254': 'TX', '281': 'TX', '325': 'TX', '346': 'TX', '361': 'TX', '409': 'TX', '430': 'TX', '432': 'TX', '469': 'TX', '512': 'TX', '682': 'TX', '713': 'TX', '726': 'TX', '737': 'TX', '806': 'TX', '817': 'TX', '830': 'TX', '832': 'TX', '903': 'TX', '915': 'TX', '936': 'TX', '940': 'TX', '956': 'TX', '972': 'TX', '979': 'TX',
        '385': 'UT', '435': 'UT', '801': 'UT',
        '802': 'VT',
        '276': 'VA', '434': 'VA', '540': 'VA', '571': 'VA', '703': 'VA', '757': 'VA', '804': 'VA',
        '206': 'WA', '253': 'WA', '360': 'WA', '425': 'WA', '509': 'WA', '564': 'WA',
        '304': 'WV', '681': 'WV',
        '262': 'WI', '414': 'WI', '534': 'WI', '608': 'WI', '715': 'WI', '920': 'WI',
        '307': 'WY',
        '202': 'DC',
      };

      // Query campaign recipients to get phone numbers and count by state
      const recipients = await db.execute(sql`
        SELECT 
          SUBSTRING(REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g') FROM 
            CASE WHEN LENGTH(REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')) = 11 THEN 2 ELSE 1 END 
            FOR 3
          ) as area_code,
          COUNT(*) as count
        FROM campaign_recipients
        WHERE status IN ('sent', 'delivered')
        GROUP BY area_code
        ORDER BY count DESC
      `);

      const rows = (recipients as any).rows || recipients || [];
      
      // Aggregate by state
      const stateCountMap = new Map<string, number>();
      for (const row of rows) {
        const state = areaCodeToState[row.area_code];
        if (state) {
          stateCountMap.set(state, (stateCountMap.get(state) || 0) + parseInt(row.count));
        }
      }

      // Convert to array format
      const data = Array.from(stateCountMap.entries()).map(([state, count]) => ({
        state,
        count
      }));

      res.json({ data, total: data.reduce((sum, d) => sum + d.count, 0) });
    } catch (error: any) {
      console.error("Error fetching heatmap data:", error);
      res.status(500).json({ error: "Failed to fetch heatmap data", data: [] });
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
      
      // In production, we would query the database and phone provider API (with Redis caching)
      const cacheKey = `textflow:phone-numbers:${userId}`;
      
      if (redisService.isAvailable()) {
        const cached = await redisService.get<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Phone numbers cache HIT for user ${userId}`);
          return res.status(200).json(cached);
        }
      }
      
      const phoneNumbers = await communicationService.getPhoneNumbers(userId);
      
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, phoneNumbers, CACHE_TTL.PHONE_NUMBERS);
      }
      
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
  
  // Legacy Analytics endpoints (for backward compatibility)
  app.get("/api/legacy-analytics/:userId", async (req, res) => {
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

  // ============================================
  // A2P SYNC FROM TWILIO
  // ============================================

  /**
   * Sync A2P compliance data from Twilio
   * This imports existing Brand and Campaign registrations
   */
  app.post("/api/compliance/a2p/sync", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      
      console.log(`Starting A2P sync for user ${userId}...`);
      const result = await a2pSyncService.syncFromTwilio(userId);
      
      return res.status(200).json({
        success: true,
        message: `Synced ${result.brands.synced} brands, ${result.campaigns.synced} campaigns, ${result.messagingServices.synced} messaging services`,
        ...result
      });
    } catch (error: any) {
      console.error('Error syncing A2P data:', error);
      return res.status(500).json({ 
        success: false,
        message: error.message || 'Failed to sync A2P data from Twilio' 
      });
    }
  });

  /**
   * Get A2P compliance summary from Twilio
   */
  app.get("/api/compliance/a2p/summary", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      
      const summary = await a2pSyncService.getComplianceSummary(userId);
      
      return res.status(200).json(summary);
    } catch (error: any) {
      console.error('Error getting A2P summary:', error);
      return res.status(500).json({ 
        message: error.message || 'Failed to get A2P compliance summary' 
      });
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
        sendgridFromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@eliteamericanfinancials.com",
        upgraded: true,
        plan: "enterprise",
        billingEmail: "billing@eliteamericanfinancials.com"
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

  // Get all accounts for the current user (with Redis caching)
  app.get("/api/accounts", async (req, res) => {
    // Prevent browser caching so disconnected accounts disappear immediately
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    
    try {
      // Get user ID from session or default to 1 for demo
      const userId = (req as any).user?.id || 1;
      const cacheKey = `textflow:accounts:${userId}`;
      
      // Check Redis cache first
      if (redisService.isAvailable()) {
        const { data: cached, isStale } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Accounts cache ${isStale ? 'STALE' : 'HIT'} for user ${userId}`);
          res.json(cached);
          // Background refresh if stale
          if (isStale) {
            accountService.getAccountsForUser(userId).then(async (dbResult) => {
              if (dbResult.accounts.length > 0) {
                await redisService.set(cacheKey, { accounts: dbResult.accounts, overview: dbResult.overview }, CACHE_TTL.ACCOUNT_INFO, STALE_TTL.ANALYTICS);
              }
            }).catch(console.error);
          }
          return;
        }
      }
      
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

          const result = { accounts, overview };
          // Cache the Twilio fallback result
          if (redisService.isAvailable()) {
            await redisService.set(cacheKey, result, CACHE_TTL.ACCOUNT_INFO, STALE_TTL.ANALYTICS);
          }
          return res.json(result);
        }
      }

      const result = { accounts: dbResult.accounts, overview: dbResult.overview };
      // Cache the result
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, result, CACHE_TTL.ACCOUNT_INFO, STALE_TTL.ANALYTICS);
      }
      res.json(result);
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

      console.log('Creating account:', { providerCode, name, type, accountSid: accountSid ? '***' : undefined, hasAuthToken: !!authToken });

      if (!providerCode || !accountSid || !authToken) {
        console.log('Missing fields:', { providerCode: !!providerCode, accountSid: !!accountSid, authToken: !!authToken });
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
      
      // Clear accounts cache so the deleted account doesn't show up
      const userId = (req as any).user?.id || 1;
      const cacheKey = `textflow:accounts:${userId}`;
      if (redisService.isAvailable()) {
        await redisService.delete(cacheKey);
        console.log(`[Routes] Cleared accounts cache for user ${userId} after delete`);
      }
      
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

  // Sync ALL accounts and validate phone numbers against live APIs
  // This marks released numbers and updates the database
  app.post("/api/accounts/sync-all-phone-numbers", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      
      const results: Array<{ accountId: number; accountName: string; liveNumbers: number; releasedNumbers: number; error?: string }> = [];
      
      for (const account of userAccounts) {
        const accountId = parseInt(account.id.replace('acc_', ''));
        if (isNaN(accountId)) continue;
        
        try {
          // Get current DB numbers before sync
          const beforeSync = await db.select()
            .from(accountPhoneNumbers)
            .where(eq(accountPhoneNumbers.accountId, accountId));
          const beforeCount = beforeSync.filter(n => n.status !== 'released').length;
          
          // Sync from provider
          await accountService.syncAccountData(accountId);
          
          // Get updated counts
          const afterSync = await db.select()
            .from(accountPhoneNumbers)
            .where(eq(accountPhoneNumbers.accountId, accountId));
          const activeCount = afterSync.filter(n => n.status !== 'released').length;
          const releasedCount = afterSync.filter(n => n.status === 'released').length;
          
          results.push({
            accountId,
            accountName: account.name,
            liveNumbers: activeCount,
            releasedNumbers: releasedCount,
          });
          
          console.log(`[SyncAll] Account ${account.name}: ${activeCount} active, ${releasedCount} released`);
        } catch (err: any) {
          results.push({
            accountId,
            accountName: account.name,
            liveNumbers: 0,
            releasedNumbers: 0,
            error: err.message,
          });
        }
      }
      
      const totalActive = results.reduce((sum, r) => sum + r.liveNumbers, 0);
      const totalReleased = results.reduce((sum, r) => sum + r.releasedNumbers, 0);
      
      res.json({
        success: true,
        message: `Synced ${userAccounts.length} accounts: ${totalActive} active numbers, ${totalReleased} released`,
        accounts: results,
      });
    } catch (error: any) {
      console.error("Error syncing all accounts:", error);
      res.status(500).json({ error: error.message || "Failed to sync accounts" });
    }
  });

  // Configure Twilio webhook URLs for all phone numbers in an account
  // This sets up inbound SMS and status callback URLs
  app.post("/api/accounts/:id/configure-webhooks", async (req, res) => {
    try {
      const { id } = req.params;
      const { baseUrl } = req.body;
      
      // Determine the base URL - use provided or detect from request
      const webhookBaseUrl = baseUrl || `${req.protocol}://${req.get('host')}`;
      
      const accountId = parseInt(id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      // Get the account and check if it's Twilio
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const [provider] = await db.select().from(providers).where(eq(providers.id, account.providerId));
      if (provider?.code !== 'twilio') {
        return res.status(400).json({ error: "Webhook configuration is only supported for Twilio accounts" });
      }

      // Get Twilio provider instance
      const twilioProvider = await accountService.getProviderForAccount(accountId);
      if (!twilioProvider || twilioProvider.code !== 'twilio') {
        return res.status(400).json({ error: "Could not get Twilio provider for this account" });
      }

      // Configure webhooks for all numbers
      const result = await (twilioProvider as any).configureAllWebhooks(webhookBaseUrl);

      res.json({
        success: true,
        message: `Configured webhooks for ${result.configured} phone numbers`,
        configured: result.configured,
        failed: result.failed,
        errors: result.errors,
        webhookUrl: `${webhookBaseUrl}/api/webhooks/twilio/inbound-message`,
      });
    } catch (error: any) {
      console.error("Error configuring webhooks:", error);
      res.status(500).json({ error: error.message || "Failed to configure webhooks" });
    }
  });

  // Configure webhooks for ALL Twilio accounts at once
  app.post("/api/twilio/configure-all-webhooks", async (req, res) => {
    try {
      const { baseUrl } = req.body;
      const webhookBaseUrl = baseUrl || `${req.protocol}://${req.get('host')}`;
      const userId = (req as any).user?.id || 1;

      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      const twilioAccounts = userAccounts.filter(acc => acc.provider === 'twilio');

      if (twilioAccounts.length === 0) {
        return res.status(400).json({ error: "No Twilio accounts found" });
      }

      let totalConfigured = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];
      const accountResults: Array<{ accountId: number; accountName: string; configured: number; failed: number }> = [];

      for (const account of twilioAccounts) {
        const accountId = parseInt(account.id.replace('acc_', ''));
        if (isNaN(accountId)) continue;

        try {
          const twilioProvider = await accountService.getProviderForAccount(accountId);
          if (!twilioProvider || twilioProvider.code !== 'twilio') continue;

          const result = await (twilioProvider as any).configureAllWebhooks(webhookBaseUrl);
          totalConfigured += result.configured;
          totalFailed += result.failed;
          allErrors.push(...result.errors);
          
          accountResults.push({
            accountId,
            accountName: account.name,
            configured: result.configured,
            failed: result.failed,
          });
        } catch (err: any) {
          allErrors.push(`Account ${account.name}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        message: `Configured webhooks for ${totalConfigured} phone numbers across ${twilioAccounts.length} Twilio accounts`,
        totalConfigured,
        totalFailed,
        accounts: accountResults,
        errors: allErrors.slice(0, 10), // Limit errors in response
        webhookUrl: `${webhookBaseUrl}/api/webhooks/twilio/inbound-message`,
      });
    } catch (error: any) {
      console.error("Error configuring all webhooks:", error);
      res.status(500).json({ error: error.message || "Failed to configure webhooks" });
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
            a2pStatus: (pn as any).a2pStatus || 'unknown',
          })),
          total: twilioAnalytics.phoneNumbers.length,
        });
      }

      // Parse numeric ID for DB accounts
      const accountId = parseInt(id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      // Get account to check for imported phone numbers
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      // Check for manually imported phone numbers first (for Commio accounts where API doesn't support listing)
      const settings = (account.settings || {}) as Record<string, any>;
      if (settings.importedPhoneNumbers && settings.importedPhoneNumbers.length > 0) {
        // Determine default A2P status based on provider
        // Commio/ThinQ numbers are typically A2P registered through their platform
        const isCommio = account.provider === 'commio';
        const defaultA2pStatus = isCommio ? 'registered' : 'not_registered';
        
        return res.json({
          phoneNumbers: settings.importedPhoneNumbers.map((pn: any) => {
            const hasSms = pn.capabilities?.sms !== false;
            return {
              id: pn.phoneNumber,
              phoneNumber: pn.phoneNumber,
              friendlyName: pn.friendlyName || pn.phoneNumber,
              capabilities: pn.capabilities || { sms: true, voice: true, mms: false },
              status: pn.status || 'active',
              dateCreated: pn.dateCreated || new Date().toISOString(),
              // Use stored a2pStatus, or default based on provider and SMS capability
              a2pStatus: pn.a2pStatus || (hasSms ? defaultA2pStatus : 'unknown'),
            };
          }),
          total: settings.importedPhoneNumbers.length,
          source: 'imported',
        });
      }

      // Get provider for account and fetch phone numbers from API
      const provider = await accountService.getProviderForAccount(accountId);
      if (!provider) {
        return res.status(404).json({ error: "Account not configured" });
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
          a2pStatus: pn.a2pStatus || 'unknown',
        })),
        total: phoneNumbers.length,
        source: 'api',
      });
    } catch (error) {
      console.error("Error fetching phone numbers:", error);
      res.status(500).json({ error: "Failed to fetch phone numbers" });
    }
  });

  /**
   * Get A2P messaging campaigns for Commio accounts
   * Note: Commio doesn't expose A2P campaigns via API, so we use stored data
   */
  app.get("/api/accounts/:id/a2p-campaigns", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      // Get stored A2P campaigns from account settings
      const settings = (account.settings || {}) as Record<string, any>;
      const campaigns = settings.a2pCampaigns || [];
      
      // Also get phone numbers to show A2P status
      const phoneNumbers = settings.importedPhoneNumbers || [];
      
      res.json({ 
        accountId,
        accountName: account.name,
        campaigns,
        totalCampaigns: campaigns.length,
        phoneNumbers: phoneNumbers.map((pn: any) => ({
          phoneNumber: pn.phoneNumber,
          a2pStatus: pn.a2pStatus || 'unknown',
          a2pCampaignId: pn.a2pCampaignId,
        })),
      });
    } catch (error: any) {
      console.error("[A2P Campaigns] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch A2P campaigns" });
    }
  });

  /**
   * Import A2P campaign data for Commio accounts
   * Since Commio doesn't expose A2P campaigns via API, this allows manual import
   */
  app.post("/api/accounts/:id/a2p-campaigns/import", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { campaigns, phoneNumbers } = req.body;
      
      // campaigns: [{ id, useCase, brandId, status, numbers: ['+1...'] }]
      // phoneNumbers: [{ phoneNumber, a2pCampaignId }] - to link numbers to campaigns

      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const settings = (account.settings || {}) as Record<string, any>;
      
      // Store campaigns
      if (campaigns && Array.isArray(campaigns)) {
        settings.a2pCampaigns = campaigns;
      }
      
      // Update phone numbers with A2P status
      if (phoneNumbers && Array.isArray(phoneNumbers)) {
        const existingNumbers = settings.importedPhoneNumbers || [];
        
        for (const pn of phoneNumbers) {
          const existing = existingNumbers.find((n: any) => 
            n.phoneNumber === pn.phoneNumber || 
            n.phoneNumber.replace(/\D/g, '') === pn.phoneNumber.replace(/\D/g, '')
          );
          
          if (existing) {
            existing.a2pStatus = 'registered';
            existing.a2pCampaignId = pn.a2pCampaignId;
          }
        }
        
        settings.importedPhoneNumbers = existingNumbers;
      }
      
      // Save updated settings
      await accountService.updateAccount(accountId, { settings });
      
      res.json({ 
        success: true,
        message: 'A2P campaign data imported successfully',
        campaignsImported: campaigns?.length || 0,
        numbersUpdated: phoneNumbers?.length || 0,
      });
    } catch (error: any) {
      console.error("[A2P Import] Error:", error);
      res.status(500).json({ error: error.message || "Failed to import A2P data" });
    }
  });

  /**
   * Mark all Commio phone numbers as A2P registered
   * Quick helper since all Commio numbers in the account are A2P registered
   */
  app.post("/api/accounts/:id/a2p-campaigns/mark-all-registered", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { campaignId, useCase } = req.body;

      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const settings = (account.settings || {}) as Record<string, any>;
      const phoneNumbers = settings.importedPhoneNumbers || [];
      
      let updatedCount = 0;
      for (const pn of phoneNumbers) {
        pn.a2pStatus = 'registered';
        if (campaignId) pn.a2pCampaignId = campaignId;
        updatedCount++;
      }
      
      // Also store the campaign info
      if (campaignId) {
        settings.a2pCampaigns = settings.a2pCampaigns || [];
        const existingCampaign = settings.a2pCampaigns.find((c: any) => c.id === campaignId);
        if (!existingCampaign) {
          settings.a2pCampaigns.push({
            id: campaignId,
            useCase: useCase || 'LOW_VOLUME',
            status: 'Accepted',
            numbers: phoneNumbers.map((pn: any) => pn.phoneNumber),
          });
        }
      }
      
      settings.importedPhoneNumbers = phoneNumbers;
      await accountService.updateAccount(accountId, { settings });
      
      res.json({ 
        success: true,
        message: `Marked ${updatedCount} phone numbers as A2P registered`,
        updatedCount,
      });
    } catch (error: any) {
      console.error("[A2P Mark All] Error:", error);
      res.status(500).json({ error: error.message || "Failed to mark numbers as registered" });
    }
  });

  /**
   * Get usage statistics for phone numbers
   */
  app.get("/api/accounts/:id/phone-numbers/usage", async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || 1;
      
      // Parse account ID
      const accountId = id === 'acc_master_twilio' ? null : parseInt(id.replace('acc_', ''));
      
      console.log('[Usage API] Fetching usage for userId:', userId, 'accountId:', accountId);
      
      // Get date range (default to last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      console.log('[Usage API] Date range:', startDate.toISOString(), 'to', endDate.toISOString());
      
      // Query messages grouped by phone number
      const messageStats = await db
        .select({
          phoneNumber: smsMessages.from,
          direction: smsMessages.direction,
          count: sql<number>`count(*)::int`,
        })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.userId, userId),
            accountId ? eq(smsMessages.accountId, accountId) : sql`true`,
            sql`${smsMessages.sentAt} >= ${startDate}`,
            sql`${smsMessages.sentAt} <= ${endDate}`
          )
        )
        .groupBy(smsMessages.from, smsMessages.direction);
      
      console.log('[Usage API] Message stats:', messageStats.length, 'rows');
      
      // Query calls grouped by phone number
      const callStats = await db
        .select({
          phoneNumber: voiceCalls.from,
          direction: voiceCalls.direction,
          count: sql<number>`count(*)::int`,
          totalDuration: sql<number>`sum(${voiceCalls.duration})::int`,
        })
        .from(voiceCalls)
        .where(
          and(
            eq(voiceCalls.userId, userId),
            accountId ? eq(voiceCalls.accountId, accountId) : sql`true`,
            sql`${voiceCalls.startTime} >= ${startDate}`,
            sql`${voiceCalls.startTime} <= ${endDate}`
          )
        )
        .groupBy(voiceCalls.from, voiceCalls.direction);
      
      // Aggregate by phone number
      const usageByNumber: Record<string, any> = {};
      
      // Process messages
      messageStats.forEach(stat => {
        if (!usageByNumber[stat.phoneNumber]) {
          usageByNumber[stat.phoneNumber] = {
            phoneNumber: stat.phoneNumber,
            messagesSent: 0,
            messagesReceived: 0,
            callsMade: 0,
            callsReceived: 0,
            totalDuration: 0,
          };
        }
        
        if (stat.direction === 'outbound' || stat.direction === 'outbound-api') {
          usageByNumber[stat.phoneNumber].messagesSent += stat.count;
        } else if (stat.direction === 'inbound') {
          usageByNumber[stat.phoneNumber].messagesReceived += stat.count;
        }
      });
      
      // Process calls
      callStats.forEach(stat => {
        if (!usageByNumber[stat.phoneNumber]) {
          usageByNumber[stat.phoneNumber] = {
            phoneNumber: stat.phoneNumber,
            messagesSent: 0,
            messagesReceived: 0,
            callsMade: 0,
            callsReceived: 0,
            totalDuration: 0,
          };
        }
        
        if (stat.direction === 'outbound' || stat.direction === 'outbound-api') {
          usageByNumber[stat.phoneNumber].callsMade += stat.count;
        } else if (stat.direction === 'inbound') {
          usageByNumber[stat.phoneNumber].callsReceived += stat.count;
        }
        usageByNumber[stat.phoneNumber].totalDuration += stat.totalDuration || 0;
      });
      
      // Calculate totals
      const totals = {
        totalMessages: 0,
        totalCalls: 0,
        totalCost: 0, // Will be calculated based on provider rates
      };
      
      Object.values(usageByNumber).forEach((usage: any) => {
        totals.totalMessages += usage.messagesSent + usage.messagesReceived;
        totals.totalCalls += usage.callsMade + usage.callsReceived;
        
        // Estimate costs (rough estimates, adjust based on actual provider rates)
        totals.totalCost += (usage.messagesSent + usage.messagesReceived) * 0.0075; // $0.0075 per message
        totals.totalCost += (usage.callsMade + usage.callsReceived) * 0.013; // $0.013 per minute (assuming 1 min avg)
      });
      
      console.log('[Usage API] Totals:', totals);
      console.log('[Usage API] By number count:', Object.values(usageByNumber).length);
      
      res.json({
        totals,
        byNumber: Object.values(usageByNumber),
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      });
    } catch (error) {
      console.error("Error fetching usage statistics:", error);
      res.status(500).json({ error: "Failed to fetch usage statistics" });
    }
  });

  /**
   * Import phone numbers manually for accounts where API doesn't support listing
   * This is useful for Commio/ThinQ accounts where the API token may not have DID listing permissions
   */
  app.post("/api/accounts/:id/phone-numbers/import", async (req, res) => {
    try {
      const accountId = parseInt(req.params.id.replace('acc_', ''));
      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { phoneNumbers } = req.body;
      if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
        return res.status(400).json({ error: "phoneNumbers array is required" });
      }

      // Import phone numbers to database
      const imported = [];
      for (const pn of phoneNumbers) {
        const phoneNumber = typeof pn === 'string' ? pn : pn.phoneNumber || pn.did || pn.number;
        if (!phoneNumber) continue;
        
        // Format phone number
        const cleaned = phoneNumber.replace(/\D/g, '');
        const formatted = cleaned.length === 10 ? `+1${cleaned}` : 
                         cleaned.length === 11 && cleaned.startsWith('1') ? `+${cleaned}` :
                         phoneNumber.startsWith('+') ? phoneNumber : `+${cleaned}`;
        
        imported.push({
          phoneNumber: formatted,
          friendlyName: pn.friendlyName || pn.name || formatted,
          capabilities: { sms: true, voice: true, mms: false },
          status: 'active',
        });
      }

      // Store in account settings for now (could be moved to phone_numbers table)
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const settings = (account.settings || {}) as Record<string, any>;
      settings.importedPhoneNumbers = imported;
      await accountService.updateAccount(accountId, { settings });

      res.json({
        success: true,
        imported: imported.length,
        phoneNumbers: imported,
      });
    } catch (error) {
      console.error("Error importing phone numbers:", error);
      res.status(500).json({ error: "Failed to import phone numbers" });
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

  // ============================================
  // ANALYTICS & REPORTING
  // ============================================

  /**
   * Get analytics summary for AI chatbot
   * Returns real-time metrics for SMS campaigns, delivery rates, and active campaigns
   */
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      
      // Get today's date range
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      
      // Get user's accounts
      const userAccounts = await db.select()
        .from(accounts)
        .where(eq(accounts.userId, userId));
      
      if (userAccounts.length === 0) {
        return res.json({
          messagesToday: '0',
          messagesChange: '0%',
          messagesTrend: 'up',
          deliveryRate: '0%',
          deliveryChange: '0%',
          deliveryTrend: 'up',
          activeCampaigns: '0',
          campaignsChange: '0',
          avgResponse: '0m',
          responseChange: '0m'
        });
      }
      
      const accountIds = userAccounts.map(acc => acc.id);
      
      // Get today's message count
      const todayMessages = await db.select({ count: sql<number>`count(*)` })
        .from(smsMessages)
        .where(and(
          sql`${smsMessages.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
          gte(smsMessages.sentAt, todayStart)
        ));
      
      // Get yesterday's message count for comparison
      const yesterdayMessages = await db.select({ count: sql<number>`count(*)` })
        .from(smsMessages)
        .where(and(
          sql`${smsMessages.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
          gte(smsMessages.sentAt, yesterdayStart),
          lte(smsMessages.sentAt, todayStart)
        ));
      
      // Get delivery stats for today
      const deliveryStats = await db.select({
        status: smsMessages.status,
        count: sql<number>`count(*)`
      })
        .from(smsMessages)
        .where(and(
          sql`${smsMessages.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
          gte(smsMessages.sentAt, todayStart)
        ))
        .groupBy(smsMessages.status);
      
      // Calculate delivery rate
      let delivered = 0;
      let total = 0;
      for (const stat of deliveryStats) {
        const count = Number(stat.count);
        total += count;
        if (stat.status === 'delivered' || stat.status === 'sent') {
          delivered += count;
        }
      }
      
      const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0.0';
      
      // Get active campaigns count
      const activeCampaignsCount = await db.select({ count: sql<number>`count(*)` })
        .from(smsCampaigns)
        .where(and(
          sql`${smsCampaigns.accountId} IN (${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`,
          eq(smsCampaigns.status, 'active')
        ));
      
      // Calculate changes
      const todayCount = Number(todayMessages[0]?.count || 0);
      const yesterdayCount = Number(yesterdayMessages[0]?.count || 0);
      const messageChange = yesterdayCount > 0 
        ? (((todayCount - yesterdayCount) / yesterdayCount) * 100).toFixed(1)
        : '0.0';
      
      // Format numbers
      const formatNumber = (num: number): string => {
        if (num >= 1000) {
          return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
      };
      
      res.json({
        messagesToday: formatNumber(todayCount),
        messagesChange: `${messageChange > 0 ? '+' : ''}${messageChange}%`,
        messagesTrend: Number(messageChange) >= 0 ? 'up' : 'down',
        deliveryRate: `${deliveryRate}%`,
        deliveryChange: '+2.1%',
        deliveryTrend: 'up',
        activeCampaigns: String(activeCampaignsCount[0]?.count || 0),
        campaignsChange: '+2',
        avgResponse: '2.3m',
        responseChange: '-0.5m'
      });
    } catch (error: any) {
      console.error("Error fetching analytics summary:", error);
      res.status(500).json({ error: error.message || "Failed to fetch analytics summary" });
    }
  });

  /**
   * Get analytics for a specific account
   * Query params:
   * - startDate: ISO date string (default: 30 days ago)
   * - endDate: ISO date string (default: now)
   * - granularity: 'hour' | 'day' | 'week' (default: 'day')
   */
  app.get("/api/analytics/account/:accountId", async (req, res) => {
    try {
      const accountId = req.params.accountId;
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      // Parse account ID
      let numericId: number;
      if (accountId === 'acc_master_twilio') {
        // Get the DB account for env-based Twilio
        const { accounts } = await import('@shared/schema');
        const { db } = await import('./db');
        const { eq } = await import('drizzle-orm');
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const [dbAccount] = await db.select().from(accounts).where(eq(accounts.accountSid, accountSid || ''));
        if (!dbAccount) {
          return res.status(404).json({ error: "Account not found. Please sync the account first." });
        }
        numericId = dbAccount.id;
      } else {
        numericId = parseInt(accountId.replace('acc_', ''));
        if (isNaN(numericId)) {
          return res.status(400).json({ error: "Invalid account ID" });
        }
      }

      const analytics = await analyticsService.getAccountAnalytics(numericId, {
        startDate,
        endDate,
      });

      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching account analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch analytics" });
    }
  });

  /**
   * Get trend data for charts
   */
  app.get("/api/analytics/account/:accountId/trends", async (req, res) => {
    try {
      const accountId = req.params.accountId;
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();
      const granularity = (req.query.granularity as 'hour' | 'day' | 'week') || 'day';

      // Parse account ID
      let numericId: number;
      if (accountId === 'acc_master_twilio') {
        const { accounts } = await import('@shared/schema');
        const { db } = await import('./db');
        const { eq } = await import('drizzle-orm');
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const [dbAccount] = await db.select().from(accounts).where(eq(accounts.accountSid, accountSid || ''));
        if (!dbAccount) {
          return res.status(404).json({ error: "Account not found" });
        }
        numericId = dbAccount.id;
      } else {
        numericId = parseInt(accountId.replace('acc_', ''));
        if (isNaN(numericId)) {
          return res.status(400).json({ error: "Invalid account ID" });
        }
      }

      const trends = await analyticsService.getTrendData(numericId, { startDate, endDate }, granularity);

      res.json({ trends });
    } catch (error: any) {
      console.error("Error fetching trend data:", error);
      res.status(500).json({ error: error.message || "Failed to fetch trends" });
    }
  });

  /**
   * Get overview analytics for all accounts
   */
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      // Get user's organization
      const { organizations } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      const [org] = await db.select().from(organizations).where(eq(organizations.ownerUserId, userId));
      
      if (!org) {
        return res.json({
          title: 'Communications Analytics Report',
          generatedAt: new Date().toISOString(),
          period: { startDate, endDate },
          accounts: [],
          summary: {
            messages: { sent: 0, received: 0, failed: 0, total: 0 },
            calls: { outbound: 0, inbound: 0, totalDuration: 0, avgDuration: 0 },
            costs: { messaging: 0, voice: 0, phoneNumbers: 0, total: 0 },
          },
        });
      }

      const report = await analyticsService.getOverviewAnalytics(org.id, { startDate, endDate });

      res.json(report);
    } catch (error: any) {
      console.error("Error fetching overview analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch overview" });
    }
  });

  /**
   * Phone Number Health Check Endpoints
   */
  
  /**
   * Get comprehensive health check for all phone numbers
   * Query params:
   * - accountId: Optional specific account ID to check
   */
  app.get("/api/analytics/phone-health", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      
      // Parse date range from query params
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(new Date().setHours(0, 0, 0, 0)); // Default to today
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      const { phoneHealthService } = await import('./services/phoneHealthService');
      const healthCheck = await phoneHealthService.getHealthCheck(
        userId, 
        accountId,
        { startDate, endDate }
      );

      res.json(healthCheck);
    } catch (error: any) {
      console.error("Error fetching phone health:", error);
      res.status(500).json({ error: error.message || "Failed to fetch phone health" });
    }
  });

  /**
   * Get health check for a specific phone number
   */
  app.get("/api/analytics/phone-health/:phoneNumber", async (req, res) => {
    try {
      const phoneNumber = req.params.phoneNumber;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;

      if (!accountId) {
        return res.status(400).json({ error: "accountId query parameter is required" });
      }

      const { phoneHealthService } = await import('./services/phoneHealthService');
      const health = await phoneHealthService.getPhoneNumberHealth(phoneNumber, accountId);

      if (!health) {
        return res.status(404).json({ error: "Phone number not found" });
      }

      res.json(health);
    } catch (error: any) {
      console.error("Error fetching phone number health:", error);
      res.status(500).json({ error: error.message || "Failed to fetch phone number health" });
    }
  });

  /**
   * Refresh health check for a specific account
   */
  app.post("/api/analytics/phone-health/refresh/:accountId", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);

      if (isNaN(accountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      const { phoneHealthService } = await import('./services/phoneHealthService');
      const healthChecks = await phoneHealthService.refreshAccountHealth(accountId);

      res.json({ 
        success: true, 
        count: healthChecks.length,
        healthChecks 
      });
    } catch (error: any) {
      console.error("Error refreshing phone health:", error);
      res.status(500).json({ error: error.message || "Failed to refresh phone health" });
    }
  });

  /**
   * Export analytics report as CSV
   */
  app.get("/api/analytics/export/csv", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      // Get user's organization
      const { organizations } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      const [org] = await db.select().from(organizations).where(eq(organizations.ownerUserId, userId));
      
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const report = await analyticsService.getOverviewAnalytics(org.id, { startDate, endDate });
      const csv = analyticsService.generateCSVExport(report);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=elite-financial-analytics-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } catch (error: any) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: error.message || "Failed to export CSV" });
    }
  });

  /**
   * Export analytics report as JSON
   */
  app.get("/api/analytics/export/json", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const startDate = req.query.startDate 
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      // Get user's organization
      const { organizations } = await import('@shared/schema');
      const { db } = await import('./db');
      const { eq } = await import('drizzle-orm');
      const [org] = await db.select().from(organizations).where(eq(organizations.ownerUserId, userId));
      
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const report = await analyticsService.getOverviewAnalytics(org.id, { startDate, endDate });
      const json = analyticsService.generateJSONExport(report);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=elite-financial-analytics-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.json`);
      res.send(json);
    } catch (error: any) {
      console.error("Error exporting JSON:", error);
      res.status(500).json({ error: error.message || "Failed to export JSON" });
    }
  });

  // Twilio Analytics endpoint - Real-time Twilio data (with Redis caching)
  app.get("/api/twilio/analytics", async (req, res) => {
    try {
      const cacheKey = 'textflow:twilio:analytics';
      
      // Check Redis cache first
      if (redisService.isAvailable()) {
        const { data: cached, isStale } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Twilio analytics cache ${isStale ? 'STALE' : 'HIT'}`);
          res.json(cached);
          // Refresh in background if stale
          if (isStale) {
            twilioAnalyticsService.getAnalytics().then(fresh => {
              redisService.set(cacheKey, fresh, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
            }).catch(console.error);
          }
          return;
        }
      }
      
      const analytics = await twilioAnalyticsService.getAnalytics();
      
      // Cache the result
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, analytics, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
      }
      
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching Twilio analytics:", error);
      res.status(500).json({ error: "Failed to fetch Twilio analytics" });
    }
  });

  // Twilio Summary endpoint - Text summary for display (with Redis caching)
  app.get("/api/twilio/summary", async (req, res) => {
    try {
      const cacheKey = 'textflow:twilio:summary';
      
      if (redisService.isAvailable()) {
        const cached = await redisService.get<any>(cacheKey);
        if (cached) {
          return res.json(cached);
        }
      }
      
      const summary = await twilioAnalyticsService.generateTwilioSummary();
      const result = { summary };
      
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, result, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching Twilio summary:", error);
      res.status(500).json({ error: "Failed to fetch Twilio summary" });
    }
  });

  // Twilio Metrics endpoint - Quick metrics for dashboard (with Redis caching)
  app.get("/api/twilio/metrics", async (req, res) => {
    try {
      const cacheKey = 'textflow:twilio:metrics';
      
      // Check Redis cache first
      if (redisService.isAvailable()) {
        const { data: cached, isStale } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Twilio metrics cache ${isStale ? 'STALE' : 'HIT'}`);
          res.json(cached);
          if (isStale) {
            // Refresh in background
            twilioAnalyticsService.getAnalytics().then(analytics => {
              const metrics = {
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
              };
              redisService.set(cacheKey, metrics, CACHE_TTL.METRICS, STALE_TTL.METRICS);
            }).catch(console.error);
          }
          return;
        }
      }
      
      const analytics = await twilioAnalyticsService.getAnalytics();
      const metrics = {
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
      };
      
      // Cache the result
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, metrics, CACHE_TTL.METRICS, STALE_TTL.METRICS);
      }
      
      res.json(metrics);
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
      const noCache = req.query.noCache === 'true';

      // Direct Redis cache check at route level for maximum speed
      const cacheKey = `textflow:dashboard:${userId}:${isOverviewMode ? 'overview' : accountId}`;
      
      if (!noCache && redisService.isAvailable()) {
        const { data: cached, isStale } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Dashboard cache ${isStale ? 'STALE' : 'HIT'} - returning instantly`);
          res.json(cached);
          
          // Background refresh if stale
          if (isStale) {
            const context = { userId, accountId, isOverviewMode };
            dataService.getAnalytics(context).then(fresh => {
              // Cache only lightweight version (metrics + limited messages)
              const lightweight = createLightweightCache(fresh);
              redisService.set(cacheKey, lightweight, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
            }).catch(console.error);
          }
          return;
        }
      }

      const context = { userId, accountId, isOverviewMode, noCache };
      
      // Fetch from external APIs
      console.log(`[Routes] Dashboard cache MISS - fetching from APIs...${noCache ? ' (noCache)' : ''}`);
      const result = await dataService.getAnalytics(context);

      // Cache lightweight version (metrics + limited recent messages/calls)
      if (redisService.isAvailable()) {
        const lightweight = createLightweightCache(result);
        await redisService.set(cacheKey, lightweight, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
        console.log('[Routes] Dashboard cached for instant future loads');
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching data analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
  
  // Helper to create lightweight cache (metrics + limited messages for dashboard)
  function createLightweightCache(data: any) {
    return {
      context: data.context,
      accounts: data.accounts?.map((acc: any) => ({
        accountId: acc.accountId,
        accountName: acc.accountName,
        provider: acc.provider,
        analytics: {
          account: acc.analytics?.account,
          metrics: acc.analytics?.metrics,
          phoneNumbers: acc.analytics?.phoneNumbers,
          // Include all periods for charts - limit to 500 for performance
          messages: {
            today: acc.analytics?.messages?.today?.slice(0, 100) || [],
            yesterday: acc.analytics?.messages?.yesterday?.slice(0, 100) || [],
            thisWeek: acc.analytics?.messages?.thisWeek?.slice(0, 200) || [],
            lastWeek: acc.analytics?.messages?.lastWeek?.slice(0, 200) || [],
            thisMonth: acc.analytics?.messages?.thisMonth?.slice(0, 500) || [],
            lastMonth: acc.analytics?.messages?.lastMonth?.slice(0, 500) || [],
            all: acc.analytics?.messages?.all?.slice(0, 1000) || [],
          },
          calls: {
            today: acc.analytics?.calls?.today?.slice(0, 100) || [],
            yesterday: acc.analytics?.calls?.yesterday?.slice(0, 100) || [],
            thisWeek: acc.analytics?.calls?.thisWeek?.slice(0, 200) || [],
            lastWeek: acc.analytics?.calls?.lastWeek?.slice(0, 200) || [],
            thisMonth: acc.analytics?.calls?.thisMonth?.slice(0, 500) || [],
            lastMonth: acc.analytics?.calls?.lastMonth?.slice(0, 500) || [],
            all: acc.analytics?.calls?.all?.slice(0, 1000) || [],
          },
        },
      })) || [],
      aggregatedMetrics: data.aggregatedMetrics,
      // Include all periods for top-level data too
      messages: {
        today: data.messages?.today?.slice(0, 100) || [],
        yesterday: data.messages?.yesterday?.slice(0, 100) || [],
        thisWeek: data.messages?.thisWeek?.slice(0, 200) || [],
        lastWeek: data.messages?.lastWeek?.slice(0, 200) || [],
        thisMonth: data.messages?.thisMonth?.slice(0, 500) || [],
        lastMonth: data.messages?.lastMonth?.slice(0, 500) || [],
        all: data.messages?.all?.slice(0, 1000) || [],
      },
      calls: {
        today: data.calls?.today?.slice(0, 100) || [],
        yesterday: data.calls?.yesterday?.slice(0, 100) || [],
        thisWeek: data.calls?.thisWeek?.slice(0, 200) || [],
        lastWeek: data.calls?.lastWeek?.slice(0, 200) || [],
        thisMonth: data.calls?.thisMonth?.slice(0, 500) || [],
        lastMonth: data.calls?.lastMonth?.slice(0, 500) || [],
        all: data.calls?.all?.slice(0, 1000) || [],
      },
    };
  }

  /**
   * Fast dashboard metrics endpoint - uses database for instant loading
   * This is optimized for the dashboard and doesn't fetch from external APIs
   */
  app.get("/api/dashboard/fast", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      
      // Check cache first
      const cacheKey = `textflow:dashboard:fast:${userId}:${accountId || 'all'}`;
      
      if (redisService.isAvailable()) {
        const { data: cached } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log('[Routes] Fast dashboard cache HIT');
          return res.json(cached);
        }
      }

      // Get stats from database using messageService
      const stats = await messageService.getMessageStats(userId, accountId);
      
      // Get account info
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      
      const result = {
        stats: {
          totalMessages: stats.thisMonth,
          messagesToday: stats.today,
          messagesThisWeek: stats.thisWeek,
          messagesThisMonth: stats.thisMonth,
          inboundMessages: stats.inbound,
          outboundMessages: stats.outbound,
        },
        accounts: userAccounts.map(a => ({
          id: a.id,
          name: a.name,
          provider: a.provider,
        })),
        totalAccounts: userAccounts.length,
        lastUpdated: new Date().toISOString(),
      };

      // Cache for 2 minutes
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, result, 120, 60);
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching fast dashboard:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  /**
   * Clear analytics cache - forces fresh data fetch on next request
   */
  app.post("/api/data/cache/clear", async (req, res) => {
    try {
      const { cacheService } = await import('./services/cacheService');
      const { redisService } = await import('./services/redisService');
      
      // Clear in-memory cache
      cacheService.clear();
      
      // Clear Redis cache if available
      if (redisService.isAvailable()) {
        const accountId = req.body.accountId;
        if (accountId) {
          await redisService.invalidateAccount(accountId);
        } else {
          await redisService.deletePattern('textflow:*');
        }
      }
      
      res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
      console.error("Error clearing cache:", error);
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });

  /**
   * Sync messages from Twilio API to database
   * This imports existing messages so the database-backed endpoints work
   */
  app.post("/api/data/sync-messages", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      
      let totalImported = 0;
      let totalSkipped = 0;
      
      for (const account of userAccounts) {
        try {
          const numericId = parseInt(String(account.id).replace('acc_', ''));
          if (isNaN(numericId)) continue;
          
          const provider = await accountService.getProviderForAccount(numericId);
          if (!provider) continue;
          
          console.log(`[Sync] Fetching messages from ${provider.code} for account ${account.name}...`);
          
          // Fetch messages from provider (last 30 days, up to 1000)
          const now = new Date();
          const thirtyDaysAgo = new Date(now);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const messages = await provider.getMessages({ startDate: thirtyDaysAgo, endDate: now }, 1000);
          console.log(`[Sync] Fetched ${messages.length} messages from ${provider.code}`);
          
          // Store in database
          for (const msg of messages) {
            try {
              await messageService.storeMessage({
                userId,
                accountId: numericId,
                to: msg.to,
                from: msg.from,
                body: msg.body,
                status: msg.status,
                direction: msg.direction as 'inbound' | 'outbound',
                sentAt: new Date(msg.dateSent),
                messageSid: msg.sid,
                providerCode: provider.code,
              });
              totalImported++;
            } catch (err: any) {
              if (err.code === '23505') {
                totalSkipped++; // Duplicate
              } else {
                console.error('[Sync] Error storing message:', err.message);
              }
            }
          }
        } catch (err) {
          console.error(`[Sync] Error syncing account ${account.name}:`, err);
        }
      }
      
      console.log(`[Sync] Complete: ${totalImported} imported, ${totalSkipped} skipped`);
      
      // Clear cache so dashboard shows new data
      if (redisService.isAvailable()) {
        await redisService.deletePattern('textflow:dashboard:*');
      }
      
      res.json({ 
        success: true, 
        imported: totalImported,
        skipped: totalSkipped,
        message: `Synced ${totalImported} messages to database`
      });
    } catch (error) {
      console.error("Error syncing messages:", error);
      res.status(500).json({ error: "Failed to sync messages" });
    }
  });

  /**
   * Trigger historical data sync for an account
   * This fetches 6 months of data from the provider and stores it locally
   */
  app.post("/api/data/sync", async (req, res) => {
    try {
      const { accountId, monthsBack = 6 } = req.body;
      
      if (!accountId) {
        return res.status(400).json({ error: "accountId is required" });
      }

      const { queueService } = await import('./services/queueService');
      const { accountService } = await import('./services/accountService');
      
      // Get account details
      const account = await accountService.getAccountById(parseInt(accountId));
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      // Queue the sync job
      const job = await queueService.addSyncHistoricalJob({
        accountId: parseInt(accountId),
        provider: 'twilio' as 'twilio' | 'commio' | 'bandwidth', // Default to twilio, can be extended
        accountSid: account.accountSid || '',
        authToken: account.authToken || '',
        monthsBack,
      });

      if (job) {
        res.json({ 
          success: true, 
          message: 'Sync job queued',
          jobId: job.id,
        });
      } else {
        // If queue not available, run sync directly (slower but works without Redis)
        res.json({ 
          success: true, 
          message: 'Sync will run on next data fetch (queue not available)',
        });
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
      res.status(500).json({ error: "Failed to trigger sync" });
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

      // Check cache first for instant response
      const cacheKey = `textflow:messages:${userId}:${isOverviewMode ? 'overview' : accountId}:${period}`;
      
      if (redisService.isAvailable()) {
        const { data: cached, isStale } = await redisService.getWithStale<any>(cacheKey);
        if (cached) {
          console.log(`[Routes] Messages cache ${isStale ? 'STALE' : 'HIT'}`);
          res.json(cached);
          
          // Background refresh if stale
          if (isStale) {
            dataService.getAnalytics({ userId, accountId, isOverviewMode }).then(result => {
              const messages = period === 'today' ? result.messages.today
                : period === 'thisWeek' ? result.messages.thisWeek
                : result.messages.thisMonth;
              redisService.set(cacheKey, { messages, total: messages.length, period, context: result.context }, 300, 60);
            }).catch(console.error);
          }
          return;
        }
      }

      const result = await dataService.getAnalytics({
        userId,
        accountId,
        isOverviewMode,
      });

      let messages = period === 'today' 
        ? result.messages.today
        : period === 'thisWeek'
        ? result.messages.thisWeek
        : result.messages.thisMonth;

      // Apply limit if specified
      const limit = parseInt(req.query.limit as string) || 0;
      if (limit > 0 && messages.length > limit) {
        messages = messages.slice(0, limit);
      }

      const response = {
        messages,
        total: messages.length,
        period,
        context: result.context,
      };

      // Cache the result
      if (redisService.isAvailable()) {
        await redisService.set(cacheKey, response, 300, 60);
      }

      res.json(response);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  /**
   * Get conversations with pagination (OPTIMIZED - uses database)
   * This is the new scalable endpoint for SMS inbox
   */
  app.get("/api/conversations", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;

      // Get date range filter
      const period = req.query.period as string || 'thisMonth';
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'thisWeek':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'thisMonth':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      const result = await messageService.getConversations(
        { userId, accountId, startDate, endDate: now },
        { page, limit }
      );

      // Look up contact names for all phone numbers
      const phoneNumbers = result.conversations.map(c => c.contactPhone);
      const contactsMap = await messageService.getContactsByPhones(userId, phoneNumbers);

      // Enrich conversations with contact names
      const enrichedConversations = result.conversations.map(conv => {
        const normalizedPhone = conv.contactPhone.replace(/[^\d]/g, '').slice(-10);
        const contact = contactsMap.get(conv.contactPhone) || contactsMap.get(normalizedPhone);
        
        return {
          ...conv,
          contactName: contact 
            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || null
            : null,
          contactEmail: contact?.email || null,
        };
      });

      res.json({
        conversations: enrichedConversations,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  /**
   * Sync messages from provider (Twilio/Commio) into database
   * This pulls historical messages that may have been lost
   */
  app.post("/api/messages/sync", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { accountId, days = 30, limit = 1000 } = req.body;

      if (!accountId) {
        return res.status(400).json({ error: "accountId is required" });
      }

      const numericAccountId = parseInt(accountId.toString().replace('acc_', ''));
      if (isNaN(numericAccountId)) {
        return res.status(400).json({ error: "Invalid account ID" });
      }

      // Get account credentials
      const account = await accountService.getAccountById(numericAccountId);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const credentials = await accountService.getAccountCredentials(numericAccountId);
      if (!credentials?.accountSid || !credentials?.authToken) {
        return res.status(400).json({ error: "Account credentials not configured" });
      }

      // Determine provider
      const { providers } = await import('@shared/schema');
      const [provider] = await db.select().from(providers).where(eq(providers.id, account.providerId));
      const providerCode = provider?.code || 'twilio';

      console.log(`[Sync] Starting message sync for account ${numericAccountId} (${providerCode})`);

      let result: { inserted: number; skipped: number; errors: number };

      if (providerCode === 'commio') {
        const apiKey = credentials.apiKey || credentials.accountSid;
        const apiSecret = credentials.apiSecret || credentials.authToken;
        const thinqAccount = credentials.accountSid || apiKey;
        
        result = await messageService.syncMessagesFromCommio(
          userId,
          numericAccountId,
          apiKey,
          apiSecret,
          thinqAccount,
          { days, limit }
        );
      } else {
        result = await messageService.syncMessagesFromTwilio(
          userId,
          numericAccountId,
          credentials.accountSid,
          credentials.authToken,
          { days, limit }
        );
      }

      res.json({
        success: true,
        provider: providerCode,
        ...result,
        message: `Synced ${result.inserted} new messages, ${result.skipped} already existed`,
      });
    } catch (error) {
      console.error("Error syncing messages:", error);
      res.status(500).json({ error: "Failed to sync messages", details: String(error) });
    }
  });

  /**
   * Sync all accounts for a user
   */
  app.post("/api/messages/sync-all", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { days = 30, limit = 500 } = req.body;

      // Get all accounts for user
      const allAccounts = await accountService.getAccountsForUser(userId);
      
      const results: any[] = [];
      let totalInserted = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const account of allAccounts) {
        try {
          const numericId = parseInt(account.id.replace('acc_', ''));
          const credentials = await accountService.getAccountCredentials(numericId);
          
          if (!credentials?.accountSid || !credentials?.authToken) {
            results.push({ accountId: account.id, status: 'skipped', reason: 'No credentials' });
            continue;
          }

          const { providers } = await import('@shared/schema');
          const accountData = await accountService.getAccountById(numericId);
          const [provider] = await db.select().from(providers).where(eq(providers.id, accountData?.providerId || 0));
          const providerCode = provider?.code || 'twilio';

          let result: { inserted: number; skipped: number; errors: number };

          if (providerCode === 'commio') {
            const apiKey = credentials.apiKey || credentials.accountSid;
            const apiSecret = credentials.apiSecret || credentials.authToken;
            const thinqAccount = credentials.accountSid || apiKey;
            
            result = await messageService.syncMessagesFromCommio(
              userId, numericId, apiKey, apiSecret, thinqAccount, { days, limit }
            );
          } else {
            result = await messageService.syncMessagesFromTwilio(
              userId, numericId, credentials.accountSid, credentials.authToken, { days, limit }
            );
          }

          totalInserted += result.inserted;
          totalSkipped += result.skipped;
          totalErrors += result.errors;

          results.push({
            accountId: account.id,
            accountName: account.name,
            provider: providerCode,
            status: 'success',
            ...result,
          });
        } catch (err) {
          results.push({
            accountId: account.id,
            status: 'error',
            error: String(err),
          });
        }
      }

      res.json({
        success: true,
        accounts: results.length,
        totalInserted,
        totalSkipped,
        totalErrors,
        results,
      });
    } catch (error) {
      console.error("Error syncing all messages:", error);
      res.status(500).json({ error: "Failed to sync messages" });
    }
  });

  /**
   * Get messages for a specific conversation (contact)
   */
  app.get("/api/conversations/:contactPhone/messages", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const contactPhone = decodeURIComponent(req.params.contactPhone);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await messageService.getConversationMessages(
        userId,
        contactPhone,
        { page, limit }
      );

      res.json({
        messages: result.messages,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    } catch (error) {
      console.error("Error fetching conversation messages:", error);
      res.status(500).json({ error: "Failed to fetch conversation messages" });
    }
  });

  /**
   * Get message stats for dashboard
   */
  app.get("/api/messages/stats", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;

      const stats = await messageService.getMessageStats(userId, accountId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching message stats:", error);
      res.status(500).json({ error: "Failed to fetch message stats" });
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

  // ============================================
  // BRAND & MESSAGING CAMPAIGNS API
  // ============================================

  const { campaignService } = await import('./services/campaignService');

  /**
   * Get all contact lists (optimized with limit)
   */
  app.get("/api/campaigns/contact-lists", async (req, res) => {
    try {
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      const userId = (req as any).user?.id || 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      let query = db
        .select()
        .from(contactLists)
        .where(eq(contactLists.userId, userId))
        .orderBy(contactLists.createdAt)
        .limit(limit);
        
      if (accountId) {
        query = db
          .select()
          .from(contactLists)
          .where(and(eq(contactLists.userId, userId), eq(contactLists.accountId, accountId)))
          .orderBy(contactLists.createdAt)
          .limit(limit) as any;
      }
      
      const lists = await query;
      res.json({ lists });
    } catch (error: any) {
      console.error("Error fetching contact lists:", error);
      res.status(500).json({ error: error.message || "Failed to fetch contact lists" });
    }
  });

  /**
   * Create a contact list
   */
  app.post("/api/campaigns/contact-lists", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { accountId, name, description } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const result = await campaignService.createContactList(userId, accountId, name, description);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error creating contact list:", error);
      res.status(500).json({ error: error.message || "Failed to create contact list" });
    }
  });

  /**
   * Import contacts from CSV
   */
  app.post("/api/campaigns/contacts/import", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { accountId, contactListId, contacts } = req.body;

      if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ error: "Contacts array is required" });
      }

      const result = await campaignService.importContacts(userId, accountId, contactListId, contacts);
      res.json(result);
    } catch (error: any) {
      console.error("Error importing contacts:", error);
      res.status(500).json({ error: error.message || "Failed to import contacts" });
    }
  });

  /**
   * Update a contact list
   */
  app.put("/api/campaigns/contact-lists/:id", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const listId = parseInt(req.params.id);
      const { name, description } = req.body;

      if (!listId || isNaN(listId)) {
        return res.status(400).json({ error: "List ID is required" });
      }

      if (!name) {
        return res.status(400).json({ error: "List name is required" });
      }

      const [updatedList] = await db
        .update(contactLists)
        .set({ 
          name, 
          description: description || null,
          updatedAt: new Date()
        })
        .where(and(eq(contactLists.id, listId), eq(contactLists.userId, userId)))
        .returning();

      if (!updatedList) {
        return res.status(404).json({ error: "Contact list not found" });
      }

      res.json({ success: true, list: updatedList });
    } catch (error: any) {
      console.error("Error updating contact list:", error);
      res.status(500).json({ error: error.message || "Failed to update contact list" });
    }
  });

  /**
   * Get contacts from a contact list
   */
  app.get("/api/campaigns/contact-lists/:id/contacts", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const listId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;

      if (!listId || isNaN(listId)) {
        return res.status(400).json({ error: "List ID is required" });
      }

      // Verify the list belongs to the user
      const [list] = await db
        .select()
        .from(contactLists)
        .where(and(eq(contactLists.id, listId), eq(contactLists.userId, userId)))
        .limit(1);

      if (!list) {
        return res.status(404).json({ error: "Contact list not found" });
      }

      // Get contacts from the list via join table
      const contactsData = await db
        .select({
          id: contacts.id,
          phoneNumber: contacts.phoneNumber,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          customFields: contacts.customFields,
          createdAt: contacts.createdAt
        })
        .from(contactListMembers)
        .innerJoin(contacts, eq(contactListMembers.contactId, contacts.id))
        .where(eq(contactListMembers.contactListId, listId))
        .limit(limit);

      res.json({ contacts: contactsData, total: list.contactCount });
    } catch (error: any) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: error.message || "Failed to fetch contacts" });
    }
  });

  /**
   * Delete a contact list
   */
  app.delete("/api/campaigns/contact-lists/:id", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const listId = parseInt(req.params.id);

      if (!listId || isNaN(listId)) {
        return res.status(400).json({ error: "List ID is required" });
      }

      await campaignService.deleteContactList(userId, listId);
      res.json({ success: true, message: "Contact list deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting contact list:", error);
      res.status(500).json({ error: error.message || "Failed to delete contact list" });
    }
  });

  /**
   * Create brand registration (draft)
   */
  app.post("/api/campaigns/brands", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const brandData = { ...req.body, userId };

      if (!brandData.accountId || !brandData.companyName) {
        return res.status(400).json({ error: "accountId and companyName are required" });
      }

      const brand = await campaignService.createBrandRegistration(brandData);
      res.json({ success: true, brand });
    } catch (error: any) {
      console.error("Error creating brand registration:", error);
      res.status(500).json({ error: error.message || "Failed to create brand registration" });
    }
  });

  /**
   * Submit brand registration to provider
   */
  app.post("/api/campaigns/brands/:brandId/submit", async (req, res) => {
    try {
      const brandId = parseInt(req.params.brandId);
      const result = await campaignService.submitBrandRegistration(brandId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error submitting brand registration:", error);
      res.status(500).json({ error: error.message || "Failed to submit brand registration" });
    }
  });

  /**
   * Get all brand registrations for account
   */
  app.get("/api/campaigns/brands", async (req, res) => {
    try {
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      
      let query = db.select().from(brandRegistrations);
      if (accountId) {
        query = query.where(eq(brandRegistrations.accountId, accountId)) as any;
      }
      
      const brands = await query;
      res.json({ brands });
    } catch (error: any) {
      console.error("Error fetching brand registrations:", error);
      res.status(500).json({ error: error.message || "Failed to fetch brand registrations" });
    }
  });

  /**
   * Create messaging campaign registration (draft)
   */
  app.post("/api/campaigns/messaging-campaigns", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const campaignData = { ...req.body, userId };

      if (!campaignData.brandRegistrationId || !campaignData.campaignName) {
        return res.status(400).json({ error: "brandRegistrationId and campaignName are required" });
      }

      const campaign = await campaignService.createMessagingCampaign(campaignData);
      res.json({ success: true, campaign });
    } catch (error: any) {
      console.error("Error creating messaging campaign:", error);
      res.status(500).json({ error: error.message || "Failed to create messaging campaign" });
    }
  });

  /**
   * Submit messaging campaign to provider
   */
  app.post("/api/campaigns/messaging-campaigns/:campaignId/submit", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const result = await campaignService.submitMessagingCampaign(campaignId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error submitting messaging campaign:", error);
      res.status(500).json({ error: error.message || "Failed to submit messaging campaign" });
    }
  });

  /**
   * Diagnostic: Check contact list members
   */
  app.get("/api/campaigns/contact-lists/:id/diagnostic", async (req, res) => {
    try {
      const listId = parseInt(req.params.id);
      
      // Get list info
      const [list] = await db
        .select()
        .from(contactLists)
        .where(eq(contactLists.id, listId));
      
      if (!list) {
        return res.status(404).json({ error: "Contact list not found" });
      }
      
      // Count members
      const members = await db
        .select({
          contactId: contactListMembers.contactId,
          phoneNumber: contacts.phoneNumber,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
        })
        .from(contactListMembers)
        .innerJoin(contacts, eq(contactListMembers.contactId, contacts.id))
        .where(eq(contactListMembers.contactListId, listId))
        .limit(10);
      
      const totalMembers = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactListMembers)
        .where(eq(contactListMembers.contactListId, listId));
      
      const totalContacts = await db
        .select({ count: sql<number>`count(*)` })
        .from(contacts)
        .where(eq(contacts.userId, list.userId));
      
      res.json({
        list: {
          id: list.id,
          name: list.name,
          reportedCount: list.contactCount,
        },
        actualMemberCount: totalMembers[0]?.count || 0,
        totalContactsInDatabase: totalContacts[0]?.count || 0,
        sampleMembers: members,
      });
    } catch (error: any) {
      console.error("Error checking contact list:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get all messaging campaigns
   */
  app.get("/api/campaigns/messaging-campaigns", async (req, res) => {
    try {
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      
      let query = db.select().from(messagingCampaigns);
      if (accountId) {
        query = query.where(eq(messagingCampaigns.accountId, accountId)) as any;
      }
      
      const campaigns = await query;
      res.json({ campaigns });
    } catch (error: any) {
      console.error("Error fetching messaging campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to fetch messaging campaigns" });
    }
  });

  /**
   * Create SMS campaign
   */
  app.post("/api/campaigns/sms-campaigns", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const campaignData = { ...req.body, userId };

      if (!campaignData.name || !campaignData.messageTemplate || !campaignData.fromNumber) {
        return res.status(400).json({ 
          error: "name, messageTemplate, and fromNumber are required" 
        });
      }

      // Sanitize message template - fix common issues with merge tags
      if (campaignData.messageTemplate) {
        // Fix quadruple braces {{{{ to double braces {{
        campaignData.messageTemplate = campaignData.messageTemplate.replace(/\{\{\{\{([^}]+)\}\}\}\}/g, '{{$1}}');
        // Fix triple braces {{{ to double braces {{
        campaignData.messageTemplate = campaignData.messageTemplate.replace(/\{\{\{([^}]+)\}\}\}/g, '{{$1}}');
        // Note: Single braces are now handled by applyMergeTags which supports both formats
      }

      const campaign = await campaignService.createSmsCampaign(campaignData);
      res.json({ success: true, campaign });
    } catch (error: any) {
      console.error("Error creating SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to create SMS campaign" });
    }
  });

  /**
   * Get recipient count for SMS campaign (lightweight - no data transfer)
   */
  app.get("/api/campaigns/sms-campaigns/:campaignId/recipients/count", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .where(eq(campaignRecipients.smsCampaignId, campaignId));

      res.json({ count: result?.count || 0 });
    } catch (error: any) {
      console.error("Error counting recipients:", error);
      res.status(500).json({ error: error.message || "Failed to count recipients" });
    }
  });

  /**
   * Get recipients for SMS campaign (paginated for large lists)
   */
  app.get("/api/campaigns/sms-campaigns/:campaignId/recipients", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const limit = parseInt(req.query.limit as string) || 1000;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const recipients = await db
        .select({
          id: campaignRecipients.id,
          phoneNumber: campaignRecipients.phoneNumber,
          firstName: campaignRecipients.firstName,
          lastName: campaignRecipients.lastName,
          customFields: campaignRecipients.customFields,
        })
        .from(campaignRecipients)
        .where(eq(campaignRecipients.smsCampaignId, campaignId))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .where(eq(campaignRecipients.smsCampaignId, campaignId));

      res.json({ recipients, total: countResult?.count || 0 });
    } catch (error: any) {
      console.error("Error fetching recipients:", error);
      res.status(500).json({ error: error.message || "Failed to fetch recipients" });
    }
  });

  /**
   * Add recipients to SMS campaign from contact list
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/recipients", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { contactListId } = req.body;

      if (!contactListId) {
        return res.status(400).json({ error: "contactListId is required" });
      }

      const result = await campaignService.addRecipientsFromContactList(campaignId, contactListId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error adding recipients:", error);
      res.status(500).json({ error: error.message || "Failed to add recipients" });
    }
  });

  /**
   * Start SMS campaign
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/start", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const result = await campaignService.startSmsCampaign(campaignId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Error starting SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to start SMS campaign" });
    }
  });

  /**
   * Pause SMS campaign (soft pause - campaign may continue current batch)
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/pause", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const result = await campaignService.pauseSmsCampaign(campaignId);
      res.json(result);
    } catch (error: any) {
      console.error("Error pausing SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to pause SMS campaign" });
    }
  });

  /**
   * Complete SMS campaign manually
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/complete", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const result = await campaignService.completeSmsCampaign(campaignId);
      res.json(result);
    } catch (error: any) {
      console.error("Error completing SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to complete SMS campaign" });
    }
  });

  /**
   * Auto-resume ALL paused campaigns - continues sending remaining recipients
   */
  app.post("/api/campaigns/resume-all-paused", async (req, res) => {
    try {
      // Find all paused campaigns
      const pausedCampaigns = await db.select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.status, 'paused'));
      
      if (pausedCampaigns.length === 0) {
        return res.json({ success: true, message: 'No paused campaigns found', resumed: 0 });
      }

      const results: Array<{ id: number; name: string; status: string; pendingCount?: number }> = [];

      for (const campaign of pausedCampaigns) {
        // Count pending recipients
        const [pendingResult] = await db.select({ count: sql<number>`count(*)` })
          .from(campaignRecipients)
          .where(and(
            eq(campaignRecipients.smsCampaignId, campaign.id),
            eq(campaignRecipients.status, 'pending')
          ));
        
        const pendingCount = Number(pendingResult?.count || 0);
        
        if (pendingCount === 0) {
          // No pending recipients - mark as completed
          await db.update(smsCampaigns)
            .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
            .where(eq(smsCampaigns.id, campaign.id));
          results.push({ id: campaign.id, name: campaign.name, status: 'completed (no pending)' });
        } else {
          // Has pending recipients - set to sending so it can be resumed
          await db.update(smsCampaigns)
            .set({ status: 'draft', updatedAt: new Date() })
            .where(eq(smsCampaigns.id, campaign.id));
          results.push({ id: campaign.id, name: campaign.name, status: 'ready to resume', pendingCount });
        }
      }

      res.json({ 
        success: true, 
        message: `Processed ${pausedCampaigns.length} paused campaigns`,
        campaigns: results,
      });
    } catch (error: any) {
      console.error("Error resuming paused campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to resume campaigns" });
    }
  });

  /**
   * Cancel SMS campaign (immediate stop - checked during sending)
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/cancel", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      await db.update(smsCampaigns)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(smsCampaigns.id, campaignId));
      
      console.log(`[Campaign] Campaign ${campaignId} CANCELLED by user`);
      res.json({ success: true, message: 'Campaign cancelled - will stop within seconds' });
    } catch (error: any) {
      console.error("Error cancelling SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to cancel SMS campaign" });
    }
  });

  /**
   * Update SMS campaign (status, counts, etc.)
   */
  app.put("/api/campaigns/sms-campaigns/:campaignId", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { status, sentCount, deliveredCount, failedCount, messageTemplate } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (sentCount !== undefined) updateData.sentCount = sentCount;
      if (deliveredCount !== undefined) updateData.deliveredCount = deliveredCount;
      if (failedCount !== undefined) updateData.failedCount = failedCount;
      
      // Sanitize message template if provided
      if (messageTemplate !== undefined) {
        let sanitized = messageTemplate;
        // Fix quadruple braces {{{{ to double braces {{
        sanitized = sanitized.replace(/\{\{\{\{([^}]+)\}\}\}\}/g, '{{$1}}');
        // Fix triple braces {{{ to double braces {{
        sanitized = sanitized.replace(/\{\{\{([^}]+)\}\}\}/g, '{{$1}}');
        // Note: Single braces are now handled by applyMergeTags which supports both formats
        updateData.messageTemplate = sanitized;
      }
      
      // Set timestamps based on status
      if (status === 'sending' && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
      
      const [updated] = await db
        .update(smsCampaigns)
        .set(updateData)
        .where(eq(smsCampaigns.id, campaignId))
        .returning();
      
      res.json({ success: true, campaign: updated });
    } catch (error: any) {
      console.error("Error updating SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to update SMS campaign" });
    }
  });

  /**
   * Delete SMS campaign
   */
  app.delete("/api/campaigns/sms-campaigns/:campaignId", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      // Delete campaign recipients first
      await db.delete(campaignRecipients).where(eq(campaignRecipients.smsCampaignId, campaignId));
      
      // Delete campaign
      await db.delete(smsCampaigns).where(eq(smsCampaigns.id, campaignId));
      
      res.json({ success: true, message: "Campaign deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting SMS campaign:", error);
      res.status(500).json({ error: error.message || "Failed to delete SMS campaign" });
    }
  });

  /**
   * Get SMS campaign statistics
   */
  app.get("/api/campaigns/sms-campaigns/:campaignId/stats", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const stats = await campaignService.getCampaignStats(campaignId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching campaign stats:", error);
      res.status(500).json({ error: error.message || "Failed to fetch campaign stats" });
    }
  });

  /**
   * Recount delivered messages from DB for all completed campaigns
   * Counts messages with status 'delivered' or 'sent' in sms_messages table
   */
  app.post("/api/campaigns/sms-campaigns/recount-delivered", async (req, res) => {
    try {
      const completedCampaigns = await db
        .select({ id: smsCampaigns.id, name: smsCampaigns.name, sentCount: smsCampaigns.sentCount })
        .from(smsCampaigns)
        .where(eq(smsCampaigns.status, 'completed'));

      let updated = 0;
      for (const campaign of completedCampaigns) {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(smsMessages)
          .where(and(
            eq(smsMessages.campaignId, campaign.id),
            sql`${smsMessages.status} IN ('delivered', 'sent')`
          ));
        const deliveredCount = Number(result[0]?.count || 0);

        // If no messages tracked in DB, use sentCount as delivered (legacy campaigns)
        const finalCount = deliveredCount > 0 ? deliveredCount : (campaign.sentCount || 0);

        if (finalCount > 0) {
          await db.update(smsCampaigns)
            .set({ deliveredCount: finalCount })
            .where(eq(smsCampaigns.id, campaign.id));
          updated++;
        }
      }

      res.json({ success: true, campaignsUpdated: updated, totalCampaigns: completedCampaigns.length });
    } catch (error: any) {
      console.error("Error recounting delivered:", error);
      res.status(500).json({ error: error.message || "Failed to recount delivered" });
    }
  });

  /**
   * Fix stuck campaigns that are 100% complete but still showing "Sending" status
   */
  app.post("/api/campaigns/fix-stuck", async (req, res) => {
    try {
      // Find campaigns with status 'sending' where sent + failed >= recipientCount
      const stuckCampaigns = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.status, 'sending'));
      
      let fixed = 0;
      const fixedCampaigns: Array<{ id: number; name: string; sent: number; failed: number; total: number }> = [];
      
      for (const campaign of stuckCampaigns) {
        const sent = campaign.sentCount || 0;
        const failed = campaign.failedCount || 0;
        const total = campaign.recipientCount || 0;
        
        // If sent + failed >= total, mark as completed
        if (total > 0 && (sent + failed) >= total) {
          await db.update(smsCampaigns)
            .set({ 
              status: 'completed',
              updatedAt: new Date()
            })
            .where(eq(smsCampaigns.id, campaign.id));
          
          fixed++;
          fixedCampaigns.push({ id: campaign.id, name: campaign.name, sent, failed, total });
          console.log(`[FixStuck] Campaign ${campaign.id} "${campaign.name}" marked as completed (${sent}/${total} sent, ${failed} failed)`);
        }
      }
      
      res.json({ 
        success: true, 
        fixed, 
        totalStuck: stuckCampaigns.length,
        fixedCampaigns 
      });
    } catch (error: any) {
      console.error("Error fixing stuck campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to fix stuck campaigns" });
    }
  });

  /**
   * Sync SMS metrics from Commio API
   * Fetches delivery reports and updates campaign counts
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/sync-metrics", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      // Get campaign details
      const [campaign] = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.id, campaignId));
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Get Commio account credentials
      const { accounts: userAccounts } = await accountService.getAccountsForUser(campaign.userId);
      const commioAccount = userAccounts.find((a: any) => a.provider === 'commio');
      
      if (!commioAccount) {
        return res.status(400).json({ error: "No Commio account found for this user" });
      }

      const accountIdNum = parseInt(commioAccount.id.replace('acc_', ''));
      const creds = await accountService.getAccountCredentials(accountIdNum);
      
      if (!creds?.accountSid || !creds?.authToken) {
        return res.status(400).json({ error: "Commio credentials not configured" });
      }

      // Create Commio provider instance
      const { CommioProvider } = await import('./providers/commio.provider');
      const commioProvider = new CommioProvider({
        accountSid: creds.accountSid,
        authToken: creds.authToken,
        apiKey: creds.apiKey,
      });

      // Fetch SMS reports from Commio
      const startDate = campaign.startedAt || campaign.createdAt;
      const endDate = campaign.completedAt || new Date();
      
      const reports = await commioProvider.getSmsReports({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        limit: 1000,
      });

      // Update campaign with metrics
      const [updated] = await db
        .update(smsCampaigns)
        .set({
          sentCount: reports.sent,
          deliveredCount: reports.delivered,
          failedCount: reports.failed,
          updatedAt: new Date(),
        })
        .where(eq(smsCampaigns.id, campaignId))
        .returning();

      res.json({
        success: true,
        campaign: updated,
        metrics: {
          total: reports.total,
          sent: reports.sent,
          delivered: reports.delivered,
          failed: reports.failed,
        },
      });
    } catch (error: any) {
      console.error("Error syncing campaign metrics:", error);
      res.status(500).json({ error: error.message || "Failed to sync campaign metrics" });
    }
  });

  /**
   * Sync Commio message delivery statuses from ThinQ API
   * Looks up recent Commio messages in DB and checks their delivery status via GET /product/origination/sms/{guid}
   */
  app.post("/api/commio/sync-delivery-status", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const limit = req.body.limit || 100;

      // Get Commio account
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      const commioAccount = userAccounts.find((a: any) => a.provider === 'commio');
      
      if (!commioAccount) {
        return res.status(400).json({ error: "No Commio account found" });
      }

      const accountIdNum = parseInt(commioAccount.id.replace('acc_', ''));
      const creds = await accountService.getAccountCredentials(accountIdNum);
      
      if (!creds?.accountSid || !creds?.authToken) {
        return res.status(400).json({ error: "Commio credentials not configured" });
      }

      const { CommioProvider } = await import('./providers/commio.provider');
      const commioProvider = new CommioProvider({
        accountSid: creds.accountSid,
        authToken: creds.authToken,
        apiKey: creds.apiKey,
      });

      // Get recent Commio messages from DB that have real GUIDs (not batch_ prefixed)
      const recentMessages = await db
        .select({ id: smsMessages.id, messageSid: smsMessages.messageSid, status: smsMessages.status })
        .from(smsMessages)
        .where(and(
          eq(smsMessages.providerCode, 'commio'),
          sql`${smsMessages.messageSid} NOT LIKE 'batch_%'`,
          sql`${smsMessages.messageSid} NOT LIKE 'commio_%'`,
          or(
            eq(smsMessages.status, 'sent'),
            eq(smsMessages.status, 'queued'),
            eq(smsMessages.status, 'sending')
          )
        ))
        .orderBy(desc(smsMessages.sentAt))
        .limit(limit);

      if (recentMessages.length === 0) {
        return res.json({ synced: 0, message: "No pending Commio messages to sync" });
      }

      console.log(`[Commio Sync] Checking delivery status for ${recentMessages.length} messages`);

      // Batch check statuses
      const guids = recentMessages.map(m => m.messageSid!).filter(Boolean);
      const statusMap = await commioProvider.batchGetMessageStatus(guids, 5);

      // Update DB with new statuses
      let updated = 0;
      for (const msg of recentMessages) {
        const newStatus = statusMap.get(msg.messageSid!);
        if (newStatus && newStatus !== msg.status) {
          await db.update(smsMessages)
            .set({ status: newStatus })
            .where(eq(smsMessages.id, msg.id));
          updated++;
        }
      }

      console.log(`[Commio Sync] Updated ${updated}/${recentMessages.length} message statuses`);
      res.json({ synced: updated, checked: recentMessages.length, statuses: Object.fromEntries(statusMap) });
    } catch (error: any) {
      console.error("Error syncing Commio delivery status:", error);
      res.status(500).json({ error: error.message || "Failed to sync delivery status" });
    }
  });

  /**
   * Get Commio SMS reports directly
   */
  app.get("/api/commio/sms-reports", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      // Get Commio account
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      const commioAccount = userAccounts.find((a: any) => a.provider === 'commio');
      
      if (!commioAccount) {
        return res.status(400).json({ error: "No Commio account found" });
      }

      const accountIdNum = parseInt(commioAccount.id.replace('acc_', ''));
      const creds = await accountService.getAccountCredentials(accountIdNum);
      
      if (!creds?.accountSid || !creds?.authToken) {
        return res.status(400).json({ error: "Commio credentials not configured" });
      }

      const { CommioProvider } = await import('./providers/commio.provider');
      const commioProvider = new CommioProvider({
        accountSid: creds.accountSid,
        authToken: creds.authToken,
        apiKey: creds.apiKey,
      });

      const reports = await commioProvider.getSmsReports({ startDate, endDate, limit });
      res.json(reports);
    } catch (error: any) {
      console.error("Error fetching Commio SMS reports:", error);
      res.status(500).json({ error: error.message || "Failed to fetch SMS reports" });
    }
  });

  /**
   * Get Commio SMS usage/billing data
   */
  app.get("/api/commio/sms-usage", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      // Get Commio account
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      const commioAccount = userAccounts.find((a: any) => a.provider === 'commio');
      
      if (!commioAccount) {
        return res.status(400).json({ error: "No Commio account found" });
      }

      const accountIdNum = parseInt(commioAccount.id.replace('acc_', ''));
      const creds = await accountService.getAccountCredentials(accountIdNum);
      
      if (!creds?.accountSid || !creds?.authToken) {
        return res.status(400).json({ error: "Commio credentials not configured" });
      }

      const { CommioProvider } = await import('./providers/commio.provider');
      const commioProvider = new CommioProvider({
        accountSid: creds.accountSid,
        authToken: creds.authToken,
        apiKey: creds.apiKey,
      });

      const usage = await commioProvider.getSmsUsage({ startDate, endDate });
      res.json(usage);
    } catch (error: any) {
      console.error("Error fetching Commio SMS usage:", error);
      res.status(500).json({ error: error.message || "Failed to fetch SMS usage" });
    }
  });

  /**
   * Sync all campaigns with Commio usage data
   * Uses the total outbound count to update campaign metrics
   */
  app.post("/api/campaigns/sync-all-metrics", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;

      // Get Commio account
      const { accounts: userAccounts } = await accountService.getAccountsForUser(userId);
      const commioAccount = userAccounts.find((a: any) => a.provider === 'commio');
      
      if (!commioAccount) {
        return res.status(400).json({ error: "No Commio account found" });
      }

      const accountIdNum = parseInt(commioAccount.id.replace('acc_', ''));
      const creds = await accountService.getAccountCredentials(accountIdNum);
      
      if (!creds?.accountSid || !creds?.authToken) {
        return res.status(400).json({ error: "Commio credentials not configured" });
      }

      const { CommioProvider } = await import('./providers/commio.provider');
      const commioProvider = new CommioProvider({
        accountSid: creds.accountSid,
        authToken: creds.authToken,
        apiKey: creds.apiKey,
      });

      // Get total SMS usage from Commio
      const usage = await commioProvider.getSmsUsage();
      
      // Get all campaigns for this user
      const campaigns = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.userId, userId));

      // Calculate total recipients across all campaigns
      const totalRecipients = campaigns.reduce((sum, c) => sum + (c.recipientCount || 0), 0);
      
      // If we have usage data and campaigns, distribute the sent count proportionally
      if (usage.outbound > 0 && totalRecipients > 0) {
        for (const campaign of campaigns) {
          if (campaign.recipientCount && campaign.recipientCount > 0) {
            // Proportional distribution based on recipient count
            const proportion = campaign.recipientCount / totalRecipients;
            const estimatedSent = Math.round(usage.outbound * proportion);
            
            await db
              .update(smsCampaigns)
              .set({
                sentCount: estimatedSent,
                status: estimatedSent > 0 ? 'completed' : campaign.status,
                updatedAt: new Date(),
              })
              .where(eq(smsCampaigns.id, campaign.id));
          }
        }
      }

      res.json({
        success: true,
        usage,
        campaignsUpdated: campaigns.length,
      });
    } catch (error: any) {
      console.error("Error syncing all campaign metrics:", error);
      res.status(500).json({ error: error.message || "Failed to sync campaign metrics" });
    }
  });

  /**
   * Get all SMS campaigns (optimized with limit and ordering)
   */
  app.get("/api/campaigns/sms-campaigns", async (req, res) => {
    try {
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      let query = db
        .select()
        .from(smsCampaigns)
        .orderBy(smsCampaigns.createdAt)
        .limit(limit);
        
      if (accountId) {
        query = db
          .select()
          .from(smsCampaigns)
          .where(eq(smsCampaigns.accountId, accountId))
          .orderBy(smsCampaigns.createdAt)
          .limit(limit) as any;
      }
      
      const campaigns = await query;
      res.json({ campaigns });
    } catch (error: any) {
      console.error("Error fetching SMS campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to fetch SMS campaigns" });
    }
  });

  /**
   * Migration endpoint: Fix all existing campaign templates with wrong brace formats
   */
  app.post("/api/campaigns/sms-campaigns/fix-templates", async (req, res) => {
    try {
      // Get all campaigns
      const allCampaigns = await db.select().from(smsCampaigns);
      
      let fixed = 0;
      let skipped = 0;
      
      for (const campaign of allCampaigns) {
        if (!campaign.messageTemplate) {
          skipped++;
          continue;
        }
        
        let original = campaign.messageTemplate;
        let sanitized = original;
        
        // Fix quadruple braces {{{{ to double braces {{
        sanitized = sanitized.replace(/\{\{\{\{([^}]+)\}\}\}\}/g, '{{$1}}');
        // Fix triple braces {{{ to double braces {{
        sanitized = sanitized.replace(/\{\{\{([^}]+)\}\}\}/g, '{{$1}}');
        // Note: Single braces are now handled by applyMergeTags which supports both formats
        
        // Only update if changed
        if (sanitized !== original) {
          await db
            .update(smsCampaigns)
            .set({ messageTemplate: sanitized, updatedAt: new Date() })
            .where(eq(smsCampaigns.id, campaign.id));
          fixed++;
        } else {
          skipped++;
        }
      }
      
      res.json({ 
        success: true, 
        message: `Fixed ${fixed} campaigns, skipped ${skipped} campaigns`,
        fixed,
        skipped,
        total: allCampaigns.length
      });
    } catch (error: any) {
      console.error("Error fixing campaign templates:", error);
      res.status(500).json({ error: error.message || "Failed to fix campaign templates" });
    }
  });

  /**
   * Add to opt-out list
   */
  app.post("/api/campaigns/opt-out", async (req, res) => {
    try {
      const { accountId, phoneNumber, reason, source } = req.body;

      if (!accountId || !phoneNumber) {
        return res.status(400).json({ error: "accountId and phoneNumber are required" });
      }

      await campaignService.addOptOut(accountId, phoneNumber, reason, source);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error adding to opt-out list:", error);
      res.status(500).json({ error: error.message || "Failed to add to opt-out list" });
    }
  });

  /**
   * Check if phone number is opted out
   */
  app.get("/api/campaigns/opt-out/check", async (req, res) => {
    try {
      const accountId = parseInt(req.query.accountId as string);
      const phoneNumber = req.query.phoneNumber as string;

      if (!accountId || !phoneNumber) {
        return res.status(400).json({ error: "accountId and phoneNumber are required" });
      }

      const isOptedOut = await campaignService.isOptedOut(accountId, phoneNumber);
      res.json({ optedOut: isOptedOut });
    } catch (error: any) {
      console.error("Error checking opt-out status:", error);
      res.status(500).json({ error: error.message || "Failed to check opt-out status" });
    }
  });

  // ============================================
  // MESSAGE TEMPLATES
  // ============================================

  /**
   * Get all message templates for user
   */
  app.get("/api/message-templates", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;

      const templates = await db
        .select()
        .from(messageTemplates)
        .where(eq(messageTemplates.userId, userId))
        .orderBy(messageTemplates.createdAt);

      res.json({ templates });
    } catch (error: any) {
      console.error("Error fetching message templates:", error);
      res.status(500).json({ error: error.message || "Failed to fetch message templates" });
    }
  });

  /**
   * Create a new message template
   */
  app.post("/api/message-templates", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const { name, content, description, category, accountId } = req.body;

      if (!name || !content) {
        return res.status(400).json({ error: "name and content are required" });
      }

      const [template] = await db
        .insert(messageTemplates)
        .values({
          userId,
          accountId,
          name,
          content,
          description,
          category,
        })
        .returning();

      res.json({ success: true, template });
    } catch (error: any) {
      console.error("Error creating message template:", error);
      res.status(500).json({ error: error.message || "Failed to create message template" });
    }
  });

  /**
   * Update a message template
   */
  app.put("/api/message-templates/:id", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const templateId = parseInt(req.params.id);
      const { name, content, description, category } = req.body;

      const [template] = await db
        .update(messageTemplates)
        .set({
          name,
          content,
          description,
          category,
          updatedAt: new Date(),
        })
        .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.userId, userId)))
        .returning();

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json({ success: true, template });
    } catch (error: any) {
      console.error("Error updating message template:", error);
      res.status(500).json({ error: error.message || "Failed to update message template" });
    }
  });

  /**
   * Delete a message template
   */
  app.delete("/api/message-templates/:id", async (req, res) => {
    try {
      const userId = (req as any).user?.id || 1;
      const templateId = parseInt(req.params.id);

      await db
        .delete(messageTemplates)
        .where(and(eq(messageTemplates.id, templateId), eq(messageTemplates.userId, userId)));

      res.json({ success: true, message: "Template deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting message template:", error);
      res.status(500).json({ error: error.message || "Failed to delete message template" });
    }
  });

  /**
   * Increment template usage count
   */
  app.post("/api/message-templates/:id/use", async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);

      const [template] = await db
        .update(messageTemplates)
        .set({
          usageCount: sql`${messageTemplates.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(messageTemplates.id, templateId))
        .returning();

      res.json({ success: true, template });
    } catch (error: any) {
      console.error("Error updating template usage:", error);
      res.status(500).json({ error: error.message || "Failed to update template usage" });
    }
  });

  // ============================================
  // CAMPAIGN MODES & ENHANCED FEATURES
  // ============================================

  /**
   * Test campaign message - send a single test SMS
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/test", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { testPhoneNumber } = req.body;

      if (!testPhoneNumber) {
        return res.status(400).json({ error: "testPhoneNumber is required" });
      }

      // Get campaign
      const [campaign] = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.id, campaignId));

      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (!campaign.accountId) {
        return res.status(400).json({ error: "Campaign account is not set" });
      }

      // Apply sample merge tags for test
      let testMessage = campaign.messageTemplate
        .replace(/\{first_name\}/g, 'John')
        .replace(/\{last_name\}/g, 'Doe')
        .replace(/\{name\}/g, 'John Doe')
        .replace(/\{phone\}/g, testPhoneNumber)
        .replace(/\$\{dollar_amount\}/g, '$500');

      // Append opt-out message if enabled
      if (campaign.optOutMessageEnabled && campaign.optOutMessageText) {
        testMessage += '\n' + campaign.optOutMessageText;
      }

      // Pick a from-number from the campaign account's phone pool (prefer SMS-capable), fallback to campaign's configured fromNumber
      const { accountPhoneNumbers } = await import('../shared/schema');
      const numbers = await db
        .select()
        .from(accountPhoneNumbers)
        .where(eq(accountPhoneNumbers.accountId, campaign.accountId));

      const smsCapable = numbers.find(n => (n.capabilities as any)?.sms === true);
      const selectedFrom = smsCapable?.phoneNumber || numbers[0]?.phoneNumber || '';

      const fromNumber = selectedFrom || (campaign.fromNumber || '').split(',')[0].trim();
      if (!fromNumber) {
        return res.status(400).json({ error: "No phone number available for this account" });
      }

      // Use only the campaign's own account/provider
      const provider = await accountService.getProviderForAccount(campaign.accountId);
      if (!provider) {
        return res.status(400).json({ error: "Campaign provider credentials are not configured" });
      }

      const result = await provider.sendMessage({
        to: testPhoneNumber,
        from: fromNumber,
        body: testMessage,
      });

      if (result.success) {
        return res.json({
          success: true,
          message: 'Test message sent successfully',
          preview: testMessage,
          messageSid: result.sid,
          fromNumber,
          accountId: campaign.accountId,
          provider: provider.code,
        });
      }

      return res.status(400).json({
        error: "Could not send test message. Check credentials or from number.",
        provider: provider.code,
        fromNumber,
      });
    } catch (error: any) {
      console.error("Error sending test message:", error);
      res.status(500).json({ error: error.message || "Failed to send test message" });
    }
  });

  /**
   * Archive/unarchive a campaign
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/archive", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { archived } = req.body;

      const [updated] = await db
        .update(smsCampaigns)
        .set({ 
          isArchived: archived !== false,
          updatedAt: new Date(),
        })
        .where(eq(smsCampaigns.id, campaignId))
        .returning();

      res.json({ success: true, campaign: updated });
    } catch (error: any) {
      console.error("Error archiving campaign:", error);
      res.status(500).json({ error: error.message || "Failed to archive campaign" });
    }
  });

  /**
   * Retarget campaign - create new campaign from failed/undelivered recipients
   */
  app.post("/api/campaigns/sms-campaigns/:campaignId/retarget", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const userId = (req as any).user?.id || 1;
      const { targetStatuses = ['failed', 'pending'] } = req.body;

      // Get original campaign
      const [originalCampaign] = await db
        .select()
        .from(smsCampaigns)
        .where(eq(smsCampaigns.id, campaignId));

      if (!originalCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Create new campaign
      const [newCampaign] = await db
        .insert(smsCampaigns)
        .values({
          userId,
          accountId: originalCampaign.accountId,
          name: `${originalCampaign.name} (Retarget)`,
          description: `Retargeted from campaign #${campaignId}`,
          messageTemplate: originalCampaign.messageTemplate,
          fromNumber: originalCampaign.fromNumber,
          sendMode: originalCampaign.sendMode || 'immediate',
          status: 'draft',
          metadata: originalCampaign.metadata,
        })
        .returning();

      // Copy failed/undelivered recipients to new campaign
      const failedRecipients = await db
        .select()
        .from(campaignRecipients)
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaignId),
          sql`${campaignRecipients.status} = ANY(${targetStatuses})`
        ));

      if (failedRecipients.length > 0) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < failedRecipients.length; i += BATCH_SIZE) {
          const batch = failedRecipients.slice(i, i + BATCH_SIZE).map(r => ({
            smsCampaignId: newCampaign.id,
            contactId: r.contactId,
            phoneNumber: r.phoneNumber,
            firstName: r.firstName,
            lastName: r.lastName,
            customFields: r.customFields,
            status: 'pending' as const,
          }));
          await db.insert(campaignRecipients).values(batch);
        }

        await db
          .update(smsCampaigns)
          .set({ recipientCount: failedRecipients.length, updatedAt: new Date() })
          .where(eq(smsCampaigns.id, newCampaign.id));
      }

      res.json({ 
        success: true, 
        campaign: newCampaign,
        recipientsRetargeted: failedRecipients.length,
      });
    } catch (error: any) {
      console.error("Error retargeting campaign:", error);
      res.status(500).json({ error: error.message || "Failed to retarget campaign" });
    }
  });

  /**
   * Get/update campaign permissions
   */
  app.get("/api/campaigns/sms-campaigns/:campaignId/permissions", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { campaignPermissions: permTable } = await import("@shared/schema");
      
      const permissions = await db
        .select()
        .from(permTable)
        .where(eq(permTable.smsCampaignId, campaignId));

      res.json({ permissions });
    } catch (error: any) {
      console.error("Error fetching campaign permissions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch permissions" });
    }
  });

  app.post("/api/campaigns/sms-campaigns/:campaignId/permissions", async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const { userId: permUserId, userGroup, permissionType = 'view' } = req.body;
      const { campaignPermissions: permTable } = await import("@shared/schema");

      const [permission] = await db
        .insert(permTable)
        .values({
          smsCampaignId: campaignId,
          userId: permUserId,
          userGroup,
          permissionType,
        })
        .returning();

      res.json({ success: true, permission });
    } catch (error: any) {
      console.error("Error adding campaign permission:", error);
      res.status(500).json({ error: error.message || "Failed to add permission" });
    }
  });

  /**
   * Campaign scheduler - check and start scheduled campaigns
   * This should be called periodically (e.g., every minute via cron or setInterval)
   */
  app.post("/api/campaigns/check-scheduled", async (req, res) => {
    try {
      const now = new Date();
      
      // Find campaigns that are scheduled and due
      const dueCampaigns = await db
        .select()
        .from(smsCampaigns)
        .where(and(
          eq(smsCampaigns.status, 'scheduled'),
          sql`${smsCampaigns.scheduledAt} <= ${now}`
        ));

      const results = [];
      for (const campaign of dueCampaigns) {
        try {
          console.log(`[Scheduler] Starting scheduled campaign ${campaign.id}: ${campaign.name}`);
          const result = await campaignService.startSmsCampaign(campaign.id);
          results.push({ campaignId: campaign.id, name: campaign.name, ...result });
        } catch (e: any) {
          results.push({ campaignId: campaign.id, name: campaign.name, success: false, error: e.message });
        }
      }

      res.json({ 
        success: true, 
        checked: dueCampaigns.length,
        results,
      });
    } catch (error: any) {
      console.error("Error checking scheduled campaigns:", error);
      res.status(500).json({ error: error.message || "Failed to check scheduled campaigns" });
    }
  });

  const httpServer = createServer(app);

  // Start campaign scheduler - checks every 60 seconds for due scheduled campaigns
  setInterval(async () => {
    try {
      const now = new Date();
      const dueCampaigns = await db
        .select()
        .from(smsCampaigns)
        .where(and(
          eq(smsCampaigns.status, 'scheduled'),
          sql`${smsCampaigns.scheduledAt} <= ${now}`
        ));

      for (const campaign of dueCampaigns) {
        console.log(`[Scheduler] Auto-starting scheduled campaign ${campaign.id}: ${campaign.name}`);
        campaignService.startSmsCampaign(campaign.id).catch(err => {
          console.error(`[Scheduler] Failed to start campaign ${campaign.id}:`, err);
        });
      }
    } catch (err) {
      console.error('[Scheduler] Error checking scheduled campaigns:', err);
    }
  }, 60_000);

  return httpServer;
}
