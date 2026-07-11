#!/usr/bin/env node
/**
 * verify-reference-dropdown-inline-create.mjs  (UI-03 PART A — inline "+ Create" on accounting dropdowns)
 *
 * QuickBooks pattern: every reference dropdown that selects an accounting/master entity ends with a
 * "+ Create <thing>" / "+ Add new <thing>" option that opens a mini-create for that entity, saves via the
 * EXISTING endpoint, and auto-selects it without closing the parent. The reusable machinery already exists:
 *   - engine:  components/Combobox.tsx  -> `allowAddNew?: { label; onAdd }` (permanent first row)
 *   - keystone: components/parity/ReferenceSelect.tsx -> `createKind` maps to existing create endpoints
 *
 * A verify-first sweep (2026-07-11) found coverage is PARTIAL: vendor + banking split/design category/service
 * + item-category + JE-account already have it; account/COA pickers (owner-GATED: ACCOUNT_CREATE_GATED),
 * `class` and vendor/customer-`type` (backend-blocked), and several @archived-unmounted forms do not.
 *
 * This guard is a REGRESSION guard on the coverage that DOES ship — so it "stays fixed" (the block's intent).
 * It asserts each live parity surface below still wires inline-create (ReferenceSelect or Combobox.allowAddNew),
 * and that inline-create labels follow the vocab lock (§7): "+ Create"/"+ Add new", never a bare "Add new"/
 * "+ New"/"+ Add". It does NOT try to detect every theoretically-missing dropdown (that would false-fire on
 * enum selects + gated/blocked entities) — the missing set is tracked in docs/trackers/DEFERRED-ITEMS.md.
 *
 * Usage:
 *   node scripts/verify-reference-dropdown-inline-create.mjs            # scan
 *   node scripts/verify-reference-dropdown-inline-create.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Live parity surfaces that MUST keep an inline-create control (ReferenceSelect OR Combobox.allowAddNew).
// Dropping it is a regression of shipped QBO-parity coverage.
const REQUIRED_INLINE_CREATE = [
  "apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx",
  "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
  "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx",
  "apps/frontend/src/components/customers/CustomerProfileForm.tsx",
  "apps/frontend/src/components/accounting/ManualJEModal.tsx",
];

const INLINE_CREATE_MARK = /\bReferenceSelect\b|\ballowAddNew\b|InlineCreateDrawer|QuickCreateEntityModal/;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// Vocab lock (§7): an inline-create/add-new label must be "+ Create …" or "+ Add new …", never a bare
// "Add new" (no +), "+ New", or "+ Add". Scan add-new labels passed to allowAddNew / addNewLabel.
const BAD_LABEL = /(?:addNewLabel\s*=\s*|label:\s*)["'`]\s*(?:Add new(?![^"'`]*\+)|[+]\s*New\b|[+]\s*Add\b(?!\s*new))/;
// A correctly-formed add-new label (for the negative selftest).
const GOOD_LABEL_HINT = /["'`]\s*\+\s*(?:Create|Add new)\b/;

function scan() {
  const failures = [];
  // 1. regression: required surfaces keep inline-create
  for (const rel of REQUIRED_INLINE_CREATE) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel} — MISSING file (was a required inline-create surface)`);
      continue;
    }
    const src = stripComments(fs.readFileSync(full, "utf8"));
    if (!INLINE_CREATE_MARK.test(src)) {
      failures.push(`${rel} — lost its inline "+ Create" control (no ReferenceSelect/allowAddNew)`);
    }
  }
  // 2. vocab lock on add-new labels across the frontend
  const feRoot = path.join(repoRoot, "apps/frontend/src");
  const tsx = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(f); }
      else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) tsx.push(f);
    }
  })(feRoot);
  for (const full of tsx) {
    const src = stripComments(fs.readFileSync(full, "utf8"));
    if (BAD_LABEL.test(src)) {
      failures.push(`${path.relative(repoRoot, full)} — inline add-new label violates §7 vocab (use "+ Create"/"+ Add new")`);
    }
  }
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-reference-dropdown-inline-create] FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[verify-reference-dropdown-inline-create] PASS — ${REQUIRED_INLINE_CREATE.length} parity surfaces keep inline "+ Create"; labels vocab-clean`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  if (BAD_LABEL.test(`allowAddNew={{ label: "Add new", onAdd }}`) !== true) {
    console.error('[verify-reference-dropdown-inline-create] SELFTEST FAIL — bare "Add new" not flagged');
    process.exit(1);
  }
  if (BAD_LABEL.test(`addNewLabel="+ New vendor"`) !== true) {
    console.error('[verify-reference-dropdown-inline-create] SELFTEST FAIL — "+ New" not flagged');
    process.exit(1);
  }
  if (BAD_LABEL.test(`addNewLabel="+ Add new vendor"`) !== false || !GOOD_LABEL_HINT.test(`"+ Add new vendor"`)) {
    console.error('[verify-reference-dropdown-inline-create] SELFTEST FAIL — good "+ Add new" label mis-flagged');
    process.exit(1);
  }
  if (!INLINE_CREATE_MARK.test(`<ReferenceSelect createKind="vendor" />`)) {
    console.error("[verify-reference-dropdown-inline-create] SELFTEST FAIL — ReferenceSelect not recognized");
    process.exit(1);
  }
  console.log("[verify-reference-dropdown-inline-create] SELFTEST PASS — flags bad vocab, accepts + Add new, recognizes ReferenceSelect");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
