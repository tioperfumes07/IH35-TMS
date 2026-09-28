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
export const ALLOW_OFFLINE_SKIP =
  "live network health check (real geocode API call, no DATABASE_URL involved) -- honors SKIP_LIVE_NETWORK_CHECKS=true for environments with no provider credentials configured, same declared pattern verify-no-silent-db-skip.mjs requires.";

import { register } from "tsx/esm/api";
register();

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

function selftest() {
  // Pure config-shape check -- the real network call is exercised in main() only, matching the
  // house pattern (verify-no-duplicate-non-owned-trailer.mjs etc.) of a fast selftest plus a live
  // check gated behind DATABASE_URL/network access.
  console.log(`${LABEL} selftest OK — no pure logic to unit test (this guard is a live network health check by design)`);
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
