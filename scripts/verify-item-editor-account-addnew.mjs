#!/usr/bin/env node
/**
 * verify-item-editor-account-addnew.mjs  (PS-A — ItemEditor income/expense account pickers)
 *
 * Locks QBO-parity nested "+ Add new account" on ItemEditorModal's Income and Expense account
 * Combobox pickers, AND locks the CORRECT create chrome:
 *
 *   MUST: InlineCreateDrawer kind="account" → NewAccountDrawerForm (catalogs.accounts / CoA)
 *   MUST NOT: QuickCreateEntityModal kind="category" (wrong kind — docs HOLD #3133 theater)
 *
 * Product/service Category (+ Add new category) is a SEPARATE path (qbo_categories catalog) and
 * must not be confused with GL account create.
 *
 * Usage:
 *   node scripts/verify-item-editor-account-addnew.mjs            # scan the real file
 *   node scripts/verify-item-editor-account-addnew.mjs --selftest # pure-logic selftest
 *
 * LINKAGE: forward ItemEditor default_*_account_id → catalogs.accounts; reverse CoA picker
 * list via getCoaAccounts. Additive only. Rule 17 — no package.json / CI workflow edits.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TARGET = "apps/frontend/src/pages/lists/accounting/ItemEditorModal.tsx";

/** Strip block/line/JSX comments so explanatory prose can't satisfy a check. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Isolate the picker JSX bound to a given form field (picker binding, not type defs). */
function pickerNearField(src, fieldName) {
  const needle = `value={form.${fieldName}}`;
  const idx = src.indexOf(needle);
  if (idx < 0) return "";
  return src.slice(Math.max(0, idx - 120), idx + 900);
}

/** @deprecated alias — kept for selftest fixtures that still name Combobox */
function comboboxNearField(src, fieldName) {
  return pickerNearField(src, fieldName);
}

/**
 * Slice around InlineCreateDrawer / QuickCreateEntityModal JSX used for account create.
 * Prefer the drawer/modal tag so kind= is in-window (handleAccountCreated also appears earlier).
 */
function accountCreateChrome(src) {
  for (const tag of ["InlineCreateDrawer", "QuickCreateEntityModal"]) {
    const idx = src.indexOf(`<${tag}`);
    if (idx >= 0) return src.slice(idx, idx + 500);
  }
  // Fallback: any mention of accountCreateSide near a create chrome open.
  const idx = src.indexOf("accountCreateSide !== null");
  if (idx >= 0) return src.slice(Math.max(0, idx - 120), idx + 400);
  return "";
}

/** The assertions, each a predicate over the comment-stripped source. */
function pickerHasAccountAddNew(picker) {
  // Preferred: ReferenceSelect createKind="account" (routes to InlineCreateDrawer / NewAccountDrawerForm).
  if (/<ReferenceSelect\b/.test(picker) && /createKind=["']account["']/.test(picker)) return true;
  // Legacy: Combobox allowAddNew + separate InlineCreateDrawer.
  return picker.includes("<Combobox") && /allowAddNew=\{\{\s*label:\s*"\+ Add new account"/.test(picker);
}

export function checksFor(src) {
  const incomePicker = pickerNearField(src, "incomeAccountId");
  const expensePicker = pickerNearField(src, "expenseAccountId");
  const chrome = accountCreateChrome(src);

  const usesReferenceSelectAccount =
    /createKind=["']account["']/.test(incomePicker) && /createKind=["']account["']/.test(expensePicker);

  const usesInlineAccountDrawer =
    /<InlineCreateDrawer\b/.test(src) &&
    /kind=["']account["']/.test(chrome) &&
    /onCreated=\{handleAccountCreated\}/.test(src);

  // Forbidden: account FK create chrome wired as category (HOLD #3133 root defect).
  const wrongCategoryKindForAccount =
    /<QuickCreateEntityModal\b/.test(src) &&
    /kind=["']category["']/.test(chrome) &&
    (/handleAccountCreated/.test(src) || /accountCreateSide/.test(src));

  return {
    incomeAllowAddNew: pickerHasAccountAddNew(incomePicker),
    expenseAllowAddNew: pickerHasAccountAddNew(expensePicker),
    // Nested create: ReferenceSelect(account) owns InlineCreateDrawer internally, OR explicit drawer.
    nestedAccountCreate: (usesReferenceSelectAccount || usesInlineAccountDrawer) && !wrongCategoryKindForAccount,
    noWrongCategoryKind: !wrongCategoryKindForAccount,
    refetchAfterCreate: /invalidateQueries[\s\S]{0,200}\["catalogs",\s*"accounts",\s*"for-items"/.test(src),
  };
}

const CHECK_LABELS = {
  incomeAllowAddNew:
    "PS-A — Income account picker exposes + Add new account (ReferenceSelect createKind=account or Combobox allowAddNew)",
  expenseAllowAddNew:
    "PS-A — Expense account picker exposes + Add new account (ReferenceSelect createKind=account or Combobox allowAddNew)",
  nestedAccountCreate:
    "PS-A — Nested create uses account chrome (ReferenceSelect createKind=account → InlineCreateDrawer / NewAccountDrawerForm)",
  noWrongCategoryKind:
    "PS-A — MUST NOT wire QuickCreateEntityModal kind=\"category\" for income/expense account create",
  refetchAfterCreate: "PS-A — Account list refetches after inline create (catalogs.accounts for-items query)",
};

export function run() {
  const full = path.join(repoRoot, TARGET);
  if (!fs.existsSync(full)) {
    console.error(`[verify-item-editor-account-addnew] FAIL — missing ${TARGET}`);
    return { ok: false, offenders: [`${TARGET} — MISSING`] };
  }
  const src = stripComments(fs.readFileSync(full, "utf8"));
  const results = checksFor(src);
  const offenders = Object.entries(results)
    .filter(([, ok]) => !ok)
    .map(([key]) => CHECK_LABELS[key]);
  if (offenders.length) {
    console.error("[verify-item-editor-account-addnew] FAIL — ItemEditor account picker parity regressed:");
    for (const f of offenders) console.error(`  - ${f}`);
    return { ok: false, offenders };
  }
  console.log(
    "[verify-item-editor-account-addnew] PASS — income/expense + Add new account opens InlineCreateDrawer kind=account",
  );
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const goodLegacy = `
    <Combobox
    value={form.incomeAccountId}
    onChange={(v) => set("incomeAccountId", v)}
    allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("income") }}
    <Combobox
    value={form.expenseAccountId}
    onChange={(v) => set("expenseAccountId", v)}
    allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("expense") }}
    function handleAccountCreated(rec) {
      void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
    }
    <InlineCreateDrawer open={accountCreateSide !== null} kind="account" onCreated={handleAccountCreated} />
  `;
  const goodReferenceSelect = `
    <ReferenceSelect
    value={form.incomeAccountId}
    onChange={(v) => set("incomeAccountId", v)}
    createKind="account"
    <ReferenceSelect
    value={form.expenseAccountId}
    onChange={(v) => set("expenseAccountId", v)}
    createKind="account"
    void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
  `;
  // Exact HOLD #3133 / main defect: label says account, chrome is category.
  const badWrongKind = `
    <Combobox
    value={form.incomeAccountId}
    onChange={(v) => set("incomeAccountId", v)}
    allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("income") }}
    <Combobox
    value={form.expenseAccountId}
    onChange={(v) => set("expenseAccountId", v)}
    allowAddNew={{ label: "+ Add new account", onAdd: () => setAccountCreateSide("expense") }}
    function handleAccountCreated(rec) {
      void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
    }
    <QuickCreateEntityModal open={accountCreateSide !== null} kind="category" onCreated={handleAccountCreated} />
  `;
  const badMissing = `
    <Combobox
    value={form.incomeAccountId}
    onChange={(v) => set("incomeAccountId", v)}
    allowClear
    <Combobox
    value={form.expenseAccountId}
    onChange={(v) => set("expenseAccountId", v)}
    allowClear
  `;
  const g = checksFor(stripComments(goodLegacy));
  const g2 = checksFor(stripComments(goodReferenceSelect));
  const w = checksFor(stripComments(badWrongKind));
  const b = checksFor(stripComments(badMissing));
  const failures = [];
  for (const key of Object.keys(CHECK_LABELS)) {
    if (!g[key]) failures.push(`good legacy fixture should PASS ${key}`);
    if (!g2[key]) failures.push(`good ReferenceSelect fixture should PASS ${key}`);
  }
  for (const key of ["nestedAccountCreate", "noWrongCategoryKind"]) {
    if (w[key]) failures.push(`wrong-kind fixture should FAIL ${key}`);
  }
  if (!w.incomeAllowAddNew || !w.expenseAllowAddNew) {
    failures.push("wrong-kind fixture should still have allowAddNew labels (isolates kind defect)");
  }
  for (const key of ["incomeAllowAddNew", "expenseAllowAddNew", "nestedAccountCreate", "refetchAfterCreate"]) {
    if (b[key]) failures.push(`missing-addnew fixture should FAIL ${key}`);
  }
  if (failures.length) {
    console.error("[verify-item-editor-account-addnew] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `[verify-item-editor-account-addnew] SELFTEST PASS — ${Object.keys(CHECK_LABELS).length} checks; wrong-kind fixture rejected`,
  );
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
