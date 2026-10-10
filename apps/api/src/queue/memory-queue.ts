import type { Logger } from '../lib/logger';
import type { EnqueueOptions, JobData, JobHandler, JobName, JobQueue } from './queue';

interface PendingJob {
  name: JobName;
  data: JobData;
  jobId?: string;
  timer?: NodeJS.Timeout;
}

/**
 * Single-process queue used for local development and tests when REDIS_URL is not set.
 * Jobs are lost on restart; the scheduler's reconciliation sweep re-enqueues stuck orders,
 * and the database state machine (not the queue) is what guarantees exactly-once delivery.
 */
export class InMemoryQueue implements JobQueue {
  readonly kind = 'memory' as const;
  private handler?: JobHandler;
  private readonly pending = new Map<string, PendingJob>();
  private readonly running = new Set<Promise<void>>();
  private seq = 0;
  private closed = false;

  constructor(
    private readonly logger: Logger,
    private readonly opts: { autoRun: boolean } = { autoRun: true },
  ) {}

  async add(name: JobName, data: JobData, opts: EnqueueOptions = {}): Promise<void> {
    if (this.closed) return;
    const key = opts.jobId ?? `auto-${++this.seq}`;
    if (this.pending.has(key)) return; // de-duplicate like BullMQ jobId
    const job: PendingJob = { name, data, jobId: opts.jobId };
    this.pending.set(key, job);
    if (!this.opts.autoRun) return;
    const delay = opts.delayMs ?? 0;
    job.timer = setTimeout(() => this.run(key), delay);
  }

  process(handler: JobHandler): void {
    this.handler = handler;
  }

  /** Number of jobs that have not started yet. */
  size(): number {
    return this.pending.size;
  }

  /** Run every pending job now (ignoring delays) and wait until the queue is idle. Test helper. */
  async drain(maxRounds = 50): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      const keys = [...this.pending.keys()];
      if (keys.length === 0 && this.running.size === 0) return;
      for (const key of keys) {
        const job = this.pending.get(key);
        if (job?.timer) clearTimeout(job.timer);
        this.run(key);
      }
      await Promise.allSettled([...this.running]);
    }
  }

  private run(key: string): void {
    const job = this.pending.get(key);
    if (!job) return;
    this.pending.delete(key);
    if (!this.handler) {
      this.logger.warn({ job: job.name }, 'no queue handler registered; dropping job');
      return;
    }
    const p = this.handler(job.name, job.data)
      .catch((err: unknown) => this.logger.error({ err, job: job.name, data: job.data }, 'job failed'))
      .finally(() => this.running.delete(p));
    this.running.add(p);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.pending.values()) if (job.timer) clearTimeout(job.timer);
    this.pending.clear();
    await Promise.allSettled([...this.running]);
  }
}
