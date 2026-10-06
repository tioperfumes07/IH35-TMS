#!/usr/bin/env node
// U1 + U2 (owner, 2026-10-03) — "nothing in Accounting resizes — full screen or any width" and "the Accounting tab bar
// runs off screen, cut at BILL PAYM…". Static; behaviour is proved by ParityTable.test.tsx ("U1: …").
//   U1: ParityTable renders column widths as SHARES of the table (percent) with a per-column floor, never as a fixed
//       pixel sum that overflows any window (the Expenses list: 2,278 px inside a 2,244 px box on a 2,400 px screen)
//   U2: the shared tab bar (HoverDropdownNav.css) WRAPS onto a new row instead of hiding tabs off the right edge
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_tables_and_tab_bars_follow_the_window(); }
async function selftest_verify_tables_and_tab_bars_follow_the_window() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_tables_and_tab_bars_follow_the_window", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}

const LABEL = "verify-tables-and-tab-bars-follow-the-window";
const fails = [];
const pt = readFileSync("apps/frontend/src/components/parity/ParityTable.tsx", "utf8");
if (!/\$\{\(\(w \/ proportionalTotal\) \* 100\)\.toFixed\(4\)\}%/.test(pt)) fails.push("ParityTable: column widths are no longer rendered as shares of the table");
if (!/\{ width: cssWidthFor\(w\) \}/.test(pt)) fails.push("ParityTable: header width bypasses the share (fixed pixels again)");
if (!/proportionalMinTable \? \{ minWidth: proportionalMinTable \}/.test(pt)) fails.push("ParityTable: the per-column legibility floor is gone");
const css = readFileSync("apps/frontend/src/components/forms/shared/HoverDropdownNav.css", "utf8");
const bar = css.slice(css.indexOf('.hover-dropdown-nav ul[role="menubar"]'), css.indexOf("}", css.indexOf('.hover-dropdown-nav ul[role="menubar"]')));
if (!/flex-wrap:\s*wrap/.test(bar)) fails.push("HoverDropdownNav.css: the tab bar no longer wraps — tabs run off screen");
if (/min-width:\s*max-content/.test(bar)) fails.push("HoverDropdownNav.css: min-width: max-content forces one row again");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — tables size to the window (column shares, 48 px floor); the tab bar wraps instead of running off screen`);
