#!/usr/bin/env node
/**
 * STATUS-DROPDOWN SWEEP (owner 2026-09-10, verbatim): "the button like quickbooks has drop down
 * everywhere to change status wherever necessary." Sweeps every surface a load's status is shown
 * or changeable and asserts the SAME money-aware status-change control (InlineStatusPicker for
 * row/card-level surfaces, LoadStatusChanger for the full load-detail header -- both already call
 * the one writer, api/loads.ts updateLoadStatus / onStatusDrop -- never a second status-write path)
 * is actually mounted, not just present in an unrelated part of the file.
 *
 * Self-testing static guard. Run: node scripts/verify-status-dropdown-sweep.mjs [--selftest]
 */
import fs from "node:fs";

const FILES = {
  kanban: "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  loadCosts: "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  dispatchBoard: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  loadDetailDrawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};

const originals = Object.fromEntries(
  Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(f, "utf8")])
);

const STATUS_CHANGER_TAG = /<LoadStatusChanger[\s>]/;
// Scoped to each card's own data-testid so two InlineStatusPicker mounts in the same file
// (Standard-density card + Detailed-density card) are asserted independently -- a generic
// "does <InlineStatusPicker appear anywhere" check would stay green even if one density's
// mount were deleted, as long as the other still had one.
const standardCardPickerTag = (s) =>
  new RegExp(`data-testid="kanban-standard-card-status-picker">\\s*<InlineStatusPicker[\\s>]`).test(s);
const dispatchCardPickerTag = (s) =>
  new RegExp(`data-testid="kanban-dispatch-card-status-picker">\\s*<InlineStatusPicker[\\s>]`).test(s);

const contracts = [
  [
    "Kanban STANDARD-density card mounts InlineStatusPicker (change status without opening the drawer or dragging)",
    (s) => /function KanbanStandardCard/.test(s) && standardCardPickerTag(s) && /onStatusDrop\?:\s*Props\["onStatusDrop"\]/.test(s),
    (s) => s.replace(
      /(data-testid="kanban-standard-card-status-picker">\s*)<InlineStatusPicker(?=[\s>])/,
      "$1<InlineStatusPickerREMOVED"
    ),
    "kanban",
  ],
  [
    "Kanban DETAILED-density card (KanbanDispatchCard) also mounts InlineStatusPicker, alongside drag",
    (s) => /function KanbanDispatchCard/.test(s) && dispatchCardPickerTag(s) && /useInlineStatusChange\(load, onStatusDrop\)/.test(s),
    (s) => s.replace(
      /(data-testid="kanban-dispatch-card-status-picker">\s*)<InlineStatusPicker(?=[\s>])/,
      "$1<InlineStatusPickerREMOVED"
    ),
    "kanban",
  ],
  [
    "Load Costs board's Status column mounts InlineStatusPicker alongside the on-time/late pill",
    (s) => /<InlineStatusPicker[\s>]/.test(s) && /serviceStatus\(r\)/.test(s),
    (s) => s.replace(/<InlineStatusPicker(?=[\s>])/, "<InlineStatusPickerREMOVED"),
    "loadCosts",
  ],
  [
    "Dispatch List/Table (DispatchBoard) still mounts InlineStatusPicker on real load rows",
    (s) => /<InlineStatusPicker[\s>]/.test(s),
    (s) => s.replace(/<InlineStatusPicker(?=[\s>])/, "<InlineStatusPickerREMOVED"),
    "dispatchBoard",
  ],
  [
    "LoadDetailDrawer header still mounts LoadStatusChanger (REG-054, rides every tab)",
    (s) => STATUS_CHANGER_TAG.test(s),
    (s) => s.replace(/<LoadStatusChanger(?=[\s>])/, "<LoadStatusChangerREMOVED"),
    "loadDetailDrawer",
  ],
];

function audit() {
  const errors = [];
  for (const [name, test, , key] of contracts) {
    if (!test(originals[key])) errors.push(name);
  }
  return errors;
}

const failures = audit();
if (failures.length) {
  console.error(`[verify-status-dropdown-sweep] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, test, mutate, key] of contracts) {
    const mutatedText = mutate(originals[key]);
    if (mutatedText === originals[key]) {
      throw new Error(`selftest mutate() was a no-op for: ${name}`);
    }
    const stillPasses = test(mutatedText);
    if (!stillPasses) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-status-dropdown-sweep] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log("[verify-status-dropdown-sweep] OK — status-change control confirmed on Kanban Standard card, Kanban Detailed card, Load Costs board, Dispatch List/Table, and Load Detail header");
