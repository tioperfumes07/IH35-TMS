#!/usr/bin/env node
/**
 * verify-send-contract-variable-row-stable-key.mjs  (LEGAL-F6236)
 *
 * Root cause: the "Fill variables" step of the Legal "Send Contract" wizard rendered each
 * variable row's `<div>` with `key={\`${row.key}-${index}\`}` — but `row.key` IS the live value
 * of the row's own "variable_name" text input. Every keystroke into that input changes `row.key`,
 * which changes the React key React uses to identify the row, which forces React to unmount the
 * old `<input>` DOM node and mount a brand-new one on every single keystroke. The new node isn't
 * focused, so the very first character a user typed landed (before the remount), and every
 * character after it was silently dropped with zero visible error — typing "driver_name" into
 * the field left it holding only "d". This breaks the manual variable-entry path of the Send
 * Contract wizard app-wide (any custom template variable a user tries to type by hand).
 * Live-reproduced 2026-08-23: typed "abc" into the variable_name field -> field held only "a";
 * typed "x" then "y" as separate keystrokes -> field held only "x", "y" silently lost.
 *
 * This guard makes the regression impossible to re-ship: the row's React `key` must be a stable
 * identity across the row's lifetime (index is correct here — rows are only appended at the end
 * or removed by index, never reordered) and must NEVER be derived from a value the row's own
 * live-editable inputs write back into on every keystroke.
 *
 * Usage:
 *   node scripts/verify-send-contract-variable-row-stable-key.mjs            # scan
 *   node scripts/verify-send-contract-variable-row-stable-key.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const MODAL_FILE = "apps/frontend/src/pages/legal/contracts/SendContractModal.tsx";

// The variable-row block: a `.map((row, index) => ...)` whose row-level element key must not be
// derived from `row.key` (the same field the row's own text input mutates every keystroke).
const ROW_MAP_MARKER = "variableRows.map((row, index) =>";
const UNSAFE_KEY = /key=\{`\$\{row\.key\}-\$\{index\}`\}/;

export function checkVariableRowKeyIsStable(src) {
  const offenders = [];
  const mapIdx = src.indexOf(ROW_MAP_MARKER);
  if (mapIdx === -1) {
    offenders.push(`${MODAL_FILE}: variableRows.map(...) marker not found (has this component moved or been renamed?)`);
    return offenders;
  }
  // Look only within the row-map's own block for the offending key pattern (bounded scan to keep
  // this a narrow, surgical guard rather than a whole-file regex).
  const block = src.slice(mapIdx, mapIdx + 800);
  if (UNSAFE_KEY.test(block)) {
    offenders.push(
      `${MODAL_FILE}: variable row key is derived from row.key (\`key={\\\`\\\${row.key}-\\\${index}\\\`}\`) — LEGAL-F6236 regression shape: row.key is also the live value of that row's own "variable_name" input, so every keystroke remounts the input and drops focus, silently truncating input to the first character typed`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, MODAL_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkVariableRowKeyIsStable(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    {variableRows.map((row, index) => (
      <div key={\`\${row.key}-\${index}\`} className="grid gap-2">
        <input value={row.key} onChange={(event) => setVariableRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: event.target.value } : item)))} />
      </div>
    ))}
  `;
  const fixed = `
    {variableRows.map((row, index) => (
      <div key={index} className="grid gap-2">
        <input value={row.key} onChange={(event) => setVariableRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: event.target.value } : item)))} />
      </div>
    ))}
  `;

  const buggyFails = checkVariableRowKeyIsStable(buggy).length > 0;
  const fixedPasses = checkVariableRowKeyIsStable(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:send-contract-variable-row-stable-key selftest OK");
    process.exit(0);
  }
  console.error("verify:send-contract-variable-row-stable-key selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:send-contract-variable-row-stable-key FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:send-contract-variable-row-stable-key OK — variable row key is stable (index-based), not derived from the row's own live-editable input value");
}
