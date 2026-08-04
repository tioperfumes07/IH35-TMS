#!/usr/bin/env node
/**
 * LV-002 — USMCA / TMS-only entities must not claim "Cloned from QBO: N" from total_local.
 *
 * FAIL if CustomersSyncPanel (or VendorsSyncPanel) renders "Cloned from QBO: {total_local}"
 * without gating on synced/qbo-sourced counts, or if renderCustomersQboStatusLine is missing.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cust-lv002-qbo-provenance-label";

const CUST = "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx";
const VEND = "apps/frontend/src/pages/vendors/VendorsSyncPanel.tsx";

function audit(src, file) {
  const problems = [];
  if (/Cloned from QBO:\s*\{status\.total_local\}/.test(src)) {
    problems.push(`${file}: claims Cloned from QBO via total_local (LV-002 — use synced / qbo-sourced)`);
  }
  if (!/qboSourced|synced \+ .*drift/.test(src) && !/status\.synced/.test(src)) {
    problems.push(`${file}: must key QBO claim on synced (or qboSourced), not total_local alone`);
  }
  if (!/no QBO provenance/.test(src)) {
    problems.push(`${file}: missing TMS-only / no-QBO-provenance label path`);
  }
  return problems;
}

function selftest() {
  const bad = `Cloned from QBO: {status.total_local}`;
  const good = `
    const qboSourced = status.synced + status.drift_detected;
    if (qboSourced === 0) return "TMS customers: N (no QBO provenance)";
    return "Cloned from QBO: {status.synced}";
  `;
  if (!audit(bad, "bad").length) throw new Error("selftest: bad not caught");
  if (audit(good, "good").length) throw new Error(`selftest: good failed: ${audit(good, "good")}`);
  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = [
    ...audit(readFileSync(join(ROOT, CUST), "utf8"), CUST),
    ...audit(readFileSync(join(ROOT, VEND), "utf8"), VEND),
  ];
  if (!readFileSync(join(ROOT, CUST), "utf8").includes("renderCustomersQboStatusLine")) {
    problems.push(`${CUST}: export renderCustomersQboStatusLine missing (testable LV-002 helper)`);
  }
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — customers+vendors sync banners refuse QBO provenance when synced+drift=0`);
}

main();
