#!/usr/bin/env node
/**
 * verify-referenceselect-qbo-standard.mjs
 *
 * CI guard for PAR-FIX-1+2. Fails the build if any of:
 *
 * G1. ReferenceSelect.tsx renders an external add <button> next to the Combobox —
 *     the only add affordance must be the Combobox allowAddNew (first-row in dropdown).
 *
 * G2. Combobox.tsx gates the add row behind a typed-query condition — must be always-
 *     visible when allowAddNew is configured (empty-query add row must exist).
 *
 * G3. QuickCreateEntityModal (or any inline-create path) imports or calls
 *     createQboVendor / createQboItem / createQboAccount — no inline-create may write
 *     to a *_qbo_* mirror table.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readFile(relPath) {
  return readFileSync(join(root, relPath), "utf8");
}

let failed = false;

function fail(guard, message) {
  console.error(`\n[FAIL] ${guard}: ${message}`);
  failed = true;
}

function pass(guard, message) {
  console.log(`[PASS] ${guard}: ${message}`);
}

// ---------------------------------------------------------------------------
// G1 — ReferenceSelect must NOT render an external add <button>
// ---------------------------------------------------------------------------
const refSelect = readFile("apps/frontend/src/components/parity/ReferenceSelect.tsx");

// The external button pattern: a <button> that calls setCreateOpen(true) OUTSIDE the Combobox
// wrapper, i.e. NOT inside InlineCreateDrawer or QuickCreateEntityModal.
// Heuristic: look for a <button> element in the JSX that is a SIBLING (not child) of the Combobox
// and whose onClick calls setCreateOpen. The pre-fix pattern was:
//   <button ... onClick={() => setCreateOpen(true)} className="... shrink-0 ...">
//     {addLabel}
//   </button>
// After fix, no such element exists — the only add affordance is via allowAddNew on Combobox.
//
// Detect by looking for `shrink-0` on a button (the unique class from the removed external button),
// OR any button element that renders `{addLabel}` as its text child outside a modal/drawer wrapper.
const hasExternalButton =
  /className=["'][^"']*shrink-0[^"']*["']/.test(refSelect) ||
  // Check: a button outside of InlineCreateDrawer/QuickCreateEntityModal that renders addLabel
  // Simple structural check: if the JSX has a standalone <button> sibling of Combobox with addLabel
  /<button[^>]*>\s*\{addLabel\}\s*<\/button>/.test(refSelect);

if (hasExternalButton) {
  fail("G1", "ReferenceSelect.tsx still renders an external add <button> next to the Combobox. Remove it — the add affordance must live inside the Combobox dropdown (allowAddNew first row).");
} else {
  pass("G1", "No external add button found in ReferenceSelect.tsx.");
}

// Also confirm allowAddNew is still wired (so the in-dropdown row is present).
if (!refSelect.includes("allowAddNew")) {
  fail("G1b", "ReferenceSelect.tsx no longer passes allowAddNew to Combobox — the in-dropdown add row would be absent.");
} else {
  pass("G1b", "allowAddNew is passed to Combobox.");
}

// ---------------------------------------------------------------------------
// G2 — Combobox must show the add row on empty query (not gated by typed-query)
// ---------------------------------------------------------------------------
const combobox = readFile("apps/frontend/src/components/Combobox.tsx");

// Pre-fix: `const canAddNew = Boolean(allowAddNew && query.trim() && !hasExactMatch)`
// The typed-query gate is the `query.trim()` condition on canAddNew.
// After fix: `showAddNew = Boolean(allowAddNew)` — no query gate.
const hasTypedQueryGate = /canAddNew\s*=\s*Boolean\s*\(\s*allowAddNew\s*&&\s*query\.trim\s*\(\s*\)/.test(combobox);
if (hasTypedQueryGate) {
  fail("G2", "Combobox.tsx still gates the add row behind a typed-query condition (canAddNew with query.trim()). The add row must appear on empty query (QB-STD-2).");
} else {
  pass("G2", "No typed-query gate found — add row is not gated.");
}

// Confirm the always-visible pattern: showAddNew = Boolean(allowAddNew) without a query.trim() gate.
const hasShowAddNew = /showAddNew\s*=\s*Boolean\s*\(\s*allowAddNew\s*\)/.test(combobox);
if (!hasShowAddNew) {
  fail("G2b", "Combobox.tsx does not have the showAddNew = Boolean(allowAddNew) always-visible pattern. Verify the add-row is unconditionally present when allowAddNew is configured.");
} else {
  pass("G2b", "showAddNew = Boolean(allowAddNew) pattern confirmed.");
}

// ---------------------------------------------------------------------------
// G3 — No inline-create path may call the QBO mirror create functions
// ---------------------------------------------------------------------------
const quickCreateModal = readFile("apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx");
const mirrorFns = ["createQboVendor", "createQboItem", "createQboAccount"];

for (const fn of mirrorFns) {
  if (quickCreateModal.includes(fn)) {
    fail("G3", `QuickCreateEntityModal.tsx still calls/imports ${fn} — this writes to a QBO mirror table, not the canonical table the dropdown reads from. Repoint to the canonical create function.`);
  } else {
    pass("G3", `${fn} not found in QuickCreateEntityModal.tsx.`);
  }
}

// Also check NewVendorDrawerForm / NewServiceDrawerForm (InlineCreateDrawer service path).
// These are out of scope for PAR-FIX-1+2 but note if they still use mirror fns — do NOT fail here,
// just warn (they are separate blocks and not part of the QuickCreateEntityModal path).
const drawerFiles = [
  "apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewClassDrawerForm.tsx",
];
for (const f of drawerFiles) {
  try {
    // Strip block + line comments so historical "Previously used createQbo*" notes do not false-WARN.
    const content = readFile(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const fn of mirrorFns) {
      if (new RegExp(`\\b${fn}\\b`).test(content)) {
        console.warn(`[WARN] ${f} still uses ${fn} — separate block (not PAR-FIX-1+2 scope), but should be fixed.`);
      }
    }
  } catch {
    // file may not exist
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failed) {
  console.error("\nverify-referenceselect-qbo-standard: FAILED — see errors above.\n");
  process.exit(1);
} else {
  console.log("\nverify-referenceselect-qbo-standard: OK\n");
}
