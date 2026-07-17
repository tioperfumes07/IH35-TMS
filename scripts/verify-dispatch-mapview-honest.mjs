#!/usr/bin/env node
/**
 * verify-dispatch-mapview-honest.mjs (0441-mod4)
 *
 * Dispatch MapView must never render fake map pins or hardcoded lat/lng fixtures in the
 * production render path. Until a real map SDK is wired, the page shows an honest
 * "map provider not configured" state and still consumes driver/load deep-link query params.
 *
 * Usage:
 *   node scripts/verify-dispatch-mapview-honest.mjs
 *   node scripts/verify-dispatch-mapview-honest.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const MAP_VIEW = "apps/frontend/src/pages/dispatch/MapView.tsx";
const MAP_PROVIDER = "apps/frontend/src/lib/dispatch-map-provider.ts";
const LABEL = "verify-dispatch-mapview-honest";

function read(relativePath) {
  const full = path.join(repoRoot, relativePath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function assertHonestMapView(sources) {
  const failures = [];
  const mapView = stripComments(sources.mapView ?? "");
  const mapProvider = stripComments(sources.mapProvider ?? "");

  if (!mapView) {
    failures.push(`${MAP_VIEW} — MISSING`);
    return failures;
  }
  if (!mapProvider) {
    failures.push(`${MAP_PROVIDER} — MISSING`);
    return failures;
  }

  // Honest not-configured marker (never a blank wall or fake map chrome).
  if (!/data-testid=["']dispatch-map-not-configured["']/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must render data-testid="dispatch-map-not-configured" when provider is off`);
  }
  if (!/data-dispatch-map-honest-empty=["']true["']/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must mark honest empty state with data-dispatch-map-honest-empty="true"`);
  }
  if (!/map provider not configured/i.test(mapView)) {
    failures.push(`${MAP_VIEW}: operator copy must state map provider is not configured`);
  }

  // Deep-link focus must remain wired (driver-profile / load live GPS links).
  if (!/searchParams\.get\(["']driver["']\)/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must consume ?driver= query for deep-link focus`);
  }
  if (!/searchParams\.get\(["']load_id["']\)/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must consume ?load_id= query for deep-link focus`);
  }
  if (!/p\.driver_uuid === focusDriverId/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must match positions to focused driver`);
  }

  // Forbidden: fake pin grid / coordinate cards that imply a live map.
  if (/pinColor\b/.test(mapView)) {
    failures.push(`${MAP_VIEW}: fake pinColor styling helper must be removed`);
  }
  if (/\.toFixed\(4\)/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must not render raw lat/lng coordinate cards (fake map pins)`);
  }
  if (/grid.*map\(\(p\)/.test(mapView.replace(/\s+/g, " "))) {
    failures.push(`${MAP_VIEW}: must not render position buttons in a fake pin grid`);
  }

  // Forbidden: hardcoded GPS fixture literals in the production render path.
  const hardcodedCoord = /(?:lat|lng)\s*:\s*-?\d+\.\d{3,}/.test(mapView);
  if (hardcodedCoord) {
    failures.push(`${MAP_VIEW}: hardcoded lat/lng fixture literals forbidden in production path`);
  }

  // Provider gate must exist and default to unwired until SDK ships.
  if (!/DISPATCH_MAP_PROVIDER_WIRED\s*=\s*false/.test(mapProvider)) {
    failures.push(`${MAP_PROVIDER}: DISPATCH_MAP_PROVIDER_WIRED must default false until map SDK is wired`);
  }
  if (!/isDispatchMapProviderConfigured/.test(mapView)) {
    failures.push(`${MAP_VIEW}: must gate rendering through isDispatchMapProviderConfigured()`);
  }

  return failures;
}

export function run() {
  const failures = assertHonestMapView({
    mapView: read(MAP_VIEW),
    mapProvider: read(MAP_PROVIDER),
  });
  if (failures.length) {
    console.error(`[${LABEL}] FAIL — Dispatch MapView is not honest:`);
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[${LABEL}] PASS — Dispatch MapView shows honest not-configured state (no fake pins)`);
  return { ok: true, offenders: [] };
}

function selftest() {
  const good = {
    mapView: `
      const focusDriverId = searchParams.get("driver");
      const focusLoadId = searchParams.get("load_id");
      const mapConfigured = isDispatchMapProviderConfigured();
      positions.filter((p) => p.driver_uuid === focusDriverId);
      {!mapConfigured ? (
        <section data-testid="dispatch-map-not-configured" data-dispatch-map-honest-empty="true">
          <h2>Map provider not configured</h2>
        </section>
      ) : null}
    `,
    mapProvider: "export const DISPATCH_MAP_PROVIDER_WIRED = false;",
  };
  const goodFailures = assertHonestMapView(good);
  if (goodFailures.length) {
    console.error(`[${LABEL}] --selftest FAIL: good fixture rejected`, goodFailures);
    process.exit(1);
  }

  const bad = {
    ...good,
    mapView: `
      function pinColor() {}
      positions.map((p) => <button>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</button>)
    `,
  };
  const badFailures = assertHonestMapView(bad);
  if (badFailures.length < 2) {
    console.error(`[${LABEL}] --selftest FAIL: bad fixture should fail multiple checks`, badFailures);
    process.exit(1);
  }

  console.log(`[${LABEL}] --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  process.exit(result.ok ? 0 : 1);
}
