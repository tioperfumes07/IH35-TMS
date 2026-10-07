#!/usr/bin/env node
/**
 * C1-A11Y — a `<label htmlFor="x">` next to a `<SelectCombobox id="x">` must actually bind to something.
 *
 * The picker surface is deliberately three files (see the TODO at the top of shared/Combobox.tsx):
 *
 *     components/Combobox.tsx            the engine — owns the <input role="combobox">
 *     components/shared/Combobox.tsx     wrapper
 *     components/shared/SelectCombobox.tsx  <select>-shaped adapter that flattens <option> children
 *
 * `SelectCombobox` accepted an `id` prop and used it ONLY to synthesise fake change/blur event payloads
 * (`target: { id }`). It was never rendered onto any DOM node, and neither the wrapper nor the engine
 * accepted `id` at all. Result: all five call sites pairing `<label htmlFor="…">` with
 * `<SelectCombobox id="…">` rendered a label bound to NOTHING — the control is unlabelled for screen
 * readers, and `getByLabelText` cannot address it.
 *
 * That is how this was found: a DailyTasks test could not reach its own Assignee field, and the failure
 * surfaced as a picker/fixture problem rather than as the accessibility defect it is.
 *
 * The engine already carries the same precedent for `dataTestId` ("converting a control must never
 * silently break a test's handle"). `id` is the stronger case: it carries the label association.
 *
 *   node scripts/verify-combobox-id-label-binding.mjs
 *   node scripts/verify-combobox-id-label-binding.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-combobox-id-label-binding";
const ENGINE = "apps/frontend/src/components/Combobox.tsx";

function assert(file) {
  const problems = [];
  const engine = file ?? "";

  // 1. The engine must accept an id AND render it on the element that carries role="combobox".
  if (!/\bid\?:\s*string/.test(engine)) {
    problems.push(`${ENGINE}: must declare an \`id?: string\` prop — <label htmlFor> has nothing to bind to without it`);
  }
  // The input's attributes are one JSX element; require id= and role="combobox" to be near each other so
  // an `id` rendered on some OTHER node (a wrapper div) does not satisfy this guard.
  const inputBlock = /id=\{id\}[\s\S]{0,240}role="combobox"|role="combobox"[\s\S]{0,240}id=\{id\}/.test(engine);
  if (!inputBlock) {
    problems.push(
      `${ENGINE}: \`id={id}\` must be rendered on the SAME element as role="combobox". An id on a wrapper ` +
        `<div> does not make <label htmlFor> point at the focusable control.`,
    );
  }

  return problems;
}

const engine = readFileSync(path.join(ROOT, ENGINE), "utf8");

if (SELFTEST) {
  const checks = [];

  // 1. Engine drops id prop declaration.
  const noIdProp = engine.replace(/\bid\?:\s*string\b/g, "");
  checks.push(["engine drops id prop", assert(noIdProp).some((p) => /must declare an \`id/.test(p))]);

  // 2. Engine renders the id somewhere OTHER than the combobox input.
  const engineBroken = engine.replace(/\n\s*id=\{id\}\n\s*aria-label=\{ariaLabel\}\n\s*role="combobox"/, '\n          aria-label={ariaLabel}\n          role="combobox"');
  checks.push(["id not on the combobox element", assert(engineBroken).some((p) => /SAME element as role="combobox"/.test(p))]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(engine);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Combobox engine accepts id and renders it on the role="combobox" input`);
process.exit(0);
