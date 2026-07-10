import { TRPCError } from '@trpc/server';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Key prefix to isolate limiters. */
  prefix: string;
};

/**
 * In-memory sliding fixed-window rate limiter for single-tenant public reads.
 * Not distributed — sufficient until Phase 4 auth lockdown.
 */
export function assertRateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  const bucketKey = `${options.prefix}:${key}`;
  const existing = buckets.get(bucketKey);

  if (existing === undefined || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (existing.count >= options.limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded for public reads. Authenticate or retry later.',
    });
  }

  existing.count += 1;
}

/** Test helper — clears all buckets. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}
