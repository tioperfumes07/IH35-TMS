#!/usr/bin/env node
// FINANCE-TABS-OVERFLOW-HIDDEN-UNREACHABLE -- guard
//
// FinanceModuleTabs.tsx's tab <nav> is additive-only by design (each new flag-gated tab is appended,
// never reordered) with no wrap/scroll of its own. Once enough tabs are enabled at once -- verified
// live: base 6 + break-even + loan-wizard + calculator + amortization = 10 tabs, content width 993px
// vs container 852px on a common laptop viewport -- the trailing tab(s) overflow past the page shell's
// overflow-x: hidden clip boundary with no scrollbar, no wrap, and no visual sign anything is missing.
// Confirmed: "Amortization" was flag-enabled, its route fully functional at its own URL, but completely
// unreachable by click through the Finance tab nav.
//
// Fix: overflow-x-auto on the nav keeps any future overflow inside this nav's own scrollable box
// instead of past the shell's clip boundary. This guard fails if that class is removed.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx";

export function check(text) {
  const failures = [];
  if (!/<nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Finance">/.test(text)) {
    failures.push(`${FILE}: Finance tab nav no longer has overflow-x-auto -- tabs beyond the visible width (e.g. Amortization, once enough flag-gated tabs are on) become click-unreachable again`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: finance-tabs-overflow-scrollable");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Finance tab nav stays horizontally scrollable as tabs are appended");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    '<nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Finance">',
    '<nav className="-mb-px flex space-x-6" aria-label="Finance">',
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (dropped overflow-x-auto) was NOT caught");
    process.exit(1);
  }
  const baselineFailures = check(text);
  if (baselineFailures.length > 0) {
    console.error("FAIL(selftest): baseline (unmodified) source unexpectedly fails check()");
    for (const f of baselineFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS(selftest): planted offender correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
