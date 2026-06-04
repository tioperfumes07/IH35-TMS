import type { FastifyReply } from "fastify";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRateLimiterRedis } from "../middleware/rate-limit.js";

export const BULK_RATE_LIMIT_INTERVAL_SEC = 5;
export const BULK_RATE_LIMIT_ERROR = "bulk_rate_limited";

type InMemoryWindow = { lastCallMs: number; inFlight: boolean };

const inMemoryByUser = new Map<string, InMemoryWindow>();

let memoBulkUserLimiter: RateLimiterRedis | null | undefined;

function bulkUserLimiter(): RateLimiterRedis | null {
  if (memoBulkUserLimiter !== undefined) return memoBulkUserLimiter;
  const redis = getRateLimiterRedis();
  if (!redis) {
    memoBulkUserLimiter = null;
    return null;
  }
  memoBulkUserLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "bulk_user_last_call",
    points: 1,
    duration: BULK_RATE_LIMIT_INTERVAL_SEC,
  });
  return memoBulkUserLimiter;
}

export function resetBulkRateLimitForTests() {
  inMemoryByUser.clear();
  memoBulkUserLimiter = undefined;
}

function sendBulk429(reply: FastifyReply, retryAfterSeconds: number) {
  const secs = Math.max(1, Math.ceil(retryAfterSeconds));
  reply.header("Retry-After", String(secs));
  return reply.code(429).send({
    error: BULK_RATE_LIMIT_ERROR,
    retry_after_seconds: secs,
  });
}

function checkInMemoryBulkRateLimit(userId: string, nowMs: number): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const entry = inMemoryByUser.get(userId) ?? { lastCallMs: 0, inFlight: false };
  if (entry.inFlight) {
    return { allowed: false, retryAfterSeconds: BULK_RATE_LIMIT_INTERVAL_SEC };
  }
  const elapsedMs = nowMs - entry.lastCallMs;
  if (entry.lastCallMs > 0 && elapsedMs < BULK_RATE_LIMIT_INTERVAL_SEC * 1000) {
    const retryAfterSeconds = Math.ceil((BULK_RATE_LIMIT_INTERVAL_SEC * 1000 - elapsedMs) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  entry.inFlight = true;
  entry.lastCallMs = nowMs;
  inMemoryByUser.set(userId, entry);
  return { allowed: true };
}

export function releaseBulkInFlight(userId: string) {
  const entry = inMemoryByUser.get(userId);
  if (entry) entry.inFlight = false;
}

/** Returns false when a 429 response was already sent. */
export async function enforceBulkRateLimit(userId: string, reply: FastifyReply): Promise<boolean> {
  const limiter = bulkUserLimiter();
  if (limiter) {
    try {
      await limiter.consume(userId);
      return true;
    } catch (error) {
      const rlRes = error as RateLimiterRes;
      const secs = Math.ceil((rlRes.msBeforeNext ?? 1000) / 1000);
      await sendBulk429(reply, secs);
      return false;
    }
  }

  const verdict = checkInMemoryBulkRateLimit(userId, Date.now());
  if (!verdict.allowed) {
    await sendBulk429(reply, verdict.retryAfterSeconds);
    return false;
  }
  return true;
}
