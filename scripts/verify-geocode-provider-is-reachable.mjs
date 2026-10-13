#!/usr/bin/env node
// ROUND 168 (owner P0, retraction of the earlier Samsara diagnosis, 2026-09-28): "THE BREAK IS
// GEOCODING." Live-confirmed: 179 of 179 non-null geocode_failure_reason rows across ALL 381 USMCA
// stops read the EXACT same string, "provider_unavailable" -- zero rows show any other failure
// shape (an actual HTTP error from the provider would read e.g. "google_places_http_403" or
// "trimble_xxx", per stableProviderFailureReason in stop-geocode-fallback.service.ts). That is not
// a billing lapse or a quota exhaustion -- both of those produce a DIFFERENT, specific reason
// string. "provider_unavailable" is produced in exactly two places, both meaning "no provider is
// even configured/enabled at all" (activeGeocodeProvider() returned null: neither
// isPcmilerEnabled()+isTrimbleConfigured() nor isGooglePlacesEnabled()+isGooglePlacesConfigured()).
// This guard is the permanent health check: it calls the SAME geocode path a real stop would use,
// against a known-good, stable US address, so "provider_unavailable" (or any other failure) raises
// loudly here instead of silently producing hundreds of uncoordinated stops again.
// A live-provider check, not a static one: the no-DB static sweep makes no network calls and holds no provider key, so it
// is EXCLUDED there by declaration (printed with this reason) and still runs for real in the gate / CI (CC-2 2026-10-04).
export const REQUIRES_LIVE_DB =
  "live network: geocodes a known address against the configured provider (Google Places / Trimble PC*MILER); the static sweep makes no network calls and holds no provider key";
export const ALLOW_OFFLINE_SKIP =
  "live network health check (real geocode API call, no DATABASE_URL involved) -- honors SKIP_LIVE_NETWORK_CHECKS=true for environments with no provider credentials configured, same declared pattern verify-no-silent-db-skip.mjs requires.";


const LABEL = "verify-geocode-provider-is-reachable";

// A stable, well-known US address that will resolve on any real geocoder -- never a load's own
// address, so this guard never depends on live dispatch data.
const KNOWN_GOOD_ADDRESS = {
  address_line1: "1600 Pennsylvania Avenue NW",
  city: "Washington",
  state: "DC",
  postal_code: "20500",
  country: "US",
};

/**
 * 443.102 (LEAD ruling 4): the provider key lives only in the Render environment, so the real check runs
 * INSIDE the deployed app (GET /api/v1/healthz/geocode, apps/backend/src/health/geocode-health.ts) and this
 * guard reads it post-deploy from the job that can reach it (.github/workflows/deploy-parity-monitor.yml,
 * GEOCODE_HEALTH_URL). Without GEOCODE_HEALTH_URL it still geocodes in-process (a machine that holds the key).
 */
export function classifyDeployedProbe(status, body) {
  if (status === 404) return { ok: false, why: "probe endpoint missing (deployed app predates /api/v1/healthz/geocode)" };
  if (!body || typeof body !== "object") return { ok: false, why: `unreadable probe response (HTTP ${status})` };
  if (body.ok === true && status === 200 && body.source) return { ok: true, why: `${body.source} geocoded the fixed address (precision=${body.precision ?? "?"}, checked ${body.checked_at})` };
  return { ok: false, why: `deployed geocode probe failed: reason=${body.reason ?? "unknown"} (HTTP ${status})` };
}

function selftest() {
  let bad = 0;
  const ex = (n, c) => { if (!c) { console.error(`${LABEL} selftest FAIL: ${n}`); bad += 1; } };
  ex("healthy probe passes", classifyDeployedProbe(200, { ok: true, source: "google", precision: "range", checked_at: "t" }).ok === true);
  ex("provider_unavailable fails", classifyDeployedProbe(503, { ok: false, reason: "provider_unavailable" }).ok === false);
  ex("ok:true without a provider source fails", classifyDeployedProbe(200, { ok: true, source: null }).ok === false);
  ex("ok:true on a non-200 fails", classifyDeployedProbe(503, { ok: true, source: "google" }).ok === false);
  ex("missing endpoint fails (never a pass)", classifyDeployedProbe(404, null).ok === false);
  ex("unreadable body fails", classifyDeployedProbe(200, null).ok === false);
  if (bad) process.exit(1);
  console.log(`${LABEL} selftest OK — 6/6 deployed-probe verdicts`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (process.env.SKIP_LIVE_NETWORK_CHECKS === "true") {
    console.log(`${LABEL}: SKIP — SKIP_LIVE_NETWORK_CHECKS=true (live-network invariant by design).`);
    process.exit(0);
  }
  const url = (process.env.GEOCODE_HEALTH_URL || "").trim();
  if (url) {
    let status = 0, body = null;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (err) {
      console.error(`${LABEL}: FAIL — could not reach ${url}: ${err.message}`);
      process.exit(1);
    }
    const v = classifyDeployedProbe(status, body);
    if (!v.ok) { console.error(`${LABEL}: FAIL — ${v.why}`); process.exit(1); }
    console.log(`${LABEL}: PASS — deployed app: ${v.why}`);
    process.exit(0);
  }
  // In-process mode only: tsx is loaded here so the deployed-probe mode (post-deploy job, no npm ci) needs no deps.
  const { register } = await import("tsx/esm/api");
  register();
  const { geocodeAddressWithEvidence } = await import("../apps/backend/src/telematics/stop-geocode-fallback.service.ts");
  const outcome = await geocodeAddressWithEvidence(KNOWN_GOOD_ADDRESS);
  if (!outcome.ok) {
    console.error(`${LABEL}: FAIL — geocoding a known-good US address failed: reason=${outcome.reason}`);
    if (outcome.reason === "provider_unavailable") {
      console.error(`  This means no geocode provider is configured/enabled at all — check GOOGLE_PLACES_ENABLED/GOOGLE_PLACES_API_KEY and/or the Trimble PC*MILER equivalent in the Render environment.`);
    }
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — ${outcome.source} returned lat=${outcome.latitude}, lng=${outcome.longitude}, precision=${outcome.precision}.`);
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL — ${err.message}`);
  process.exit(1);
});
