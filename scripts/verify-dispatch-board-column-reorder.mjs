#!/usr/bin/env node
// BRD-04 guard — dispatch board columns must remain drag-to-reorder and drag-to-resize,
// with state persisted per-user under the shared "dispatch-board" storage key.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boardPath = join(root, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
const tablePath = join(root, "apps/frontend/src/components/parity/ParityTable.tsx");

const board = readFileSync(boardPath, "utf8");
const table = readFileSync(tablePath, "utf8");

const errors = [];

// DispatchBoard must pass the shared dispatch-board storage key to every section table.
if (!/storageKey="dispatch-board"/.test(board)) {
  errors.push("DispatchBoard.tsx does not set storageKey=\"dispatch-board\" on its ParityTable instances.");
}

// Explicit opt-in so a future default change cannot silently disable reorder/resize.
if (!/enableColumnReorder\b/.test(board)) {
  errors.push("DispatchBoard.tsx does not enable column reorder (enableColumnReorder).");
}
if (!/enableColumnResize\b/.test(board)) {
  errors.push("DispatchBoard.tsx does not enable column resize (enableColumnResize).");
}

// ParityTable itself must honor the flag by making header cells draggable and rendering a resize grip.
if (!/enableColumnReorder\s*\?\s*.*draggable\s*=\s*\{enableColumnReorder\}/s.test(table)) {
  errors.push("ParityTable.tsx does not wire enableColumnReorder to draggable headers.");
}
if (!/enableColumnResize\b/.test(table)) {
  errors.push("ParityTable.tsx does not support enableColumnResize.");
}
if (!/data-testid="parity-table-col-resize"/.test(table)) {
  errors.push("ParityTable.tsx does not render a discoverable column resize grip.");
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error("verify-dispatch-board-column-reorder FAIL:", err);
  }
  process.exit(1);
}

console.log("verify-dispatch-board-column-reorder OK — dispatch board column reorder/resize guarded.");
process.exit(0);
