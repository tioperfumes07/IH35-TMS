/**
 * GAP-23: 4-tier Samsara cache freshness budgets.
 * @see docs/specs/gap-23-samsara-cache-tiers.md
 */

export const TIER_1_REALTIME_MAX_AGE_MS = 5_000;
export const TIER_2_30S_MAX_AGE_MS = 30_000;
export const TIER_3_5MIN_MAX_AGE_MS = 300_000;
export const TIER_4_15MIN_MAX_AGE_MS = 900_000;

export type CacheTier = 1 | 2 | 3 | 4;

export type CacheFetchResult<T> = {
  value: T;
  cacheHit: boolean;
  tier: CacheTier;
  maxAgeMs: number;
};

export function maxAgeForTier(tier: CacheTier): number {
  switch (tier) {
    case 1:
      return TIER_1_REALTIME_MAX_AGE_MS;
    case 2:
      return TIER_2_30S_MAX_AGE_MS;
    case 3:
      return TIER_3_5MIN_MAX_AGE_MS;
    case 4:
      return TIER_4_15MIN_MAX_AGE_MS;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export type TierCacheStats = {
  hits: number;
  misses: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const tierStats = new Map<CacheTier, TierCacheStats>();

function statsFor(tier: CacheTier): TierCacheStats {
  const existing = tierStats.get(tier);
  if (existing) return existing;
  const created = { hits: 0, misses: 0 };
  tierStats.set(tier, created);
  return created;
}

export function getTierCacheStats(tier: CacheTier): TierCacheStats {
  return { ...statsFor(tier) };
}

export function resetTierCacheStats(): void {
  tierStats.clear();
}

export async function withInMemoryTierCache<T>(
  tier: CacheTier,
  cacheKey: string,
  store: Map<string, CacheEntry<unknown>>,
  fetcher: () => Promise<T>
): Promise<CacheFetchResult<T>> {
  const maxAgeMs = maxAgeForTier(tier);
  const now = Date.now();
  const stats = statsFor(tier);
  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    stats.hits += 1;
    return { value: hit.value as T, cacheHit: true, tier, maxAgeMs };
  }
  stats.misses += 1;
  const value = await fetcher();
  store.set(cacheKey, { value, expiresAt: now + maxAgeMs });
  return { value, cacheHit: false, tier, maxAgeMs };
}
