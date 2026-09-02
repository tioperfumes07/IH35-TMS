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
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROFILE = path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx");
const LABEL = "verify-fleet-unit-profile-query-settles";

function fail(msg) {
  console.error(`FAIL ${LABEL}: ${msg}`);
  process.exit(1);
}

function sourceProblems(src) {
  const problems = [];

  if (!/isLoading:\s*companyLoading/.test(src)) {
    problems.push("VehicleProfilePage must read company context isLoading as companyLoading");
  }
  if (!/!companyLoading && !companyId/.test(src)) {
    problems.push("VehicleProfilePage must wait for company hydrate before company-missing terminal");
  }
  if (!/Select an operating company to load this unit/.test(src)) {
    problems.push("VehicleProfilePage must show explicit company-missing terminal state");
  }
  if (!/const profileQuery = useQuery\(\{[\s\S]{0,400}?queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/.test(src)) {
    problems.push("profileQuery must pass React Query AbortSignal into fetchUnitProfile");
  }
  if (!/AbortSignal\.timeout\(15_000\)/.test(src) && !/AbortSignal\.timeout\(15000\)/.test(src)) {
    problems.push("fetchUnitProfile must bound the request with AbortSignal.timeout(15_000)");
  }
  if (!/ApiError\(408/.test(src)) {
    problems.push("fetchUnitProfile must map AbortError/TimeoutError to ApiError(408)");
  }
  if (!/ListErrorState/.test(src) || !/profileQuery\.isError/.test(src)) {
    problems.push("VehicleProfilePage must render ListErrorState on profileQuery.isError");
  }
  if (!/!companyId\s*\?\s*[\s\S]{0,80}?companyLoading[\s\S]{0,80}?profileQuery\.isPending\s*\?\s*["']Loading…["']/.test(src)) {
    problems.push("title must not use bare profileQuery.isPending while companyId is missing");
  }
  return problems;
}

function assertSource() {
  if (!fs.existsSync(PROFILE)) fail("missing VehicleProfilePage.tsx");
  const problems = sourceProblems(fs.readFileSync(PROFILE, "utf8"));
  if (problems.length) fail(problems.join("\n  - "));
}

function selftest() {
  assertSource();
  const source = fs.readFileSync(PROFILE, "utf8");
  const planted = source.replace(
    /const profileQuery = useQuery\(\{[\s\S]{0,400}?queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/,
    (match) => match.replace(
      /queryFn:\s*\(\{\s*signal\s*\}\)\s*=>\s*fetchUnitProfile\(id,\s*companyId,\s*signal\)/,
      "queryFn: () => fetchUnitProfile(id, companyId)"
    )
  );
  if (planted === source) fail("selftest could not plant missing-signal mutation");
  const problems = sourceProblems(planted);
  if (!problems.includes("profileQuery must pass React Query AbortSignal into fetchUnitProfile")) {
    fail("mutated VehicleProfilePage (no signal) was not rejected for the intended contract");
  }
  console.log(`PASS: ${LABEL} --selftest`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log(`PASS: ${LABEL}`);
}
