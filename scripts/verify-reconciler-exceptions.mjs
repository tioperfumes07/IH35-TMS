#!/usr/bin/env node
// THE RECONCILER — exception ceilings (docs/manuals/03-RULING-THE-RECONCILER-THE-ONE-GENERATIVE-CAUSE.md,
// "every invariant ships with its own guard and a count that must shrink"). Runs every registered
// invariant live, read-only, and compares each field's exception count to its dated ceiling in
// verify-reconciler-exceptions.baseline.json.
//   an invariant errored                          -> FAIL (a check that cannot run is not clean)
//   an invariant has no ceiling, or a ceiling has
//   no invariant                                  -> FAIL (every invariant lands with its ceiling)
//   a field's count is above its ceiling          -> FAIL, lists that field's exceptions
//   a field's count is below its ceiling          -> PASS, prints the lower ceiling to commit
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-reconciler-exceptions";
export const REQUIRES_LIVE_DB =
  "runs every reconciler invariant against live USMCA in a READ ONLY transaction; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH =
  process.env.RECONCILER_BASELINE_PATH || path.join(ROOT, "scripts/verify-reconciler-exceptions.baseline.json");

export function evaluate(run, ceilings, registeredIds) {
  const failures = [];
  const notes = [];

  for (const id of run.errored_invariants) {
    const r = run.results.find((x) => x.invariant === id);
    failures.push(`${id} could not run: ${r?.error ?? "unknown error"}`);
  }
  for (const id of registeredIds) {
    if (!ceilings[id]) failures.push(`${id} is registered but has no ceiling in ${path.basename(BASELINE_PATH)}`);
  }
  for (const id of Object.keys(ceilings)) {
    if (!registeredIds.includes(id)) failures.push(`${id} has a ceiling but is not a registered invariant`);
  }

  for (const r of run.results) {
    if (r.status !== "ok" || !ceilings[r.invariant]) continue;
    const byField = new Map();
    for (const e of r.exceptions) byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
    const fields = new Set([...Object.keys(ceilings[r.invariant]), ...byField.keys()]);
    for (const field of fields) {
      const ceiling = ceilings[r.invariant][field] ?? 0;
      const rows = byField.get(field) ?? [];
      if (rows.length > ceiling) {
        failures.push(
          `${r.invariant} ${field}: ${rows.length} exception(s), ceiling ${ceiling} — ` +
            rows.map((e) => `load ${e.entity_label}`).join(", ")
        );
      } else if (rows.length < ceiling) {
        notes.push(`${r.invariant} ${field}: ${rows.length} exception(s), ceiling ${ceiling} — lower the ceiling to ${rows.length}`);
      }
    }
  }
  return { failures, notes };
}

function selftest() {
  const ex = (field, label) => ({ invariant: "I8", field, entity_label: label });
  const ok = (exceptions) => ({ results: [{ invariant: "I8", status: "ok", exceptions }], errored_invariants: [] });
  const ceilings = { I8: { unit: 1, customer_reference: 1 } };
  const check = (cond, msg) => {
    if (!cond) {
      console.error(`${LABEL} --selftest FAIL: ${msg}`);
      process.exit(1);
    }
  };

  check(evaluate(ok([ex("unit", "1"), ex("customer_reference", "2")]), ceilings, ["I8"]).failures.length === 0, "at ceiling must pass");
  check(evaluate(ok([ex("unit", "1"), ex("unit", "3")]), ceilings, ["I8"]).failures.length === 1, "above ceiling must fail");
  check(evaluate(ok([ex("driver", "4")]), ceilings, ["I8"]).failures.length === 1, "a field with no ceiling is ceiling 0");
  const shrunk = evaluate(ok([]), ceilings, ["I8"]);
  check(shrunk.failures.length === 0 && shrunk.notes.length === 2, "below ceiling must pass with a note");
  check(
    evaluate({ results: [{ invariant: "I8", status: "error", error: "boom", exceptions: [] }], errored_invariants: ["I8"] }, ceilings, ["I8"])
      .failures.length === 1,
    "an errored invariant must fail"
  );
  check(evaluate(ok([]), {}, ["I8"]).failures.length === 1, "a registered invariant without a ceiling must fail");
  check(evaluate(ok([]), { I8: {}, I9: {} }, ["I8"]).failures.length === 1, "a ceiling without an invariant must fail");
  console.log(`${LABEL} --selftest PASS — 7 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const { measureReconciler, RECONCILER_INVARIANTS } = await import("./reconciler/measure.mjs");
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const run = await measureReconciler({ label: LABEL });
const { failures, notes } = evaluate(run, baseline.ceilings ?? {}, RECONCILER_INVARIANTS.map((i) => i.id));

for (const n of notes) console.log(`${LABEL}: ${n}`);
if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ${run.results.length} invariant(s) ran, ${run.exception_count} open exception(s), none above its ceiling (established ${baseline.established}).`
);
