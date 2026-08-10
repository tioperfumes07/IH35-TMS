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

  if (!/kpiReady/.test(home) && !/kpiQuery\.isSuccess/.test(home)) {
    failures.push(`${HOME}: must gate Scheduled / Run-last-7d KPIs on KPI success (no fake 0 while loading)`);
  }
  if (/scheduled \?\? 0/.test(home) || /run_last_7d \?\? 0/.test(home)) {
    // allowed only inside kpiReady ternary value:
    const bad = home.match(/value:\s*String\(kpiQuery\.data\?\.(scheduled|run_last_7d)\s*\?\?\s*0\)/g);
    if (bad && !/kpiReady \? String\(kpiQuery\.data\?\.(scheduled|run_last_7d)/.test(home)) {
      failures.push(`${HOME}: must not render scheduled/run_last_7d as 0 before KPI success`);
    }
  }
  if (!/kpiReady \? String\(kpiQuery\.data\?\.scheduled/.test(home)) {
    failures.push(`${HOME}: Scheduled KPI must use kpiReady ? real count : "—"`);
  }
  if (!/kpiReady \? String\(kpiQuery\.data\?\.run_last_7d/.test(home)) {
    failures.push(`${HOME}: Run last 7 days KPI must use kpiReady ? real count : "—"`);
  }
  if (!/emptyMessage=/.test(subs) || !/No subscriptions found/.test(subs)) {
    failures.push(`${SUBS}: must show honest emptyMessage when zero subscriptions`);
  }
  if (!/rows\.length === 0/.test(panel) || !/No active schedules/.test(panel)) {
    failures.push(`${PANEL}: must show honest empty copy when zero schedules`);
  }
  return failures;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const orig = read(HOME);
    const broken = orig.replace(/kpiReady \? String\(kpiQuery\.data\?\.scheduled/g, "String(kpiQuery.data?.scheduled");
    fs.writeFileSync(path.join(ROOT, HOME), broken);
    let fail;
    try {
      fail = run();
    } finally {
      fs.writeFileSync(path.join(ROOT, HOME), orig);
    }
    if (!fail.length) {
      console.error("SELFTEST FAIL: expected failures");
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
