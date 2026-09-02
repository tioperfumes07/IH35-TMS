#!/usr/bin/env node
/**
 * verify-driver-detail-query-settles — LV-COMPLIANCE-FLEET-HOS-DRIVER-DETAIL-INFINITE-LOADING residual
 *
 * #8843 fixed the heavy aggregate path. This guard ratchets the FE terminal-state contract:
 * company hydrate before not-found, RQ AbortSignal into getDriver, 15s timeout → ListErrorState.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DETAIL = path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx");
const MDATA = path.join(ROOT, "apps/frontend/src/api/mdata.ts");

function fail(msg) {
  console.error(`FAIL verify-driver-detail-query-settles: ${msg}`);
  process.exit(1);
}

function analyzeSources({ detail, mdata }) {
  const failures = [];
  const record = (message) => failures.push(message);

  if (!/isLoading:\s*companyLoading/.test(detail) && !/companyLoading/.test(detail)) {
    record("DriverDetail must read company context isLoading (companyLoading)");
  }
  if (!/companyLoading && !companyId/.test(detail)) {
    record("DriverDetail must wait for company hydrate before not-found");
  }
  if (!/Select an operating company to load this driver/.test(detail)) {
    record("DriverDetail must show explicit company-missing terminal state");
  }
  if (!/queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*getDriver\(id,\s*companyId,\s*signal\)/.test(detail)) {
    record("DriverDetail driverQuery must pass React Query AbortSignal into getDriver");
  }
  if (!/ListErrorState/.test(detail) || !/driverQuery\.isError/.test(detail)) {
    record("DriverDetail must render ListErrorState on driverQuery.isError");
  }
  if (!/signal\?:\s*AbortSignal/.test(mdata)) {
    record("getDriver must accept optional AbortSignal");
  }
  if (!/AbortSignal\.timeout\(15_000\)/.test(mdata) && !/AbortSignal\.timeout\(15000\)/.test(mdata)) {
    record("getDriver must bound the request with AbortSignal.timeout(15_000)");
  }
  if (!/ApiError\(408/.test(mdata)) {
    record("getDriver must map AbortError/TimeoutError to ApiError(408) for ListErrorState");
  }
  return failures;
}

function readSources() {
  if (!fs.existsSync(DETAIL)) fail("missing DriverDetail.tsx");
  if (!fs.existsSync(MDATA)) fail("missing mdata.ts");
  return {
    detail: fs.readFileSync(DETAIL, "utf8"),
    mdata: fs.readFileSync(MDATA, "utf8"),
  };
}

function assertSource() {
  const failures = analyzeSources(readSources());
  if (failures.length > 0) fail(failures.join("; "));
}

function selftest() {
  assertSource();
  const source = readSources();
  const planted = source.detail.replace(
    /queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*getDriver\(id,\s*companyId,\s*signal\)/,
    "queryFn: () => getDriver(id, companyId)"
  );
  if (planted === source.detail) fail("selftest could not plant missing-signal mutation");
  const failures = analyzeSources({ ...source, detail: planted });
  if (!failures.some((message) => message.includes("AbortSignal into getDriver"))) {
    fail("mutated DriverDetail (no signal) did not fail the signal assertion");
  }
  console.log("PASS: verify-driver-detail-query-settles --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-driver-detail-query-settles");
}
