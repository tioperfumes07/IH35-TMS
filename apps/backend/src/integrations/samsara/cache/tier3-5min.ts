import { type CacheFetchResult, withInMemoryTierCache } from "../../../lib/cache-tiers.js";

type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

/** Tier 3 — 5min cache for vehicle stats and driver clocks (Postgres projection optional). */
export async function fetchTier3FiveMinutes<T>(
  cacheKey: string,
  fetcher: () => Promise<T>
): Promise<CacheFetchResult<T>> {
  return withInMemoryTierCache(3, cacheKey, store, fetcher);
}

export function clearTier3FiveMinutesCache(): void {
  store.clear();
}
