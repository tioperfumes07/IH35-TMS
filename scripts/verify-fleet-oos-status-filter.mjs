#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const SELF = path.join(ROOT, "scripts/verify-fleet-oos-status-filter.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
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
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const backup = good;
  fs.writeFileSync(
    TARGET,
    good.replaceAll("normalizeFleetStatusParam", "X").replaceAll('"out-of-service"', '"gone"'),
  );
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(TARGET, backup);
  }
  console.log("PASS: verify-fleet-oos-status-filter --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-fleet-oos-status-filter");
}
