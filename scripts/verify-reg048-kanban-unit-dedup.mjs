#!/usr/bin/env node
/**
 * REG-048 (owner live 2026-09-10): a unit with more than one open load rendered as separate
 * competing cards on DIFFERENT Kanban columns (T164/T156 duplicated across Dispatched/Delivered) --
 * groupLoadsByColumn bucketed purely by each load's own status, never deduping by assigned_unit_id.
 * This guard asserts the dedup step exists and is actually wired into the column-grouping path
 * (not just defined and unused). The real DB guard (uq_loads_one_active_unit /
 * assertUnitNotActiveOnAnotherLoad) lives in backend/migration files this fix never touches --
 * REG-048 is display/aggregation only, checked separately by this PR's diff scope, not by this
 * frontend-only static guard.
 *
 * Self-testing static guard. Run: node scripts/verify-reg048-kanban-unit-dedup.mjs [--selftest]
 */
import fs from "node:fs";

const file = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const original = fs.readFileSync(file, "utf8");

const contracts = [
  [
    "dedupeLoadsByUnit exists and groups by assigned_unit_id",
    (s) => /function dedupeLoadsByUnit\b(?!_)/.test(s) && /load\.assigned_unit_id/.test(s),
    (s) => s.replace("function dedupeLoadsByUnit", "function dedupeLoadsByUnit_REMOVED"),
  ],
  [
    "groupLoadsByColumn actually calls dedupeLoadsByUnit (not just defined and unused)",
    (s) => /for \(const load of dedupeLoadsByUnit\(loads\)\)/.test(s),
    (s) => s.replaceAll("for (const load of dedupeLoadsByUnit(loads))", "for (const load of loads)"),
  ],
  [
    "a cancelled/abandoned load never wins the unit's card over a real active one",
    (s) => /KANBAN_TERMINAL_CANCELLED_STATUSES/.test(s) && /active\.length > 0 \? active : list/.test(s),
    (s) => s.replace("active.length > 0 ? active : list", "list"),
  ],
  [
    "a unit with no assigned_unit_id never dedupes against other unassigned loads",
    (s) => /if \(!load\.assigned_unit_id\) \{\s*\n\s*unassigned\.push\(load\);/.test(s),
    (s) => s.replace("if (!load.assigned_unit_id) {", "if (false) {"),
  ],
];

function audit(s) {
  return contracts.filter(([, test]) => !test(s)).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-reg048-kanban-unit-dedup] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, , mutate] of contracts) {
    if (audit(mutate(original)).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-reg048-kanban-unit-dedup] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-reg048-kanban-unit-dedup] OK");
