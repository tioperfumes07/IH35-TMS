#!/usr/bin/env node
/**
 * DISPATCH Section A (owner 2026-09-04): "load should not state unassigned, we know it is
 * unassigned" + "IF ON ANY COLUMN THERE IS NO DATA … PUT LINE NOT TEXT." The Kanban cards
 * rendered a literal <span>Unassigned</span> catch-all when a card had neither a unit nor a
 * driver. That redundant word is replaced by the empty-cell dash. This guard fails if the
 * redundant "Unassigned" catch-all span comes back.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-kanban-no-unassigned-word.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

// The specific defect: a <span>Unassigned</span> (or <span …>Unassigned</span>) rendered as the
// no-unit-no-driver catch-all. A dash (—) is the correct empty-cell affordance.
const UNASSIGNED_SPAN = /<span[^>]*>\s*Unassigned\s*<\/span>/;

const contracts = [
  [
    "no redundant <span>Unassigned</span> catch-all in the Kanban cards",
    (s) => !UNASSIGNED_SPAN.test(s),
    (s) => s.replace(/<span className="text-gray-400" aria-label="No unit or driver assigned">—<\/span>/, "<span>Unassigned</span>"),
  ],
  [
    "the no-unit-no-driver branch renders the empty-cell dash instead",
    (s) => /!load\.assigned_primary_driver_id && !load\.assigned_unit_id \? \(\s*<span className="text-gray-400"[^>]*>—<\/span>/.test(s),
    (s) => s.replace(/<span className="text-gray-400" aria-label="No unit or driver assigned">—<\/span>/g, "<span>Unassigned</span>"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-kanban-no-unassigned-word] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-kanban-no-unassigned-word] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-kanban-no-unassigned-word] OK");
