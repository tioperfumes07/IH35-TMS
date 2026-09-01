#!/usr/bin/env node
/**
 * SETL-SELECTION-BINDING (CASCADE-SELECTION-BINDING-SWEEP-2026-09-01 root cause: zero of 30
 * detail surfaces asserted that the fetched record matches the requested id; in the window
 * between the URL changing and the new query resolving, react-query's `data` still holds the
 * PREVIOUS record and the page rendered it — a transient race that explains why manual
 * reproduction passes are unreliable evidence either way). SettlementDetailPage.tsx is the worst
 * surface: it keys its primary record off a SEARCH PARAM (useSearchParams), not a route param, so
 * an id change does not remount the component, widening the stale window. This guard locks the
 * identity assertion: a fetched settlement whose id does not match the requested settlementId
 * must never reach the real render path.
 *
 *   node scripts/verify-settlement-detail-identity-guard.mjs
 *   node scripts/verify-settlement-detail-identity-guard.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-detail-identity-guard";
const FILE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];

  if (!/detailQuery\.data.*!==.*String\(settlementId\)/.test(src)) {
    errs.push(`${FILE}: must assert detailQuery.data's id matches the requested settlementId before rendering it`);
  }
  // The guard must run BEFORE the main render return, not after — a guard placed after the
  // component has already used `settlement.*` in derived state/JSX defeats the point.
  const guardIdx = src.indexOf("String(settlementId)");
  const mainReturnIdx = src.indexOf('<Breadcrumb\n        items={[\n          { label: "Driver Settlements"');
  if (guardIdx === -1 || mainReturnIdx === -1 || guardIdx > mainReturnIdx) {
    errs.push(`${FILE}: the identity guard must run before the main detail render, not after`);
  }

  return errs;
}

function selftest() {
  const good = read(FILE) ?? "";
  const goodErrs = assertGuard(good);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard(
    good.replace(
      /if \(detailQuery\.data && String\(\(detailQuery\.data as Record<string, unknown>\)\.id \?\? ""\) !== String\(settlementId\)\) \{[\s\S]*?\n {2}\}\n\n {2}return \(/,
      "return ("
    )
  );
  for (const [name, res] of [["bad1-guard-removed", bad1]]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 1/1 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = assertGuard(read(FILE));
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — SettlementDetailPage never renders a fetched settlement whose id does not match the requested settlementId`);
