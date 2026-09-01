import type { FastifyReply } from "fastify";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRateLimiterRedis } from "../middleware/rate-limit.js";

/**
 * BULK P0 (owner 2026-09-01) — do NOT use points:1 / duration:5.
 * One bulk call replaces N per-item calls; a 5s lockout on the single call is backwards.
 * Per-item void limits (30/min) still protect the destructive path. This limiter only
 * bounds batch fan-out abuse — aligned with the route's 60/min Fastify rateLimit.
 */
export const BULK_RATE_LIMIT_POINTS = 30;
export const BULK_RATE_LIMIT_DURATION_SEC = 60;
/** @deprecated use BULK_RATE_LIMIT_DURATION_SEC — kept so older tests/guards rename cleanly */
export const BULK_RATE_LIMIT_INTERVAL_SEC = BULK_RATE_LIMIT_DURATION_SEC;
export const BULK_RATE_LIMIT_ERROR = "bulk_rate_limited";

/**
 * Max age for the in-memory inFlight flag. If a batch throws, times out, or the process
 * restarts mid-batch without releaseBulkInFlight, the flag must expire — a permanent lockout
 * is worse than the double-submit problem inFlight prevents.
 */
export const BULK_IN_FLIGHT_MAX_AGE_MS = 120_000;

type InMemoryWindow = {
  lastCallMs: number;
  inFlight: boolean;
  /** When inFlight became true (ms). Used to expire stranded flags. */
  inFlightSinceMs: number;
};

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
    points: BULK_RATE_LIMIT_POINTS,
    duration: BULK_RATE_LIMIT_DURATION_SEC,
  });
  return memoBulkUserLimiter;
}

export function resetBulkRateLimitForTests() {
  inMemoryByUser.clear();
  memoBulkUserLimiter = undefined;
}

/** Test-only: plant a stranded inFlight as-of `sinceMs` (no release). */
export function plantStrandedInFlightForTests(userId: string, sinceMs: number) {
  inMemoryByUser.set(userId, {
    lastCallMs: sinceMs,
    inFlight: true,
    inFlightSinceMs: sinceMs,
  });
}

function sendBulk429(reply: FastifyReply, retryAfterSeconds: number) {
  const secs = Math.max(1, Math.ceil(retryAfterSeconds));
  reply.header("Retry-After", String(secs));
  return reply.code(429).send({
    error: BULK_RATE_LIMIT_ERROR,
    retry_after_seconds: secs,
  });
}

function checkInMemoryBulkRateLimit(
  userId: string,
  nowMs: number,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const entry = inMemoryByUser.get(userId) ?? {
    lastCallMs: 0,
    inFlight: false,
    inFlightSinceMs: 0,
  };

  if (entry.inFlight) {
    const ageMs = nowMs - entry.inFlightSinceMs;
    if (ageMs > BULK_IN_FLIGHT_MAX_AGE_MS) {
      // Stranded flag (throw/timeout/restart without finally) — expire and continue.
      entry.inFlight = false;
      entry.inFlightSinceMs = 0;
    } else {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((BULK_IN_FLIGHT_MAX_AGE_MS - ageMs) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }
  }

  // Soft spacing: allow up to POINTS per DURATION; in-memory approximates with min gap
  // of duration/points so a single user cannot hammer faster than the Redis path.
  const minGapMs = Math.floor((BULK_RATE_LIMIT_DURATION_SEC * 1000) / BULK_RATE_LIMIT_POINTS);
  const elapsedMs = nowMs - entry.lastCallMs;
  if (entry.lastCallMs > 0 && elapsedMs < minGapMs) {
    const retryAfterSeconds = Math.ceil((minGapMs - elapsedMs) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.inFlight = true;
  entry.inFlightSinceMs = nowMs;
  entry.lastCallMs = nowMs;
  inMemoryByUser.set(userId, entry);
  return { allowed: true };
}

export function releaseBulkInFlight(userId: string) {
  const entry = inMemoryByUser.get(userId);
  if (entry) {
    entry.inFlight = false;
    entry.inFlightSinceMs = 0;
  }
}

/** Returns false when a 429 response was already sent. */
export async function enforceBulkRateLimit(userId: string, reply: FastifyReply): Promise<boolean> {
  const limiter = bulkUserLimiter();
  if (limiter) {
    // Redis path: rate-limiter-flexible keys expire with `duration` — no permanent inFlight.
    // A stranded consume is impossible; blocked keys auto-clear after BULK_RATE_LIMIT_DURATION_SEC.
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
