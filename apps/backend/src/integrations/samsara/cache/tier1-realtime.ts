import { type CacheFetchResult, withInMemoryTierCache } from "../../../lib/cache-tiers.js";

type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

/** Tier 1 — 5s in-memory cache for HOS clocks and active dispatch alerts. */
export async function fetchTier1Realtime<T>(
  cacheKey: string,
  fetcher: () => Promise<T>
): Promise<CacheFetchResult<T>> {
  return withInMemoryTierCache(1, cacheKey, store, fetcher);
}

export function clearTier1RealtimeCache(): void {
  store.clear();
}
