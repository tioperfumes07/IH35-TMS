#!/usr/bin/env node
/**
 * RPT-S06 — Scheduled reports count honest when zero.
 * No fabricated 0 while KPI is loading; empty panels tell the truth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const HOME = "apps/frontend/src/pages/reports/ReportsHome.tsx";
const SUBS = "apps/frontend/src/pages/reports/SubscriptionManager.tsx";
const PANEL = "apps/frontend/src/pages/reports/ScheduledReportsPanel.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function run() {
  const failures = [];
  for (const f of [HOME, SUBS, PANEL]) {
    if (!fs.existsSync(path.join(ROOT, f))) failures.push(`MISSING: ${f}`);
  }
  if (failures.length) return failures;

  const home = read(HOME);
  const subs = read(SUBS);
  const panel = read(PANEL);

  // ReportsHome was redesigned (443.267): KPI count tiles for scheduled/run_last_7d moved to
  // ScheduledReportsPanel. Guard only fires if HOME still renders those counts ungated.
  if (/kpiQuery\.data\?\.(scheduled|run_last_7d)\s*\?\?\s*0/.test(home) && !/kpiReady/.test(home)) {
    failures.push(`${HOME}: must not render scheduled/run_last_7d as 0 before KPI success (gate on kpiReady)`);
  }
  // LEAD 443.181: the table is ParityTable now (emptyText=); MobileOptimizedTable used emptyMessage=.
  if (!/(?:emptyMessage|emptyText)=/.test(subs) || !/No subscriptions found/.test(subs)) {
    failures.push(`${SUBS}: must show honest emptyMessage when zero subscriptions`);
  }
  // Real copy is "No custom schedules — add daily dispatch board or AR aging." — still an
  // honest, non-fabricated zero-row message, just more specific than a bare "No active schedules".
  if (!/rows\.length === 0/.test(panel) || (!/No active schedules/.test(panel) && !/No custom schedules/.test(panel))) {
    failures.push(`${PANEL}: must show honest empty copy when zero schedules`);
  }
  return failures;
}

function main() {
  if (process.argv.includes("--selftest")) {
    // Verify clean sources pass first.
    const clean = run();
    if (clean.length) {
      console.error("SELFTEST FAIL: clean sources should pass:", clean);
      process.exit(1);
    }
    // Plant: HOME renders scheduled count as 0 without kpiReady gating → must fail.
    const orig = read(HOME);
    const planted = orig + "\nconst _x = kpiQuery.data?.scheduled ?? 0;\n";
    fs.writeFileSync(path.join(ROOT, HOME), planted);
    let fail;
    try {
      fail = run();
    } finally {
      fs.writeFileSync(path.join(ROOT, HOME), orig);
    }
    if (!fail.length) {
      console.error("SELFTEST FAIL: ungated scheduled ?? 0 in HOME should fail");
      process.exit(1);
    }
    console.log("SELFTEST OK");
    return;
  }
  const failures = run();
  if (failures.length) {
    console.error("FAIL RPT-S06:");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log("PASS RPT-S06 — scheduled zero honesty ratcheted");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
