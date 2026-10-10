import type { Container } from './container';

interface Task {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

/**
 * Periodic safety nets. Each task is idempotent and guarded against overlapping runs.
 * In a multi-instance deployment run the scheduler in exactly one process
 * (set SCHEDULER_ENABLED=false on the others).
 */
export function startScheduler(c: Container) {
  const tasks: Task[] = [
    { name: 'reconcile-payments', everyMs: 60_000, run: () => c.payments.reconcilePendingPayments() },
    { name: 'expire-unpaid-orders', everyMs: 60_000, run: () => c.payments.expireUnpaidOrders() },
    { name: 'sweep-stuck-orders', everyMs: 120_000, run: () => c.reconciliation.sweepStuckOrders() },
    { name: 'retry-pending-refunds', everyMs: 300_000, run: () => c.refunds.retryPendingRefunds() },
    { name: 'provider-health', everyMs: 300_000, run: () => c.providers.checkAllEnabled() },
  ];
  const running = new Set<string>();
  const timers = tasks.map((t) =>
    setInterval(async () => {
      if (running.has(t.name)) return;
      running.add(t.name);
      try {
        await t.run();
      } catch (err) {
        c.logger.error({ err, task: t.name }, 'scheduled task failed');
      } finally {
        running.delete(t.name);
      }
    }, t.everyMs),
  );
  // Run a health check shortly after boot so the admin dashboard has data.
  const boot = setTimeout(() => void c.providers.checkAllEnabled().catch(() => undefined), 3_000);
  return () => {
    clearTimeout(boot);
    timers.forEach(clearInterval);
  };
}
