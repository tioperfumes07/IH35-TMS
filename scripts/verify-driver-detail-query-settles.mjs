#!/usr/bin/env node
/**
 * verify-driver-detail-query-settles — LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING residual
 *
 * #8843 fixed the heavy aggregate path. This guard ratchets the FE terminal-state contract:
 * company hydrate before not-found, RQ AbortSignal into getDriver, 15s timeout → ListErrorState.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-driver-detail-query-settles.mjs");
const DETAIL = path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx");
const MDATA = path.join(ROOT, "apps/frontend/src/api/mdata.ts");

function fail(msg) {
  console.error(`FAIL verify-driver-detail-query-settles: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(DETAIL)) fail("missing DriverDetail.tsx");
  if (!fs.existsSync(MDATA)) fail("missing mdata.ts");
  const detail = fs.readFileSync(DETAIL, "utf8");
  const mdata = fs.readFileSync(MDATA, "utf8");

  if (!/isLoading:\s*companyLoading/.test(detail) && !/companyLoading/.test(detail)) {
    fail("DriverDetail must read company context isLoading (companyLoading)");
  }
  if (!/companyLoading && !companyId/.test(detail)) {
    fail("DriverDetail must wait for company hydrate before not-found");
  }
  if (!/Select an operating company to load this driver/.test(detail)) {
    fail("DriverDetail must show explicit company-missing terminal state");
  }
  if (!/queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*getDriver\(id,\s*companyId,\s*signal\)/.test(detail)) {
    fail("DriverDetail driverQuery must pass React Query AbortSignal into getDriver");
  }
  if (!/ListErrorState/.test(detail) || !/driverQuery\.isError/.test(detail)) {
    fail("DriverDetail must render ListErrorState on driverQuery.isError");
  }
  if (!/signal\?:\s*AbortSignal/.test(mdata)) {
    fail("getDriver must accept optional AbortSignal");
  }
  if (!/AbortSignal\.timeout\(15_000\)/.test(mdata) && !/AbortSignal\.timeout\(15000\)/.test(mdata)) {
    fail("getDriver must bound the request with AbortSignal.timeout(15_000)");
  }
  if (!/ApiError\(408/.test(mdata)) {
    fail("getDriver must map AbortError/TimeoutError to ApiError(408) for ListErrorState");
  }
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(DETAIL, "utf8");
  try {
    const planted = backup.replace(
      /queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*getDriver\(id,\s*companyId,\s*signal\)/,
      "queryFn: () => getDriver(id, companyId)"
    );
    if (planted === backup) fail("selftest could not plant missing-signal mutation");
    fs.writeFileSync(DETAIL, planted);
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated DriverDetail (no signal) still passed");
  } finally {
    fs.writeFileSync(DETAIL, backup);
  }
  console.log("PASS: verify-driver-detail-query-settles --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-driver-detail-query-settles");
}
