import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Logger } from '../lib/logger';
import type { EnqueueOptions, JobData, JobHandler, JobName, JobQueue } from './queue';

const QUEUE_NAME = 'donat-fulfillment';

/** Redis-backed queue for production. Run `npm run start:worker` to process jobs. */
export class BullMqQueue implements JobQueue {
  readonly kind = 'bullmq' as const;
  private readonly connection: IORedis;
  private readonly queue: Queue<JobData, void, JobName>;
  private worker?: Worker<JobData, void, JobName>;

  constructor(
    redisUrl: string,
    private readonly logger: Logger,
  ) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<JobData, void, JobName>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000, attempts: 1 },
    });
  }

  async add(name: JobName, data: JobData, opts: EnqueueOptions = {}): Promise<void> {
    await this.queue.add(name, data, { jobId: opts.jobId, delay: opts.delayMs });
  }

  process(handler: JobHandler): void {
    this.worker = new Worker<JobData, void, JobName>(
      QUEUE_NAME,
      async (job) => handler(job.name, job.data),
      { connection: this.connection.duplicate(), concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => this.logger.error({ err, jobId: job?.id }, 'job failed'));
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.connection.disconnect();
  }
}
