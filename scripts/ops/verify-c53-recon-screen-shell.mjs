#!/usr/bin/env node
/**
 * C-53 — Banking Reconciliation screen shell.
 * Asserts: ReconciliationTabContent mounted, statement object, matched tri-state A-27 pending,
 * SAVE+CLOSE start opener, Home deep-link ?start=1.
 * Self-test: node scripts/ops/verify-c53-recon-screen-shell.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(s) {
  const f = [];
  if (!/ReconciliationTabContent/.test(s.home)) {
    f.push("BankingHome must mount ReconciliationTabContent on reconciliation tab");
  }
  if (!/data-c53-recon-shell/.test(s.shell)) f.push("shell missing data-c53-recon-shell");
  if (!/data-c53-statement-object/.test(s.shell)) f.push("shell missing statement object panel");
  if (!/data-c53-matched-tristate/.test(s.shell)) f.push("shell missing matched tri-state panel");
  if (!/data-c53-a27-pending/.test(s.shell)) f.push("shell must mark A-27 matched wire pending");
  if (!/Matched with difference/.test(s.shell)) {
    f.push("shell must name matched-with-difference (not boolean Yes/No)");
  }
  if (!/data-c53-start-opener/.test(s.shell)) f.push("shell missing SAVE+CLOSE start opener");
  if (!/startReconciliationSession/.test(s.shell)) {
    f.push("shell must call startReconciliationSession (wire existing engine)");
  }
  if (!/Close/.test(s.shell) || !/Create session/.test(s.shell)) {
    f.push("start opener must expose Close + Create session (SAVE+CLOSE)");
  }
  if (!/\?start=1/.test(s.home)) {
    f.push("BankingHome openStartReconciliation must deep-link ?start=1 onto recon shell");
  }
  if (!/banking-recon-never-completed-banner/.test(s.shell)) {
    f.push("shell must keep never-reconciled honesty banner");
  }
  if (!/must reach \$0\.00/.test(s.shell)) {
    f.push("shell must state difference must reach $0.00 to finish");
  }
  return f;
}

const sources = {
  home: read("apps/frontend/src/pages/banking/BankingHome.tsx"),
  shell: read("apps/frontend/src/pages/banking/components/ReconciliationTabContent.tsx"),
};

if (process.argv.includes("--selftest")) {
  const good = { ...sources };
  const bad = { ...sources, shell: sources.shell.replace("data-c53-matched-tristate", "data-c53-matched-bool") };
  const checks = [
    ["good passes", check(good).length === 0],
    ["missing tristate fails", check(bad).some((m) => /tri-state/.test(m))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-c53 --selftest FAIL");
    for (const [n] of failed) console.error(" ✗", n);
    process.exit(1);
  }
  console.log(`verify-c53-recon-screen-shell --selftest PASS (${checks.length})`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error("verify-c53-recon-screen-shell FAILED");
  for (const x of failures) console.error(" ✗", x);
  process.exit(1);
}
console.log("verify-c53-recon-screen-shell OK (recon shell + statement + A-27 pending + SAVE+CLOSE start)");
