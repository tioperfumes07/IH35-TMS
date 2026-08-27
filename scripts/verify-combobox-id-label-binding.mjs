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
const WRAPPER = "apps/frontend/src/components/shared/Combobox.tsx";
const ADAPTER = "apps/frontend/src/components/shared/SelectCombobox.tsx";

function assert(files) {
  const problems = [];
  const engine = files[ENGINE] ?? "";
  const wrapper = files[WRAPPER] ?? "";
  const adapter = files[ADAPTER] ?? "";

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

  // 2. The wrapper must accept and forward it, or the adapter's id dies one layer down.
  if (!/\bid\?:\s*string/.test(wrapper)) {
    problems.push(`${WRAPPER}: must declare \`id?: string\``);
  }
  if (!/id=\{id\}/.test(wrapper)) {
    problems.push(`${WRAPPER}: must forward id={id} to the engine Combobox`);
  }
  if (!/\bloading\?:\s*boolean/.test(wrapper)) {
    problems.push(`${WRAPPER}: must declare \`loading?: boolean\` (FuelPlannerHome passes loading=; SPA TS2322 if missing)`);
  }
  if (!/loading=\{loading\}/.test(wrapper)) {
    problems.push(`${WRAPPER}: must forward loading={loading} to the engine Combobox`);
  }

  // 3. The adapter must PASS it to the Combobox, not merely destructure it into synthetic events.
  if (!/<Combobox[\s\S]{0,200}id=\{id\}/.test(adapter)) {
    problems.push(
      `${ADAPTER}: must pass id={id} to <Combobox>. Using \`id\` only inside synthesised event payloads ` +
        `(target: { id }) leaves every <label htmlFor> in the app bound to nothing — the original defect.`,
    );
  }

  return problems;
}

const files = Object.fromEntries(
  [ENGINE, WRAPPER, ADAPTER].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const checks = [];

  // 1. The original defect: adapter keeps id for events only, never passes it down.
  const adapterBroken = { ...files, [ADAPTER]: files[ADAPTER].replace(/<Combobox\n\s*id=\{id\}/, "<Combobox") };
  checks.push(["adapter drops id", assert(adapterBroken).some((p) => /must pass id=\{id\}/.test(p))]);

  // 2. Wrapper stops forwarding.
  const wrapperBroken = { ...files, [WRAPPER]: files[WRAPPER].replace(/\n\s*id=\{id\}/, "") };
  checks.push(["wrapper drops id", assert(wrapperBroken).some((p) => /must forward id/.test(p))]);

  const wrapperDropsLoading = { ...files, [WRAPPER]: files[WRAPPER].replace(/\n\s*loading=\{loading\}/, "") };
  checks.push(["wrapper drops loading", assert(wrapperDropsLoading).some((p) => /must forward loading/.test(p))]);

  // 3. Engine renders the id somewhere OTHER than the combobox input.
  const engineBroken = {
    ...files,
    [ENGINE]: files[ENGINE].replace(/\n\s*id=\{id\}\n\s*aria-label=\{ariaLabel\}\n\s*role="combobox"/, '\n          aria-label={ariaLabel}\n          role="combobox"'),
  };
  checks.push(["id not on the combobox element", assert(engineBroken).some((p) => /SAME element as role="combobox"/.test(p))]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — id flows SelectCombobox -> shared Combobox -> the role="combobox" input`);
process.exit(0);
