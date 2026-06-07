import { type CacheFetchResult, withInMemoryTierCache } from "../../../lib/cache-tiers.js";

type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

/** Tier 4 — 15min cache for weekly aggregates and driver scoring pre-computes. */
export async function fetchTier4FifteenMinutes<T>(
  cacheKey: string,
  fetcher: () => Promise<T>
): Promise<CacheFetchResult<T>> {
  return withInMemoryTierCache(4, cacheKey, store, fetcher);
}

export function clearTier4FifteenMinutesCache(): void {
  store.clear();
}
