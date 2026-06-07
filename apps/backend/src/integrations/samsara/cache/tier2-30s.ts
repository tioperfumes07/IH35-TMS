import { createResilientRedis } from "../../../lib/redis.client.js";
import { type CacheFetchResult, TIER_2_30S_MAX_AGE_MS, withInMemoryTierCache } from "../../../lib/cache-tiers.js";

type CacheEntry<T> = { value: T; expiresAt: number };
const memoryStore = new Map<string, CacheEntry<unknown>>();

let redisClient: ReturnType<typeof createResilientRedis> | null = null;

function getRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!redisClient) redisClient = createResilientRedis(url);
  return redisClient;
}

/** Tier 2 — 30s cache with optional Redis backing for GPS positions and ETA. */
export async function fetchTier2ThirtySeconds<T>(
  cacheKey: string,
  fetcher: () => Promise<T>
): Promise<CacheFetchResult<T>> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`samsara:tier2:${cacheKey}`);
      if (raw) {
        return {
          value: JSON.parse(raw) as T,
          cacheHit: true,
          tier: 2,
          maxAgeMs: TIER_2_30S_MAX_AGE_MS,
        };
      }
    } catch {
      // fall through to memory tier
    }
  }

  const result = await withInMemoryTierCache(2, cacheKey, memoryStore, fetcher);
  if (redis && !result.cacheHit) {
    try {
      await redis.setex(`samsara:tier2:${cacheKey}`, Math.ceil(TIER_2_30S_MAX_AGE_MS / 1000), JSON.stringify(result.value));
    } catch {
      // memory result still valid
    }
  }
  return result;
}

export function clearTier2ThirtySecondsCache(): void {
  memoryStore.clear();
}
