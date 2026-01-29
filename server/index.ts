import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { autoRefillService } from "./autoRefillService";
import { initializeWorkers } from "./workers";
import { redisService, CACHE_TTL, STALE_TTL } from "./services/redisService";
import { twilioAnalyticsService } from "./twilioAnalytics";
import { dataService } from "./services/dataService";

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
    
    // Start the auto-refill service
    autoRefillService.start();
    
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
