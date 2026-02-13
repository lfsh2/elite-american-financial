/**
 * Queue Service (BullMQ)
 * 
 * Manages background jobs for:
 * - Historical data sync from providers
 * - Metrics aggregation
 * - Report generation
 * - Webhook retries
 */

import { Queue, Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

// Redis connection for BullMQ
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL for BullMQ connection
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    const useTLS = url.startsWith('rediss://');
    
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      tls: useTLS ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

// Job types
export enum JobType {
  SYNC_HISTORICAL_DATA = 'sync-historical-data',
  SYNC_INCREMENTAL = 'sync-incremental',
  AGGREGATE_METRICS = 'aggregate-metrics',
  GENERATE_REPORT = 'generate-report',
  PROCESS_WEBHOOK = 'process-webhook',
}

// Job data interfaces
export interface SyncHistoricalDataJob {
  accountId: number;
  provider: 'twilio' | 'commio' | 'bandwidth';
  accountSid: string;
  authToken: string;
  monthsBack?: number;
}

export interface SyncIncrementalJob {
  accountId: number;
  provider: 'twilio' | 'commio' | 'bandwidth';
  accountSid: string;
  authToken: string;
  lastSyncDate: string;
}

export interface AggregateMetricsJob {
  accountId: number;
  period: 'daily' | 'weekly' | 'monthly';
}

export interface GenerateReportJob {
  accountId: number;
  reportType: 'messages' | 'calls' | 'usage' | 'summary';
  dateRange: {
    startDate: string;
    endDate: string;
  };
  format: 'csv' | 'json' | 'pdf';
}

export interface ProcessWebhookJob {
  provider: 'twilio' | 'commio' | 'bandwidth';
  eventType: string;
  payload: Record<string, any>;
  receivedAt: string;
}

type JobData = 
  | SyncHistoricalDataJob 
  | SyncIncrementalJob 
  | AggregateMetricsJob 
  | GenerateReportJob 
  | ProcessWebhookJob;

class QueueService {
  private connection: ConnectionOptions;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private isInitialized: boolean = false;
  private redisErrorLogged: boolean = false;

  constructor() {
    this.connection = parseRedisUrl(REDIS_URL);
    // BullMQ disabled — Redis (Upstash) request limit exceeded
    console.log('[BullMQ] Disabled — running without job queues');
  }

  private createQueue(name: string, options: any = {}): Queue {
    if (!this.connection) {
      throw new Error('Redis connection not available');
    }

    const queue = new Queue(name, {
      connection: { ...this.connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
      ...options,
    });

    queue.on('error', (err) => {
      if (!this.redisErrorLogged) {
        console.warn(`[BullMQ] Queue "${name}" error (suppressing further):`, err.message);
        this.redisErrorLogged = true;
      }
    });

    this.queues.set(name, queue);
    return queue;
  }

  /**
   * Check if queue service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.connection !== null;
  }

  /**
   * Add a job to sync historical data
   */
  async addSyncHistoricalJob(data: SyncHistoricalDataJob): Promise<Job | null> {
    if (!this.isAvailable()) {
      console.warn('[BullMQ] Queue not available, skipping job');
      return null;
    }

    const queue = this.queues.get('sync');
    if (!queue) return null;

    const job = await queue.add(JobType.SYNC_HISTORICAL_DATA, data, {
      jobId: `sync-historical-${data.accountId}-${Date.now()}`,
      priority: 1,
    });

    console.log(`[BullMQ] Added historical sync job for account ${data.accountId}`);
    return job;
  }

  /**
   * Add a job to sync incremental data
   */
  async addSyncIncrementalJob(data: SyncIncrementalJob): Promise<Job | null> {
    if (!this.isAvailable()) return null;

    const queue = this.queues.get('sync');
    if (!queue) return null;

    const job = await queue.add(JobType.SYNC_INCREMENTAL, data, {
      jobId: `sync-incremental-${data.accountId}-${Date.now()}`,
      priority: 2,
    });

    return job;
  }

  /**
   * Add a job to aggregate metrics
   */
  async addAggregateMetricsJob(data: AggregateMetricsJob): Promise<Job | null> {
    if (!this.isAvailable()) return null;

    const queue = this.queues.get('metrics');
    if (!queue) return null;

    const job = await queue.add(JobType.AGGREGATE_METRICS, data, {
      jobId: `aggregate-${data.accountId}-${data.period}-${Date.now()}`,
    });

    return job;
  }

  /**
   * Add a job to process webhook
   */
  async addWebhookJob(data: ProcessWebhookJob): Promise<Job | null> {
    if (!this.isAvailable()) return null;

    const queue = this.queues.get('webhooks');
    if (!queue) return null;

    const job = await queue.add(JobType.PROCESS_WEBHOOK, data, {
      priority: 1, // High priority for webhooks
    });

    return job;
  }

  /**
   * Schedule recurring metrics aggregation
   */
  async scheduleMetricsAggregation(accountId: number): Promise<void> {
    if (!this.isAvailable()) return;

    const queue = this.queues.get('metrics');
    if (!queue) return;

    // Add repeatable job for metrics aggregation every 5 minutes
    await queue.add(
      JobType.AGGREGATE_METRICS,
      { accountId, period: 'daily' } as AggregateMetricsJob,
      {
        repeat: {
          every: 5 * 60 * 1000, // 5 minutes
        },
        jobId: `aggregate-recurring-${accountId}`,
      }
    );

    console.log(`[BullMQ] Scheduled recurring metrics aggregation for account ${accountId}`);
  }

  /**
   * Register a worker for processing jobs
   */
  registerWorker(
    queueName: string,
    processor: (job: Job<JobData>) => Promise<any>
  ): Worker | null {
    if (!this.connection) return null;

    const worker = new Worker(queueName, processor, {
      connection: { ...this.connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
      concurrency: 5,
    });

    worker.on('completed', (job) => {
      console.log(`[BullMQ] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err: Error) => {
      if (!this.redisErrorLogged) {
        console.error(`[BullMQ] Job ${job?.id} failed:`, err.message);
      }
    });

    worker.on('error', (err) => {
      if (!this.redisErrorLogged) {
        console.warn(`[BullMQ] Worker "${queueName}" error (suppressing further):`, err.message);
        this.redisErrorLogged = true;
      }
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  } | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const workers = Array.from(this.workers.values());
    for (const worker of workers) {
      await worker.close();
    }

    const queues = Array.from(this.queues.values());
    for (const queue of queues) {
      await queue.close();
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();
