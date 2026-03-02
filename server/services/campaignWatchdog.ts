import { db } from '../db';
import { smsCampaigns, campaignRecipients } from '@shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import * as campaignService from './campaignService';

/**
 * Campaign Watchdog Service
 * 
 * Monitors SMS campaigns for stalls and auto-resumes them.
 * A campaign is considered "stalled" if:
 * - Status is 'sending'
 * - Has pending recipients
 * - No progress (sentCount + failedCount unchanged) for STALL_THRESHOLD_MINUTES
 * 
 * The watchdog runs every CHECK_INTERVAL_MINUTES and will auto-resume stalled campaigns.
 */

const CHECK_INTERVAL_MINUTES = 2; // Check every 2 minutes (more aggressive)
const STALL_THRESHOLD_MINUTES = 3; // Consider stalled if no progress for 3 minutes
const MAX_AUTO_RESUME_ATTEMPTS = 10; // Max auto-resume attempts per campaign (increased for long campaigns)

// Track campaign progress for stall detection
interface CampaignProgress {
  lastSentCount: number;
  lastFailedCount: number;
  lastCheckedAt: Date;
  autoResumeAttempts: number;
  lastResumeAt?: Date;
}

const campaignProgressMap: Map<number, CampaignProgress> = new Map();

// Track if watchdog is running
let watchdogInterval: NodeJS.Timeout | null = null;
let isWatchdogRunning = false;

/**
 * Check if a campaign is stalled (no progress for threshold period)
 */
function isCampaignStalled(
  campaignId: number,
  currentSentCount: number,
  currentFailedCount: number
): boolean {
  const progress = campaignProgressMap.get(campaignId);
  
  if (!progress) {
    // First time seeing this campaign, record baseline
    campaignProgressMap.set(campaignId, {
      lastSentCount: currentSentCount,
      lastFailedCount: currentFailedCount,
      lastCheckedAt: new Date(),
      autoResumeAttempts: 0,
    });
    return false;
  }
  
  const totalBefore = progress.lastSentCount + progress.lastFailedCount;
  const totalNow = currentSentCount + currentFailedCount;
  
  if (totalNow > totalBefore) {
    // Progress made, update baseline
    progress.lastSentCount = currentSentCount;
    progress.lastFailedCount = currentFailedCount;
    progress.lastCheckedAt = new Date();
    return false;
  }
  
  // No progress - check if stalled long enough
  const minutesSinceLastProgress = (Date.now() - progress.lastCheckedAt.getTime()) / (1000 * 60);
  return minutesSinceLastProgress >= STALL_THRESHOLD_MINUTES;
}

/**
 * Get pending recipient count for a campaign
 */
async function getPendingRecipientCount(campaignId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaignRecipients)
    .where(and(
      eq(campaignRecipients.smsCampaignId, campaignId),
      eq(campaignRecipients.status, 'pending')
    ));
  return Number(result[0]?.count || 0);
}

/**
 * Auto-resume a stalled campaign
 */
async function autoResumeCampaign(campaignId: number, campaignName: string): Promise<boolean> {
  const progress = campaignProgressMap.get(campaignId);
  
  if (progress && progress.autoResumeAttempts >= MAX_AUTO_RESUME_ATTEMPTS) {
    console.log(`[Watchdog] Campaign ${campaignId} (${campaignName}) exceeded max auto-resume attempts (${MAX_AUTO_RESUME_ATTEMPTS}). Manual intervention required.`);
    
    // Mark as paused to prevent further auto-resume attempts
    await db.update(smsCampaigns)
      .set({ 
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(smsCampaigns.id, campaignId));
    
    return false;
  }
  
  console.log(`[Watchdog] Auto-resuming stalled campaign ${campaignId} (${campaignName})...`);
  
  try {
    // First, set status to 'paused' so startSmsCampaign can restart it
    await db.update(smsCampaigns)
      .set({ 
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(eq(smsCampaigns.id, campaignId));
    
    // Small delay to ensure status is committed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now restart the campaign
    const result = await campaignService.startSmsCampaign(campaignId);
    
    if (result.success) {
      console.log(`[Watchdog] ✓ Campaign ${campaignId} (${campaignName}) auto-resumed successfully`);
      
      // Update progress tracking
      if (progress) {
        progress.autoResumeAttempts++;
        progress.lastResumeAt = new Date();
        progress.lastCheckedAt = new Date();
      }
      
      return true;
    } else {
      console.error(`[Watchdog] ✗ Failed to auto-resume campaign ${campaignId}: ${result.message}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[Watchdog] ✗ Error auto-resuming campaign ${campaignId}:`, error.message);
    return false;
  }
}

/**
 * Main watchdog check - runs periodically
 */
async function runWatchdogCheck(): Promise<void> {
  if (isWatchdogRunning) {
    console.log('[Watchdog] Previous check still running, skipping...');
    return;
  }
  
  isWatchdogRunning = true;
  
  try {
    // Find all campaigns with 'sending' status
    const sendingCampaigns = await db
      .select({
        id: smsCampaigns.id,
        name: smsCampaigns.name,
        sentCount: smsCampaigns.sentCount,
        failedCount: smsCampaigns.failedCount,
        recipientCount: smsCampaigns.recipientCount,
        updatedAt: smsCampaigns.updatedAt,
      })
      .from(smsCampaigns)
      .where(eq(smsCampaigns.status, 'sending'));
    
    if (sendingCampaigns.length === 0) {
      // Clean up progress map for campaigns no longer sending
      campaignProgressMap.clear();
      return;
    }
    
    console.log(`[Watchdog] Checking ${sendingCampaigns.length} sending campaign(s)...`);
    
    for (const campaign of sendingCampaigns) {
      const sentCount = campaign.sentCount || 0;
      const failedCount = campaign.failedCount || 0;
      const recipientCount = campaign.recipientCount || 0;
      
      // Check if campaign is complete (all recipients processed)
      const totalProcessed = sentCount + failedCount;
      if (recipientCount > 0 && totalProcessed >= recipientCount) {
        console.log(`[Watchdog] Campaign ${campaign.id} (${campaign.name}) is 100% complete but still 'sending'. Marking as completed.`);
        await db.update(smsCampaigns)
          .set({ 
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(smsCampaigns.id, campaign.id));
        campaignProgressMap.delete(campaign.id);
        continue;
      }
      
      // Check for pending recipients
      const pendingCount = await getPendingRecipientCount(campaign.id);
      
      if (pendingCount === 0) {
        console.log(`[Watchdog] Campaign ${campaign.id} (${campaign.name}) has no pending recipients. Marking as completed.`);
        await db.update(smsCampaigns)
          .set({ 
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(smsCampaigns.id, campaign.id));
        campaignProgressMap.delete(campaign.id);
        continue;
      }
      
      // Check if campaign is stalled
      if (isCampaignStalled(campaign.id, sentCount, failedCount)) {
        console.log(`[Watchdog] Campaign ${campaign.id} (${campaign.name}) appears stalled. Sent: ${sentCount}, Failed: ${failedCount}, Pending: ${pendingCount}`);
        await autoResumeCampaign(campaign.id, campaign.name || `Campaign ${campaign.id}`);
      } else {
        const progress = campaignProgressMap.get(campaign.id);
        const rate = progress ? Math.round(((sentCount + failedCount) - (progress.lastSentCount + progress.lastFailedCount)) / (CHECK_INTERVAL_MINUTES)) : 0;
        console.log(`[Watchdog] Campaign ${campaign.id} (${campaign.name}): ${sentCount} sent, ${failedCount} failed, ${pendingCount} pending (~${rate} msgs/min)`);
      }
    }
    
    // Clean up progress map for campaigns no longer in sending state
    const sendingIds = new Set(sendingCampaigns.map(c => c.id));
    for (const campaignId of campaignProgressMap.keys()) {
      if (!sendingIds.has(campaignId)) {
        campaignProgressMap.delete(campaignId);
      }
    }
    
  } catch (error: any) {
    console.error('[Watchdog] Error during check:', error.message);
  } finally {
    isWatchdogRunning = false;
  }
}

/**
 * Start the campaign watchdog
 */
export function startWatchdog(): void {
  if (watchdogInterval) {
    console.log('[Watchdog] Already running');
    return;
  }
  
  console.log(`[Watchdog] Starting campaign watchdog (check every ${CHECK_INTERVAL_MINUTES} minutes, stall threshold: ${STALL_THRESHOLD_MINUTES} minutes)`);
  
  // Run initial check after 30 seconds (give server time to start)
  setTimeout(() => {
    runWatchdogCheck().catch(err => console.error('[Watchdog] Initial check error:', err));
  }, 30000);
  
  // Then run periodically
  watchdogInterval = setInterval(() => {
    runWatchdogCheck().catch(err => console.error('[Watchdog] Periodic check error:', err));
  }, CHECK_INTERVAL_MINUTES * 60 * 1000);
}

/**
 * Stop the campaign watchdog
 */
export function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    console.log('[Watchdog] Stopped');
  }
}

/**
 * Manually trigger a watchdog check (for testing/debugging)
 */
export async function triggerWatchdogCheck(): Promise<{ checked: number; resumed: number; completed: number }> {
  console.log('[Watchdog] Manual check triggered');
  
  let checked = 0;
  let resumed = 0;
  let completed = 0;
  
  try {
    const sendingCampaigns = await db
      .select({
        id: smsCampaigns.id,
        name: smsCampaigns.name,
        sentCount: smsCampaigns.sentCount,
        failedCount: smsCampaigns.failedCount,
        recipientCount: smsCampaigns.recipientCount,
      })
      .from(smsCampaigns)
      .where(eq(smsCampaigns.status, 'sending'));
    
    checked = sendingCampaigns.length;
    
    for (const campaign of sendingCampaigns) {
      const pendingCount = await getPendingRecipientCount(campaign.id);
      const sentCount = campaign.sentCount || 0;
      const failedCount = campaign.failedCount || 0;
      
      if (pendingCount === 0 || (campaign.recipientCount && (sentCount + failedCount) >= campaign.recipientCount)) {
        await db.update(smsCampaigns)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(smsCampaigns.id, campaign.id));
        completed++;
      } else if (isCampaignStalled(campaign.id, sentCount, failedCount)) {
        const success = await autoResumeCampaign(campaign.id, campaign.name || `Campaign ${campaign.id}`);
        if (success) resumed++;
      }
    }
  } catch (error: any) {
    console.error('[Watchdog] Manual check error:', error.message);
  }
  
  return { checked, resumed, completed };
}

/**
 * Get watchdog status
 */
export function getWatchdogStatus(): {
  running: boolean;
  checkIntervalMinutes: number;
  stallThresholdMinutes: number;
  trackedCampaigns: number;
  campaignDetails: Array<{ id: number; attempts: number; lastResumeAt?: Date }>;
} {
  const campaignDetails = Array.from(campaignProgressMap.entries()).map(([id, progress]) => ({
    id,
    attempts: progress.autoResumeAttempts,
    lastResumeAt: progress.lastResumeAt,
  }));
  
  return {
    running: watchdogInterval !== null,
    checkIntervalMinutes: CHECK_INTERVAL_MINUTES,
    stallThresholdMinutes: STALL_THRESHOLD_MINUTES,
    trackedCampaigns: campaignProgressMap.size,
    campaignDetails,
  };
}
