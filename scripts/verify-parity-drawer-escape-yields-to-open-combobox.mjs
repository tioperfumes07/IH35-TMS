#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["qbo_chrome"],"leafRe":"^fleet\\.modal\\.create_unit$","task":"FLEET-F-ESCAPE-EATS-DRAWER-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): ParityDrawer's capture-phase Escape listener (stackAboveModal
 * drawers only — e.g. Fleet's Create Unit, nested inside a wide wizard/shared Modal) ran BEFORE a
 * nested Combobox's own bubble-phase Escape handler ever got a chance to fire, so pressing Escape
 * to dismiss an open picker dropdown discarded the WHOLE drawer/form instead of just closing the
 * dropdown. Live-reproduced 2026-08-21 on Fleet's "+ Create Unit" -> Owner Company picker: typed a
 * real Unit Number, opened the Owner Company Combobox, pressed Escape — the entire drawer closed
 * and the typed value was lost. Fixed by having the capture-phase handler step aside (return
 * without closing) whenever a Combobox listbox portal is currently open, letting Combobox's own
 * bubble-phase Escape handler (which already does the right thing: closeListbox only, no forced
 * selection) run instead.
 */
import fs from "node:fs";
const LABEL = "verify-parity-drawer-escape-yields-to-open-combobox";
const FILE = "apps/frontend/src/components/parity/ParityDrawer.tsx";

function audit(src) {
  const failures = [];
  const onKeyBody = src.match(/const onKey = \(e: KeyboardEvent\) => \{[\s\S]*?\n\s*\};/)?.[0] ?? "";
  if (!onKeyBody) {
    failures.push("could not find ParityDrawer's onKey Escape handler");
    return failures;
  }
  const guardIndex = onKeyBody.indexOf('document.querySelector(\'[data-combobox-listbox="portal"]\')');
  const closeIndex = onKeyBody.indexOf("attemptClose();");
  if (guardIndex === -1) {
    failures.push('onKey must check document.querySelector(\'[data-combobox-listbox="portal"]\') before closing');
  }
  if (closeIndex === -1) {
    failures.push("onKey must still call attemptClose() for the normal (no open Combobox) case");
  }
  if (guardIndex !== -1 && closeIndex !== -1 && guardIndex > closeIndex) {
    failures.push("the open-Combobox guard must run BEFORE onClose(), not after");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(FILE, "utf8");
  const mutations = [
    ["strip-combobox-guard", (s) => s.replace('if (document.querySelector(\'[data-combobox-listbox="portal"]\')) return;\n      ', "")],
    ["bypass-guarded-close", (s) => s.replace("      attemptClose();\n", "      onClose();\n")],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(FILE, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ParityDrawer's capture-phase Escape yields to an open Combobox listbox before discarding the drawer`);
