#!/usr/bin/env node
/**
 * verify-fleet-unit-profile-query-settles — LV-fleet-unit-profile-loading-20260819
 *
 * Devin LIVE FAIL: EntityLink → /fleet/units/{uuid} stuck on "Unit Loading…" forever.
 * Root: disabled RQ query stays isPending when companyId missing; hung aggregate never times out.
 * Ratchet: company hydrate before false Loading title; RQ AbortSignal + 15s timeout → ListErrorState.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-fleet-unit-profile-query-settles.mjs");
const PROFILE = path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx");
const LABEL = "verify-fleet-unit-profile-query-settles";

function fail(msg) {
  console.error(`FAIL ${LABEL}: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(PROFILE)) fail("missing VehicleProfilePage.tsx");
  const src = fs.readFileSync(PROFILE, "utf8");

  if (!/isLoading:\s*companyLoading/.test(src)) {
    fail("VehicleProfilePage must read company context isLoading as companyLoading");
  }
  if (!/!companyLoading && !companyId/.test(src)) {
    fail("VehicleProfilePage must wait for company hydrate before company-missing terminal");
  }
  if (!/Select an operating company to load this unit/.test(src)) {
    fail("VehicleProfilePage must show explicit company-missing terminal state");
  }
  if (!/const profileQuery = useQuery\(\{[\s\S]{0,400}?queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/.test(src)) {
    fail("profileQuery must pass React Query AbortSignal into fetchUnitProfile");
  }
  if (!/AbortSignal\.timeout\(15_000\)/.test(src) && !/AbortSignal\.timeout\(15000\)/.test(src)) {
    fail("fetchUnitProfile must bound the request with AbortSignal.timeout(15_000)");
  }
  if (!/ApiError\(408/.test(src)) {
    fail("fetchUnitProfile must map AbortError/TimeoutError to ApiError(408)");
  }
  if (!/ListErrorState/.test(src) || !/profileQuery\.isError/.test(src)) {
    fail("VehicleProfilePage must render ListErrorState on profileQuery.isError");
  }
  if (!/!companyId\s*\?\s*[\s\S]{0,80}?companyLoading[\s\S]{0,80}?profileQuery\.isPending\s*\?\s*["']Loading…["']/.test(src)) {
    fail("title must not use bare profileQuery.isPending while companyId is missing");
  }
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(PROFILE, "utf8");
  try {
    const planted = backup.replace(
      /const profileQuery = useQuery\(\{[\s\S]{0,400}?queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/,
      (m) => m.replace(
        /queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/,
        "queryFn: () => fetchUnitProfile(id, companyId)"
      )
    );
    if (planted === backup) fail("selftest could not plant missing-signal mutation");
    fs.writeFileSync(PROFILE, planted);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated VehicleProfilePage (no signal) still passed");
  } finally {
    fs.writeFileSync(PROFILE, backup);
  }
  console.log(`PASS: ${LABEL} --selftest`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log(`PASS: ${LABEL}`);
}
