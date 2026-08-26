#!/usr/bin/env node
// DATEPICKER-LABEL-CLICKTHROUGH-REOPEN — guard
//
// Several callers wrap the shared DatePicker in a bare <label>text<DatePicker/></label>, or (a
// newer pattern spreading across the codebase — see Codex's DRIVER-F6498 / the Safety filter-range
// fixes) an explicit <label htmlFor="x">text</label> + <DatePicker id="x">. Either association
// makes clicking the label TEXT (not the trigger button) forward a synthetic "click" to the
// button as the browser's default label-activation behavior.
//
// Live-reproduced on /lists/accounting/chart-of-accounts "New Account" drawer's "Balance As Of"
// field via a MutationObserver on the popover: one physical click on the label text produced
// REMOVE then ADD of the calendar popover ~2ms apart. Root cause: the outside-mousedown listener
// (apps/frontend/src/components/forms/DatePicker.tsx) sees the label-text mousedown as OUTSIDE
// ref.current and closes the popover; the browser's synthetic label-forwarded click then lands on
// the trigger button a beat later and toggles it straight back open — "click outside to close"
// silently no-ops, one instance of GO-2310's "closes then immediately re-opens on the same click"
// failure class.
//
// FIX: the outside-mousedown handler now arms the existing day-pick suppressToggleRef whenever it
// closes an OPEN popover, self-clearing on the next tick (setTimeout 0) so a later, genuinely
// separate click on the trigger is never swallowed. This lives in the ONE shared component, so it
// covers every current and future label-wrapped/label-for caller without a per-file patch.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/components/forms/DatePicker.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("function onDoc(e: MouseEvent)");
  if (idx === -1) {
    failures.push("onDoc outside-click handler not found");
    return failures;
  }
  const block = text.slice(idx, idx + 1800);

  if (!/if\s*\(\s*open\s*\)\s*\{/.test(block)) {
    failures.push("onDoc does not branch on the popover's own open state before arming suppression");
  }
  if (!/suppressToggleRef\.current\s*=\s*true/.test(block)) {
    failures.push("onDoc never arms suppressToggleRef — a label-forwarded click after this close will reopen the popover");
  }
  if (!/setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*suppressToggleRef\.current\s*=\s*false/.test(block)) {
    failures.push("suppressToggleRef is armed but never self-clears on the next tick — a later genuine trigger click would be silently swallowed");
  }
  if (!/setOpen\(false\)/.test(block)) {
    failures.push("onDoc no longer closes the popover on an outside click");
  }

  return failures;
}

function run() {
  const filePath = path.join(root, FILE);
  const text = fs.readFileSync(filePath, "utf8");
  const failures = check(text);
  if (failures.length) {
    console.error(`FAIL(gated): ${FILE}\n` + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`PASS: ${FILE} suppresses the label-click-forwarded reopen after an outside-click close`);
}

async function selftest() {
  const filePath = path.join(root, FILE);
  const real = fs.readFileSync(filePath, "utf8");

  // Baseline (real current file) must pass clean.
  const baseline = check(real);
  if (baseline.length) {
    console.error("FAIL(selftest): baseline (real file) did not pass clean:\n" + baseline.join("\n"));
    process.exit(1);
  }

  // Offender 1: revert to the pre-fix onDoc (the exact historical shape on origin/main before
  // this fix) — plain `if (...) setOpen(false);`, no suppression at all.
  const preFixOffender = real.replace(
    /function onDoc\(e: MouseEvent\) \{[\s\S]*?\n    \}\n(?=    if \(open\) document\.addEventListener)/,
    `function onDoc(e: MouseEvent) {\n      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);\n    }\n`
  );
  if (preFixOffender === real) {
    console.error("FAIL(selftest): pre-fix-offender mutation did not change the source — regex out of sync with the real block");
    process.exit(1);
  }
  const preFixFailures = check(preFixOffender);
  if (preFixFailures.length === 0) {
    console.error("FAIL(selftest): planted pre-fix (historical, unsuppressed) onDoc was NOT caught");
    process.exit(1);
  }

  // Offender 2: arms suppressToggleRef but never clears it (would swallow every later trigger click).
  const noClearOffender = real.replace(
    /setTimeout\(\(\) => \{\s*suppressToggleRef\.current = false;\s*\}, 0\);\n\s*\}\n\s*setOpen\(false\);/,
    "}\n        setOpen(false);"
  );
  if (noClearOffender === real) {
    console.error("FAIL(selftest): no-clear-offender mutation did not change the source — regex out of sync");
    process.exit(1);
  }
  const noClearFailures = check(noClearOffender);
  if (noClearFailures.length === 0) {
    console.error("FAIL(selftest): planted no-self-clear offender was NOT caught");
    process.exit(1);
  }

  // Offender 3: also verify against the REAL historical pre-fix source on origin/main, not just a
  // synthetic mutation of the current file.
  const { execFileSync } = await import("node:child_process");
  let historical;
  try {
    historical = execFileSync("git", ["show", `origin/main:${FILE}`], { cwd: root, encoding: "utf8" });
  } catch {
    historical = null;
  }
  if (historical && !historical.includes("suppressToggleRef.current = true;\n          setTimeout")) {
    const historicalFailures = check(historical);
    if (historicalFailures.length === 0) {
      console.error("FAIL(selftest): origin/main pre-fix DatePicker.tsx unexpectedly passed check() — guard too weak");
      process.exit(1);
    }
    console.log("PASS(selftest): origin/main historical pre-fix source correctly fails check()");
  } else {
    console.log("PASS(selftest): origin/main already carries the fix (or is unavailable) — skipping historical-fail leg");
  }

  console.log("PASS: 2/2 planted offenders caught (pre-fix-unsuppressed, arms-but-never-clears); baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  run();
}
