import { resolveApiUrl } from "../api/client";

type FlagCheckResponse = { flag_key: string; enabled: boolean };

type FlagRecord = {
  flag_key: string;
  description: string | null;
  default_enabled: boolean;
  rollout_pct: number;
  override_count?: number;
};

type OverrideRecord = {
  uuid: string;
  flag_key: string;
  operating_company_id: string | null;
  user_uuid: string | null;
  enabled: boolean;
};

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { enabled: boolean; expiresAt: number }>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(flagKey: string, enabled: boolean) => void>();

function cacheKey(flagKey: string, operatingCompanyId?: string | null) {
  return `${flagKey}:${operatingCompanyId ?? "global"}`;
}

export async function fetchFeatureFlag(
  flagKey: string,
  operatingCompanyId?: string | null
): Promise<boolean> {
  const params = new URLSearchParams({ key: flagKey });
  if (operatingCompanyId) params.set("operating_company_id", operatingCompanyId);
  const res = await fetch(resolveApiUrl(`/api/feature-flags/check?${params.toString()}`), { credentials: "include" });
  if (!res.ok) throw new Error(`feature_flag_check_failed:${res.status}`);
  const payload = (await res.json()) as FlagCheckResponse;
  return Boolean(payload.enabled);
}

export async function refreshFeatureFlag(
  flagKey: string,
  operatingCompanyId?: string | null
): Promise<boolean> {
  const enabled = await fetchFeatureFlag(flagKey, operatingCompanyId);
  cache.set(cacheKey(flagKey, operatingCompanyId), { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  for (const listener of listeners) listener(flagKey, enabled);
  return enabled;
}

export function getCachedFeatureFlag(flagKey: string, operatingCompanyId?: string | null): boolean | null {
  const hit = cache.get(cacheKey(flagKey, operatingCompanyId));
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.enabled;
}

export function subscribeFeatureFlag(listener: (flagKey: string, enabled: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startFeatureFlagRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    for (const key of cache.keys()) {
      const [flagKey, companyPart] = key.split(":");
      const operatingCompanyId = companyPart === "global" ? null : companyPart;
      void refreshFeatureFlag(flagKey, operatingCompanyId).catch(() => undefined);
    }
  }, CACHE_TTL_MS);
}

export function stopFeatureFlagRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export async function fetchAllFeatureFlags(): Promise<{ flags: FlagRecord[]; overrides: OverrideRecord[] }> {
  const res = await fetch(resolveApiUrl("/api/feature-flags"), { credentials: "include" });
  if (!res.ok) throw new Error(`feature_flags_list_failed:${res.status}`);
  return res.json();
}

export async function createFeatureFlag(body: {
  flag_key: string;
  description?: string;
  default_enabled?: boolean;
  rollout_pct?: number;
}) {
  const res = await fetch(resolveApiUrl("/api/feature-flags"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `create_flag_failed:${res.status}`);
  return payload;
}

export async function updateFeatureFlag(
  flagKey: string,
  body: { description?: string; default_enabled?: boolean; rollout_pct?: number }
) {
  const res = await fetch(resolveApiUrl(`/api/feature-flags/${encodeURIComponent(flagKey)}`), {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `update_flag_failed:${res.status}`);
  return payload;
}

export async function setFeatureFlagOverride(body: {
  flag_key: string;
  operating_company_id?: string;
  user_uuid?: string;
  enabled: boolean;
  expires_at?: string;
}) {
  const res = await fetch(resolveApiUrl("/api/feature-flags/overrides"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `set_override_failed:${res.status}`);
  return payload;
}

export async function deleteFeatureFlagOverride(uuid: string) {
  const res = await fetch(resolveApiUrl(`/api/feature-flags/overrides/${encodeURIComponent(uuid)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const payload = await res.json();
    throw new Error(payload.error ?? `delete_override_failed:${res.status}`);
  }
  return res.json();
}
