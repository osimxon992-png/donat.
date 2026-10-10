export type JobName = 'fulfill-order' | 'reconcile-order';

export interface JobData {
  orderId: string;
}

export interface EnqueueOptions {
  /** De-duplication key: a job with the same id that is still pending is not enqueued twice. */
  jobId?: string;
  delayMs?: number;
}

export type JobHandler = (name: JobName, data: JobData) => Promise<void>;

export interface JobQueue {
  readonly kind: 'memory' | 'bullmq';
  add(name: JobName, data: JobData, opts?: EnqueueOptions): Promise<void>;
  /** Register the worker handler. In split deployments only the worker process calls this. */
  process(handler: JobHandler): void;
  close(): Promise<void>;
}
