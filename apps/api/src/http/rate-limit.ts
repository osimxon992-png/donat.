import type { NextFunction, Request, Response } from 'express';
import type IORedis from 'ioredis';
import { tooManyRequests } from '../lib/errors';

export interface RateLimitStore {
  /** Increment the counter for key and return the new count and ms until reset. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      if (this.buckets.size > 50_000) this.sweep(now);
    }
    bucket.count += 1;
    return { count: bucket.count, resetMs: bucket.resetAt - now };
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: IORedis) {}

  async hit(key: string, windowMs: number) {
    const k = `rl:${key}`;
    const results = await this.redis.multi().incr(k).pexpire(k, windowMs, 'NX').pttl(k).exec();
    const count = Number(results?.[0]?.[1] ?? 1);
    const ttl = Number(results?.[2]?.[1] ?? windowMs);
    return { count, resetMs: ttl > 0 ? ttl : windowMs };
  }
}

export function rateLimit(opts: {
  store: RateLimitStore;
  windowMs: number;
  max: number;
  prefix: string;
  key?: (req: Request) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = opts.key?.(req) ?? req.ip ?? 'unknown';
    const { count, resetMs } = await opts.store.hit(`${opts.prefix}:${id}`, opts.windowMs);
    res.setHeader('RateLimit-Limit', String(opts.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, opts.max - count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(resetMs / 1000)));
    if (count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil(resetMs / 1000)));
      return next(tooManyRequests());
    }
    next();
  };
}
