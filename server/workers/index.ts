/**
 * Background Workers Initialization
 * 
 * Registers BullMQ workers for processing background jobs:
 * - Historical data sync
 * - Incremental sync
 * - Metrics aggregation
 * - Webhook processing
 */

import { Job } from 'bullmq';
import { queueService, JobType } from '../services/queueService';
import { processHistoricalSyncJob, processIncrementalSyncJob } from '../jobs/syncHistoricalData';
import { processAggregateMetricsJob } from '../jobs/aggregateMetrics';
import type { 
  SyncHistoricalDataJob, 
  SyncIncrementalJob, 
  AggregateMetricsJob,
  ProcessWebhookJob 
} from '../services/queueService';

/**
 * Initialize all background workers
 */
export function initializeWorkers(): void {
  console.log('[Workers] Initializing background workers...');

  // Sync worker - handles historical and incremental data sync
  const syncWorker = queueService.registerWorker('sync', async (job: Job) => {
    console.log(`[Workers] Processing sync job: ${job.name} (${job.id})`);

    switch (job.name) {
      case JobType.SYNC_HISTORICAL_DATA:
        return processHistoricalSyncJob(job as Job<SyncHistoricalDataJob>);
      
      case JobType.SYNC_INCREMENTAL:
        return processIncrementalSyncJob(job as Job<SyncIncrementalJob>);
      
      default:
        console.warn(`[Workers] Unknown sync job type: ${job.name}`);
    }
  });

  if (syncWorker) {
    console.log('[Workers] Sync worker registered');
  }

  // Metrics worker - handles analytics aggregation
  const metricsWorker = queueService.registerWorker('metrics', async (job: Job) => {
    console.log(`[Workers] Processing metrics job: ${job.name} (${job.id})`);

    if (job.name === JobType.AGGREGATE_METRICS) {
      return processAggregateMetricsJob(job as Job<AggregateMetricsJob>);
    }
  });

  if (metricsWorker) {
    console.log('[Workers] Metrics worker registered');
  }

  // Webhook worker - processes incoming webhooks asynchronously
  const webhookWorker = queueService.registerWorker('webhooks', async (job: Job) => {
    console.log(`[Workers] Processing webhook job: ${job.name} (${job.id})`);

    if (job.name === JobType.PROCESS_WEBHOOK) {
      const data = job.data as ProcessWebhookJob;
      // Webhook processing is handled synchronously in the webhook handlers
      // This worker is for retry logic and async processing if needed
      console.log(`[Workers] Webhook from ${data.provider}: ${data.eventType}`);
      return { processed: true };
    }
  });

  if (webhookWorker) {
    console.log('[Workers] Webhook worker registered');
  }

  console.log('[Workers] All workers initialized');
}

/**
 * Schedule recurring jobs for all accounts
 */
export async function scheduleRecurringJobs(): Promise<void> {
  console.log('[Workers] Scheduling recurring jobs...');

  // Note: In production, you would iterate through all accounts
  // and schedule metrics aggregation for each
  // For now, this is a placeholder

  console.log('[Workers] Recurring jobs scheduled');
}
