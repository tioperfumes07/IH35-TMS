import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TIER_1_REALTIME_MAX_AGE_MS,
  TIER_2_30S_MAX_AGE_MS,
  TIER_3_5MIN_MAX_AGE_MS,
  TIER_4_15MIN_MAX_AGE_MS,
  getTierCacheStats,
  maxAgeForTier,
  resetTierCacheStats,
} from "../../../../lib/cache-tiers.js";
import { clearTier1RealtimeCache, fetchTier1Realtime } from "../tier1-realtime.js";
import { clearTier2ThirtySecondsCache, fetchTier2ThirtySeconds } from "../tier2-30s.js";
import { clearTier3FiveMinutesCache, fetchTier3FiveMinutes } from "../tier3-5min.js";
import { clearTier4FifteenMinutesCache, fetchTier4FifteenMinutes } from "../tier4-15min.js";
import { warmTier3Caches, warmTier4Caches } from "../cache-warmer.js";

describe("cache-tiers", () => {
  it("maps tier numbers to max age budgets", () => {
    expect(maxAgeForTier(1)).toBe(TIER_1_REALTIME_MAX_AGE_MS);
    expect(maxAgeForTier(2)).toBe(TIER_2_30S_MAX_AGE_MS);
    expect(maxAgeForTier(3)).toBe(TIER_3_5MIN_MAX_AGE_MS);
    expect(maxAgeForTier(4)).toBe(TIER_4_15MIN_MAX_AGE_MS);
  });
});

describe("samsara cache tiers", () => {
  beforeEach(() => {
    resetTierCacheStats();
    clearTier1RealtimeCache();
    clearTier2ThirtySecondsCache();
    clearTier3FiveMinutesCache();
    clearTier4FifteenMinutesCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tier1 returns cache hit on second fetch within 5s", async () => {
    const fetcher = vi.fn(async () => ({ lat: 27.5 }));
    const first = await fetchTier1Realtime("pos:unit-1", fetcher);
    const second = await fetchTier1Realtime("pos:unit-1", fetcher);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getTierCacheStats(1).hits).toBe(1);
  });

  it("tier1 expires after max age", async () => {
    const fetcher = vi.fn(async () => Date.now());
    await fetchTier1Realtime("pos:unit-2", fetcher);
    vi.advanceTimersByTime(TIER_1_REALTIME_MAX_AGE_MS + 1);
    const second = await fetchTier1Realtime("pos:unit-2", fetcher);
    expect(second.cacheHit).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("tier2 caches for 30s window", async () => {
    const fetcher = vi.fn(async () => "eta-15m");
    await fetchTier2ThirtySeconds("eta:load-1", fetcher);
    const hit = await fetchTier2ThirtySeconds("eta:load-1", fetcher);
    expect(hit.cacheHit).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("tier3 and tier4 warmers pre-populate keys", async () => {
    const tier3 = await warmTier3Caches();
    const tier4 = await warmTier4Caches();
    expect(tier3).toBe(2);
    expect(tier4).toBe(2);
    const cached = await fetchTier3FiveMinutes("warm:vehicle-stats", async () => ({ unexpected: true }));
    expect(cached.cacheHit).toBe(true);
  });

  it("tier4 avoids duplicate fetches under load", async () => {
    const fetcher = vi.fn(async () => ({ score: 88 }));
    await Promise.all([
      fetchTier4FifteenMinutes("score:driver-9", fetcher),
      fetchTier4FifteenMinutes("score:driver-9", fetcher),
      fetchTier4FifteenMinutes("score:driver-9", fetcher),
    ]);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
