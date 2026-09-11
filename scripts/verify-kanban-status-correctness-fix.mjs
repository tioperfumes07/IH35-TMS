#!/usr/bin/env node
/**
 * CORRECTED FIX (owner 2026-09-11, verbatim): "the guard must assert CORRECTNESS not presence —
 * e.g. for the status dropdown, the guard must assert the option list length/contents match
 * getOfficeTransitionButtons' output, not just that InlineStatusPicker is mounted. For Kanban, the
 * guard must assert zero unit_ids appear in both the loads-card set and the awaitingTrucks-card set
 * simultaneously."
 *
 * The prior guard (verify-status-dropdown-sweep.mjs) only ever checked PRESENCE (a picker is
 * mounted) — it stayed green while InlineStatusPicker's option list was a hardcoded 5-status array
 * with no relationship to the load's actual status. The real correctness assertions (option list ==
 * getOfficeTransitionButtons(status) exactly, per status; zero overlap between the loads-card unit
 * set and the awaitingTrucks-card unit set) are RUNTIME properties that only a rendered-component
 * test can prove — see InlineStatusPicker.test.tsx and the "KANBAN-DUP-UNIT-2" describe block in
 * DispatchKanban.test.tsx, both added alongside this fix. This static guard's job is narrower and
 * complementary: prove the SOURCE WIRING those tests depend on can't silently regress (the hardcoded
 * array doesn't come back; the dedupedUnitIds reconciliation isn't deleted) and that the two
 * correctness test files still exist and still contain their key assertions.
 *
 * Self-testing static guard. Run: node scripts/verify-kanban-status-correctness-fix.mjs [--selftest]
 */
import fs from "node:fs";

const FILES = {
  picker: "apps/frontend/src/components/dispatch/InlineStatusPicker.tsx",
  pickerTest: "apps/frontend/src/components/dispatch/InlineStatusPicker.test.tsx",
  kanban: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  kanbanTest: "apps/frontend/src/components/dispatch/DispatchKanban.test.tsx",
};

const originals = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));

const contracts = [
  [
    "InlineStatusPicker sources its options from getOfficeTransitionButtons(status), never a hardcoded array",
    (files) =>
      /import\s*\{[^}]*getOfficeTransitionButtons[^}]*\}\s*from\s*"@ih35\/shared-types"/.test(files.picker) &&
      /getOfficeTransitionButtons\(String\(status/.test(files.picker) &&
      // Checks the actual DECLARATION, not the word -- this file's own explanatory comment
      // legitimately names DISPATCHER_STATUS_OPTIONS in prose (describing what was removed).
      !/(?:export\s+)?const\s+DISPATCHER_STATUS_OPTIONS/.test(files.picker),
    (files) => ({
      ...files,
      picker: files.picker.replace(
        "const transitions = useMemo(() => getOfficeTransitionButtons(String(status ?? \"\").trim()), [status]);",
        'const transitions = [{ target: "dispatched", label: "Dispatched", testId: "x" }, { target: "in_transit", label: "In Transit", testId: "y" }, { target: "delivered_pending_docs", label: "Delivered", testId: "z" }, { target: "invoiced", label: "Invoiced", testId: "w" }, { target: "completed_docs_received", label: "Docs received", testId: "v" }];'
      ),
    }),
  ],
  [
    "InlineStatusPicker.test.tsx asserts the rendered option count/contents exactly match getOfficeTransitionButtons(status) (correctness, not presence)",
    (files) =>
      /getOfficeTransitionButtons\(status\)/.test(files.pickerTest) &&
      /toHaveLength\(expected\.length\)/.test(files.pickerTest) &&
      /toContain\(`inline-status-option-load-1-\$\{t\.target\}`\)/.test(files.pickerTest),
    (files) => ({ ...files, pickerTest: files.pickerTest.replace("toHaveLength(expected.length)", "// REMOVED") }),
  ],
  [
    "DispatchKanban.tsx reconciles awaitingTrucks against the loads-card winners (dedupedUnitIds) before rendering ghost cards",
    (files) =>
      /const dedupedUnitIds = useMemo/.test(files.kanban) &&
      /awaitingTrucks\.filter\(\(unit\) => !dedupedUnitIds\.has\(unit\.id\)\)/.test(files.kanban),
    (files) => ({
      ...files,
      kanban: files.kanban.replace(
        "() => awaitingTrucks.filter((unit) => !dedupedUnitIds.has(unit.id)).map(truckToKanbanLoad)",
        "() => awaitingTrucks.map(truckToKanbanLoad)"
      ),
    }),
  ],
  [
    "DispatchKanban.test.tsx asserts zero unit_id overlap between the loads-card set and the awaitingTrucks-card set (correctness, not presence)",
    (files) =>
      /KANBAN-DUP-UNIT-2/.test(files.kanbanTest) &&
      /const overlap = ghostUnitIds\.filter/.test(files.kanbanTest) &&
      /expect\(overlap\)\.toEqual\(\[\]\)/.test(files.kanbanTest),
    (files) => ({ ...files, kanbanTest: files.kanbanTest.replace("expect(overlap).toEqual([])", "// REMOVED") }),
  ],
];

function audit(files) {
  const errors = [];
  for (const [name, test] of contracts) {
    if (!test(files)) errors.push(name);
  }
  return errors;
}

const failures = audit(originals);
if (failures.length) {
  console.error(`[verify-kanban-status-correctness-fix] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, test, mutate] of contracts) {
    const mutated = mutate(originals);
    if (JSON.stringify(mutated) === JSON.stringify(originals)) {
      throw new Error(`selftest mutate() was a no-op for: ${name}`);
    }
    if (!test(mutated)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-kanban-status-correctness-fix] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-kanban-status-correctness-fix] OK — InlineStatusPicker sources options from the real state machine, DispatchKanban reconciles awaitingTrucks against loads-card winners, both correctness test files present with their key assertions intact"
);
