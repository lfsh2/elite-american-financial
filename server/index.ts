import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { autoRefillService } from "./autoRefillService";
import { initializeWorkers } from "./workers";
import { redisService, CACHE_TTL, STALE_TTL } from "./services/redisService";
import { twilioAnalyticsService } from "./twilioAnalytics";
import { dataService } from "./services/dataService";
import { db } from "./db";
import { smsCampaigns, campaignRecipients } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on configured port (default 3000)
  // Port 5000 is blocked on macOS by AirPlay Receiver
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    
    // Log outbound IP for Commio IP whitelist management
    fetch('https://api.ipify.org').then(r => r.text()).then(ip => {
      log(`Server outbound IP: ${ip} (whitelist this in Commio if needed)`);
    }).catch(() => {});
    
    // Start the auto-refill service
    autoRefillService.start();
    
    // Auto-recover stuck campaigns immediately on startup
    recoverStuckCampaigns();
    
    // Auto-resume paused campaigns after 10 seconds (let server fully start first)
    setTimeout(() => {
      autoResumePausedCampaigns();
    }, 10000);
    
    // Periodic auto-recovery: Check for stuck campaigns every 5 minutes and auto-resume them
    setInterval(() => {
      recoverStuckCampaigns();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Stuck campaign detection: Check for campaigns that haven't updated in 2 minutes
    setInterval(async () => {
      try {
        const TWO_MINUTES_AGO = new Date(Date.now() - 2 * 60 * 1000);
        
        // Find campaigns in "sending" status that haven't updated in 2 minutes
        const stuckCampaigns = await db.select()
          .from(smsCampaigns)
          .where(and(
            eq(smsCampaigns.status, 'sending'),
            sql`${smsCampaigns.updatedAt} < ${TWO_MINUTES_AGO}`
          ));
        
        if (stuckCampaigns.length > 0) {
          log(`[StuckDetection] Found ${stuckCampaigns.length} stuck campaign(s)`);
          
          for (const campaign of stuckCampaigns) {
            // Check if there are pending recipients
            const pendingResult = await db.select({ count: sql<number>`count(*)` })
              .from(campaignRecipients)
              .where(and(
                eq(campaignRecipients.smsCampaignId, campaign.id),
                eq(campaignRecipients.status, 'pending')
              ));
            
            const pendingCount = Number(pendingResult[0]?.count || 0);
            
            if (pendingCount > 0) {
              log(`[StuckDetection] Campaign ${campaign.id} "${campaign.name}" stuck with ${pendingCount} pending - restarting...`);
              
              // Reset to draft so it can be restarted
              await db.update(smsCampaigns)
                .set({ status: 'draft', updatedAt: new Date() })
                .where(eq(smsCampaigns.id, campaign.id));
              
              // Auto-restart via internal API call
              try {
                const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/campaigns/sms-campaigns/${campaign.id}/start`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                });
                
                if (response.ok) {
                  log(`[StuckDetection] ✅ Campaign ${campaign.id} auto-restarted successfully`);
                } else {
                  const error = await response.text();
                  log(`[StuckDetection] ⚠️ Campaign ${campaign.id} restart failed: ${error}`);
                }
              } catch (fetchErr: any) {
                log(`[StuckDetection] ⚠️ Campaign ${campaign.id} restart error: ${fetchErr.message}`);
              }
            } else {
              // No pending recipients - mark as completed
              await db.update(smsCampaigns)
                .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
                .where(eq(smsCampaigns.id, campaign.id));
              log(`[StuckDetection] Campaign ${campaign.id} "${campaign.name}" - no pending, marked COMPLETED`);
            }
          }
        }
      } catch (error) {
        console.error('[StuckDetection] Error detecting stuck campaigns:', error);
      }
    }, 2 * 60 * 1000); // Check every 2 minutes
    
    // Initialize background workers after a short delay to allow Redis to connect
    setTimeout(async () => {
      if (redisService.isAvailable()) {
        initializeWorkers();
        log('Background workers initialized');
        
        // SKIP aggressive cache warming on startup to prevent OOM on Render (2GB limit)
        // Data will be fetched lazily on first request and cached
        log('✅ Server ready - data will be loaded on first request');
      } else {
        log('Redis not available - running without background workers (caching still works)');
      }
    }, 2000);
  });
})();

/**
 * Pre-warm the cache by fetching all critical data from third-party APIs
 * This runs in the background on server startup so users never have to wait
 */
async function warmCache() {
  const startTime = Date.now();
  
  try {
    // Fetch Twilio analytics and cache it
    log('[CacheWarm] Fetching Twilio analytics...');
    const twilioAnalytics = await twilioAnalyticsService.getAnalytics();
    
    // Cache Twilio analytics
    await redisService.set('textflow:twilio:analytics', twilioAnalytics, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
    
    // Cache Twilio metrics
    const metrics = {
      messages: {
        sentToday: twilioAnalytics.metrics.totalMessagesSentToday,
        receivedToday: twilioAnalytics.metrics.totalMessagesReceivedToday,
        sentYesterday: twilioAnalytics.metrics.totalMessagesSentYesterday,
        sentThisWeek: twilioAnalytics.metrics.totalMessagesSentThisWeek,
        sentThisMonth: twilioAnalytics.metrics.totalMessagesSentThisMonth,
        deliveryRate: twilioAnalytics.metrics.deliveryRateToday,
        failed: twilioAnalytics.metrics.failedToday
      },
      calls: {
        today: twilioAnalytics.metrics.totalCallsToday,
        thisWeek: twilioAnalytics.metrics.totalCallsThisWeek,
        durationToday: twilioAnalytics.metrics.totalCallDurationToday
      },
      spend: {
        today: twilioAnalytics.metrics.totalSpendToday,
        thisMonth: twilioAnalytics.metrics.totalSpendThisMonth,
        avgPerMessage: twilioAnalytics.metrics.averageMessageCost
      },
      account: {
        status: twilioAnalytics.account.status,
        phoneNumbers: twilioAnalytics.phoneNumbers.length
      },
      generatedAt: twilioAnalytics.generatedAt
    };
    await redisService.set('textflow:twilio:metrics', metrics, CACHE_TTL.METRICS, STALE_TTL.METRICS);
    
    // Fetch and cache main dashboard analytics for default user
    log('[CacheWarm] Fetching dashboard analytics...');
    const dashboardData = await dataService.getAnalytics({ userId: 1, isOverviewMode: true });
    
    // Create lightweight version for caching (metrics + limited messages)
    const lightweight = {
      context: dashboardData.context,
      accounts: dashboardData.accounts?.map((acc: any) => ({
        accountId: acc.accountId,
        accountName: acc.accountName,
        provider: acc.provider,
        analytics: {
          account: acc.analytics?.account,
          metrics: acc.analytics?.metrics,
          phoneNumbers: acc.analytics?.phoneNumbers,
          messages: {
            today: acc.analytics?.messages?.today?.slice(0, 50) || [],
            thisWeek: acc.analytics?.messages?.thisWeek?.slice(0, 50) || [],
            thisMonth: acc.analytics?.messages?.thisMonth?.slice(0, 100) || [],
          },
          calls: {
            today: acc.analytics?.calls?.today?.slice(0, 50) || [],
            thisWeek: acc.analytics?.calls?.thisWeek?.slice(0, 50) || [],
            thisMonth: acc.analytics?.calls?.thisMonth?.slice(0, 100) || [],
          },
        },
      })) || [],
      aggregatedMetrics: dashboardData.aggregatedMetrics,
      messages: {
        today: dashboardData.messages?.today?.slice(0, 50) || [],
        thisWeek: dashboardData.messages?.thisWeek?.slice(0, 50) || [],
        thisMonth: dashboardData.messages?.thisMonth?.slice(0, 100) || [],
      },
      calls: {
        today: dashboardData.calls?.today?.slice(0, 50) || [],
        thisWeek: dashboardData.calls?.thisWeek?.slice(0, 50) || [],
        thisMonth: dashboardData.calls?.thisMonth?.slice(0, 100) || [],
      },
    };
    
    // Cache with the same key used by the route
    const dashboardCacheKey = 'textflow:dashboard:1:overview';
    await redisService.set(dashboardCacheKey, lightweight, CACHE_TTL.ANALYTICS, STALE_TTL.ANALYTICS);
    log('[CacheWarm] Dashboard data cached at:', dashboardCacheKey);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`✅ Cache pre-warmed in ${duration}s - Dashboard will load instantly!`);
    
  } catch (error) {
    console.error('[CacheWarm] Failed to warm cache:', error);
  }
}

/**
 * Recover campaigns that were stuck in 'sending' status when the server restarted.
 * Automatically resumes them without pausing - they continue sending immediately.
 */
async function recoverStuckCampaigns() {
  try {
    // Find all campaigns stuck in 'sending' status
    const stuckCampaigns = await db
      .select({ id: smsCampaigns.id, name: smsCampaigns.name, sentCount: smsCampaigns.sentCount, failedCount: smsCampaigns.failedCount })
      .from(smsCampaigns)
      .where(eq(smsCampaigns.status, 'sending'));
    
    if (stuckCampaigns.length === 0) {
      log('[Recovery] No stuck campaigns found');
      return;
    }
    
    log(`[Recovery] Found ${stuckCampaigns.length} stuck campaign(s) - auto-resuming...`);
    
    // Auto-resume each stuck campaign immediately
    for (const campaign of stuckCampaigns) {
      // Count pending recipients
      const pendingResult = await db.select({ count: sql<number>`count(*)` })
        .from(campaignRecipients)
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaign.id),
          eq(campaignRecipients.status, 'pending')
        ));
      
      const pendingCount = Number(pendingResult[0]?.count || 0);
      
      if (pendingCount === 0) {
        // No pending - mark as completed
        await db.update(smsCampaigns)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(smsCampaigns.id, campaign.id));
        log(`[Recovery] Campaign "${campaign.name}" (ID: ${campaign.id}) - no pending, marked COMPLETED`);
      } else {
        // Has pending - auto-resume via internal HTTP call
        log(`[Recovery] Campaign "${campaign.name}" (ID: ${campaign.id}) - ${pendingCount} pending, resuming...`);
        
        try {
          const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/sms/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: campaign.id }),
          });
          
          if (response.ok) {
            log(`[Recovery] ✅ Campaign "${campaign.name}" (ID: ${campaign.id}) resumed successfully`);
          } else {
            const error = await response.text();
            log(`[Recovery] ⚠️ Campaign "${campaign.name}" resume failed: ${error}`);
          }
        } catch (fetchErr: any) {
          log(`[Recovery] ⚠️ Campaign "${campaign.name}" resume error: ${fetchErr.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    log(`[Recovery] ✅ Processed ${stuckCampaigns.length} stuck campaign(s)`);
  } catch (error) {
    console.error('[Recovery] Failed to recover stuck campaigns:', error);
  }
}

/**
 * Auto-resume all paused/sending campaigns by triggering the batch send for each.
 * This ensures campaigns continue and complete even after server crash/restart.
 */
async function autoResumePausedCampaigns() {
  try {
    // Find campaigns that need to be resumed (paused or stuck in sending)
    const campaignsToResume = await db.select()
      .from(smsCampaigns)
      .where(sql`${smsCampaigns.status} IN ('paused', 'sending')`);
    
    if (campaignsToResume.length === 0) {
      log('[AutoResume] No campaigns to resume');
      return;
    }
    
    log(`[AutoResume] Found ${campaignsToResume.length} campaign(s) to resume`);
    
    for (const campaign of campaignsToResume) {
      // Count pending recipients
      const pendingResult = await db.select({ count: sql<number>`count(*)` })
        .from(campaignRecipients)
        .where(and(
          eq(campaignRecipients.smsCampaignId, campaign.id),
          eq(campaignRecipients.status, 'pending')
        ));
      
      const pendingCount = Number(pendingResult[0]?.count || 0);
      
      if (pendingCount === 0) {
        // No pending - mark as completed
        await db.update(smsCampaigns)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(smsCampaigns.id, campaign.id));
        log(`[AutoResume] Campaign "${campaign.name}" (ID: ${campaign.id}) - no pending, marked COMPLETED`);
      } else {
        // Has pending - trigger auto-resume via internal HTTP call
        log(`[AutoResume] Campaign "${campaign.name}" (ID: ${campaign.id}) - ${pendingCount} pending, auto-resuming...`);
        
        // Make internal API call to resume the campaign
        try {
          const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/sms/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: campaign.id }),
          });
          
          if (response.ok) {
            log(`[AutoResume] ✅ Campaign "${campaign.name}" (ID: ${campaign.id}) resumed successfully`);
          } else {
            const error = await response.text();
            log(`[AutoResume] ⚠️ Campaign "${campaign.name}" resume failed: ${error}`);
          }
        } catch (fetchErr: any) {
          log(`[AutoResume] ⚠️ Campaign "${campaign.name}" resume error: ${fetchErr.message}`);
        }
        
        // Small delay between campaign resumes to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    log(`[AutoResume] ✅ Processed ${campaignsToResume.length} campaign(s)`);
  } catch (error) {
    console.error('[AutoResume] Failed to auto-resume campaigns:', error);
  }
}
