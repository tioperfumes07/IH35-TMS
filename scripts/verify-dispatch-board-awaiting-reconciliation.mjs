#!/usr/bin/env node
/**
 * CROSS-TAB CONSISTENCY (owner 2026-09-11, "CORRECTED FIX" item 4): the KANBAN-DUP-UNIT-2 bug class
 * (a unit whose only load is delivered_pending_docs/invoiced falls outside listUnitsWithoutLoad's
 * own "no active load" exclusion set, so it renders BOTH as a real load row AND as a synthetic
 * "awaiting assignment" ghost row) was fixed in DispatchKanban.tsx but NOT in DispatchBoard.tsx (the
 * List/Table view), which has its own SEPARATE "Awaiting assignment" section built from the same
 * `unassignedUnits`/listUnitsWithoutLoad source. Live-confirmed cross-tab: T163/T173/T148 each
 * rendered twice on this exact page (once in Booked/Billing, once again in Awaiting assignment).
 *
 * This guard asserts CORRECTNESS not presence, per the owner's explicit standard: it checks that
 * DispatchBoard.tsx actually reconciles `awaitingRows` against the unit_ids already rendered via
 * `bookedRows`/`billingRows` (not just that some dedup-sounding code exists somewhere), and that
 * DispatchBoard.test.tsx's KANBAN-DUP-UNIT-2 describe block contains a real assertion the overlap
 * case renders 0, not 1.
 *
 * Self-testing static guard. Run: node scripts/verify-dispatch-board-awaiting-reconciliation.mjs [--selftest]
 */
import fs from "node:fs";

const FILES = {
  board: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  boardTest: "apps/frontend/src/pages/dispatch/DispatchBoard.test.tsx",
};

const originals = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));

const contracts = [
  [
    "DispatchBoard.tsx computes rowedUnitIds from bookedRows+billingRows BEFORE computing awaitingRows",
    (files) =>
      /const rowedUnitIds = new Set<string>\(\);/.test(files.board) &&
      /for \(const load of \[\.\.\.bookedRows, \.\.\.billingRows\]\) \{\s*\n\s*if \(load\.assigned_unit_id\) rowedUnitIds\.add\(load\.assigned_unit_id\);/.test(
        files.board
      ),
    (files) => ({
      ...files,
      board: files.board.replace(
        "for (const load of [...bookedRows, ...billingRows]) {\n      if (load.assigned_unit_id) rowedUnitIds.add(load.assigned_unit_id);\n    }",
        "// dedup reconciliation removed"
      ),
    }),
  ],
  [
    "DispatchBoard.tsx's awaitingRows filter excludes units already in rowedUnitIds (real fix, not just presence of the set)",
    (files) => /unassignedUnits\s*\n\s*\.filter\(\(unit\) => !inShopUnitIds\.has\(unit\.id\) && !rowedUnitIds\.has\(unit\.id\)\)/.test(files.board),
    (files) => ({
      ...files,
      board: files.board.replace(
        ".filter((unit) => !inShopUnitIds.has(unit.id) && !rowedUnitIds.has(unit.id))",
        ".filter((unit) => !inShopUnitIds.has(unit.id))"
      ),
    }),
  ],
  [
    "DispatchBoard.test.tsx's KANBAN-DUP-UNIT-2 block asserts the overlap case renders 0 (correctness, not presence)",
    (files) =>
      /KANBAN-DUP-UNIT-2 List\/Table Awaiting-assignment reconciliation/.test(files.boardTest) &&
      /does NOT also render in Awaiting assignment/.test(files.boardTest) &&
      /expect\(header\)\.toHaveTextContent\("0"\)/.test(files.boardTest),
    (files) => ({ ...files, boardTest: files.boardTest.replace('expect(header).toHaveTextContent("0")', "// REMOVED") }),
  ],
  [
    "DispatchBoard.test.tsx's baseline test proves the mocked idle unit DOES render (1) absent overlap, guarding against a filter that drops everything",
    (files) =>
      /baseline: with no load referencing unit-1, it renders once in Awaiting assignment/.test(files.boardTest) &&
      /expect\(header\)\.toHaveTextContent\("1"\)/.test(files.boardTest),
    (files) => ({ ...files, boardTest: files.boardTest.replace('expect(header).toHaveTextContent("1")', "// REMOVED") }),
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
  console.error(`[verify-dispatch-board-awaiting-reconciliation] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
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
  console.log(`[verify-dispatch-board-awaiting-reconciliation] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-dispatch-board-awaiting-reconciliation] OK — DispatchBoard.tsx's Awaiting-assignment section reconciles against Booked/Billing unit_ids (KANBAN-DUP-UNIT-2 List/Table parity), correctness test present with both overlap(0) and baseline(1) assertions intact"
);
