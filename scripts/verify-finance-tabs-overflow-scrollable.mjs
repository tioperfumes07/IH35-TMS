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

const NAV_FILE = "apps/frontend/src/components/layout/NavyPageSubNav.tsx";
const LEGACY_NAV = '<nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Finance">';

// 443.102 — old rule: FinanceModuleTabs owns a `<nav … overflow-x-auto aria-label="Finance">`. New rule: that, OR the
// tabs render through the shared NavyPageSubNav (LST-F10158-NAVY-FINANCE #18880) AND that component's root <nav> is
// overflow-x-auto. Why: the Finance tabs moved onto the shared subnav, whose own root scrolls; the literal nav no longer
// exists. Tabs on a non-scrolling container, or the shared nav losing overflow-x-auto, still fail.
export function check(text, navText = fs.readFileSync(path.join(root, NAV_FILE), "utf8")) {
  const failures = [];
  const legacy = text.includes(LEGACY_NAV);
  const viaShared =
    /<NavyPageSubNav\s+items=\{tabs\.map\(/.test(text) &&
    /<nav\s+aria-label="Section navigation"[\s\S]{0,200}?className="[^"]*\boverflow-x-auto\b[^"]*"/.test(navText);
  if (!legacy && !viaShared) {
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
  const navText = fs.readFileSync(path.join(root, NAV_FILE), "utf8");
  if (check(text, navText).length) {
    console.error(`FAIL(selftest): baseline flagged: ${check(text, navText).join("; ")}`);
    process.exit(1);
  }
  const plants = [
    ["shared subnav dropped overflow-x-auto", text, navText.replace(/(<nav\s+aria-label="Section navigation"[\s\S]{0,200}?className="[^"]*?)\boverflow-x-auto\s*/, "$1")],
    ["tabs moved off the shared subnav", text.replace(/<NavyPageSubNav\s+items=\{tabs\.map\(/, "<div data-items={tabs.map("), navText],
    ["legacy nav without overflow-x-auto", '<nav className="-mb-px flex space-x-6" aria-label="Finance">', navText],
  ];
  for (const [name, t, n] of plants) {
    if (t === text && n === navText) {
      console.error(`FAIL(selftest): plant "${name}" did not change the source`);
      process.exit(1);
    }
    if (check(t, n).length === 0) {
      console.error(`FAIL(selftest): planted offender (${name}) was NOT caught`);
      process.exit(1);
    }
  }
  console.log(`PASS(selftest): ${plants.length}/${plants.length} planted offenders caught; baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
