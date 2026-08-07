/**
 * Pure staleness rules for Scenario Tracker homepage (§8).
 * Never treat old payload as current when heartbeat fails.
 */
export type SourceHealth = { source: string; ok: boolean; probed_at_ct?: string };

export type StalenessInput = {
  nowMs: number;
  generatedAtUtc: string | null | undefined;
  maxAgeSeconds: number;
  fetchFailed: boolean;
  sourceHealth: SourceHealth[] | null | undefined;
};

export type StalenessResult =
  | { stale: false }
  | { stale: true; banner: string; ageSeconds: number | null; failedSources: string[] };

export function evaluateScenarioTrackerStaleness(input: StalenessInput): StalenessResult {
  const maxAge = Number.isFinite(input.maxAgeSeconds) && input.maxAgeSeconds > 0 ? input.maxAgeSeconds : 20;
  const failedSources = (input.sourceHealth ?? []).filter((s) => !s.ok).map((s) => s.source);

  if (input.fetchFailed) {
    return {
      stale: true,
      banner: "STALE — scenario-tracker unreachable (fetch failed)",
      ageSeconds: null,
      failedSources,
    };
  }

  if (!input.generatedAtUtc) {
    return {
      stale: true,
      banner: "STALE — response missing generated_at",
      ageSeconds: null,
      failedSources,
    };
  }

  const generatedMs = Date.parse(input.generatedAtUtc);
  if (!Number.isFinite(generatedMs)) {
    return {
      stale: true,
      banner: "STALE — generated_at is not a valid timestamp",
      ageSeconds: null,
      failedSources,
    };
  }

  const ageSeconds = Math.max(0, (input.nowMs - generatedMs) / 1000);
  if (ageSeconds > 2 * maxAge) {
    const mins = Math.max(1, Math.round(ageSeconds / 60));
    return {
      stale: true,
      banner: `STALE — data is ${mins} min old`,
      ageSeconds,
      failedSources,
    };
  }

  if (failedSources.length > 0) {
    return {
      stale: true,
      banner: `STALE — source ${failedSources[0]} unreachable`,
      ageSeconds,
      failedSources,
    };
  }

  return { stale: false };
}

export function formatLiveAsOfCt(generatedAtCt: string | null | undefined): string {
  if (!generatedAtCt) return "Live as of —";
  // Prefer "Live as of 3:42 PM CT" from America/Chicago stamp.
  // Accept "2026-08-04 15:42:11 America/Chicago" or already-pretty strings.
  const m = generatedAtCt.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/);
  if (!m) {
    if (/CT|Central/i.test(generatedAtCt)) return `Live as of ${generatedAtCt}`;
    return `Live as of ${generatedAtCt} CT`;
  }
  const hour = Number(m[2]);
  const minute = m[3];
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `Live as of ${h12}:${minute} ${ampm} CT`;
}
