#!/usr/bin/env node
// verify-bank-automatch-observable (P2-BANK-AUTOMATCH)
// The nightly bank-recon auto-match tick must NOT silently discard its auto-matched metric (it used to do
// `void { ...auto_matched }`, so even an enabled run left no observable count). Asserts the tick returns a
// summary and logs it, and no longer void-discards the metric. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRON = "apps/backend/src/cron/bank-recon-auto-match.cron.ts";

export function check(src) {
  const failures = [];
  if (/void\s*\{[^}]*auto_matched/.test(src)) {
    failures.push("the auto-matched metric is void-discarded — surface it (log/return), never `void {...auto_matched}`");
  }
  if (!/return\s+summary|BankReconAutoMatchSummary/.test(src)) {
    failures.push("runBankReconAutoMatchTick must return an observable summary (companies/scanned/autoMatched)");
  }
  if (!/tick summary/.test(src)) {
    failures.push("the tick must log a summary each run so an enabled run is observable");
  }
  return failures;
}

export function run() {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, CRON), "utf8"); } catch { return [`${CRON} not found`]; }
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const good = `export type BankReconAutoMatchSummary = {}; async function t(){ totalAutoMatched+=n; const summary = {}; log?.info?.(summary,"tick summary"); return summary; }`;
  const bad = `async function t(){ void { operating_company_id: c, auto_matched: n }; }`;
  const checks = [
    ["observable tick passes", check(good).length === 0],
    ["void-discard tick is caught", check(bad).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bank-automatch-observable --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bank-automatch-observable --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:bank-automatch-observable FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:bank-automatch-observable PASS (auto-match metric is surfaced, not discarded)");
}
