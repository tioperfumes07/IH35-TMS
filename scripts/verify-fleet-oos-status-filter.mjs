#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");

function fail(msg) {
  throw new Error(`FAIL: ${msg}`);
}

function assertSource(src) {
  if (!/normalizeFleetStatusParam\(status\)|normalizeFleetStatusParam\(rawStatus\)/.test(src)) {
    fail("must normalize status for OOS matching");
  }
  if (!src.includes("normalizeFleetStatusParam")) fail("missing normalizeFleetStatusParam");
  if (!src.includes("rowMatchesFleetStatus")) fail("missing rowMatchesFleetStatus");
  if (!src.includes('"out-of-service"')) fail("missing out-of-service alias");
  if (!src.includes("OutOfService")) fail("missing OutOfService canonical");
  if (!src.includes("is_oos")) fail("missing is_oos OOS match");
  if (!src.includes("normalizeFleetStatusParam(rawStatus)")) fail("effectiveStatus must normalize rawStatus");
  // LV-FLEET-OOS-FILTER-0-ROWS-8498: kebab deep links must rewrite to canonical enum in the URL.
  if (!src.includes('next.set("status", canonical)') && !src.includes("next.set(\"status\", canonical)")) {
    fail("must canonicalize kebab status deep links into the URL");
  }
  // LV-FLEET-SEARCH-NO-FILTER: page-level search must narrow rows + Showing count.
  if (!src.includes("rosterSearch") || !src.includes("searchedRows")) {
    fail("must keep page-level rosterSearch → searchedRows so Showing X of Y tracks search");
  }
  if (!src.includes('searchParams.get("q")') && !src.includes("searchParams.get('q')")) {
    fail("roster search must bind to ?q= URL for Live/CDP verify");
  }
  if (!src.includes("fleet-roster-search") || !src.includes("fleet-roster-showing-count")) {
    fail("must expose fleet-roster-search + fleet-roster-showing-count for Live VERIFY");
  }
  if (!src.includes("hideSearch")) {
    fail("must pass hideSearch to FleetTable so page owns the single roster search");
  }
  // LV-FLEET-CLEAR-FILTERS-DROPS-Q: Clear filters must delete ?q= with type/kind/status.
  const clearFn = src.match(/const clearFilters = \(\) =>[\s\S]*?return \(/)?.[0] ?? "";
  if (!/params\.delete\(["']q["']\)/.test(clearFn)) {
    fail("clearFilters must params.delete(\"q\") so search does not stick after Clear filters");
  }
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const planted = good.replaceAll("normalizeFleetStatusParam", "X").replaceAll('"out-of-service"', '"gone"');
  let failed = false;
  try {
    assertSource(planted);
  } catch {
    failed = true;
  }
  if (!failed) fail("mutated still passed");
  console.log("PASS: verify-fleet-oos-status-filter --selftest");
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    assertSource(fs.readFileSync(TARGET, "utf8"));
    console.log("PASS: verify-fleet-oos-status-filter");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
