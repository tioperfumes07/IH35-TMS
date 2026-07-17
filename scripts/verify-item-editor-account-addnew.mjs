#!/usr/bin/env node
/**
 * verify-item-editor-account-addnew.mjs  (PS-A — ItemEditor income/expense account pickers)
 *
 * Locks QBO-parity nested "+ Add new account" on ItemEditorModal's Income and Expense account
 * Combobox pickers. Without allowAddNew, operators must leave the item editor to create a GL
 * account — unlike Bills, Expense, and Banking categorize rows (ReferenceSelect / QuickCreate).
 *
 * Usage:
 *   node scripts/verify-item-editor-account-addnew.mjs            # scan the real file
 *   node scripts/verify-item-editor-account-addnew.mjs --selftest # pure-logic selftest
 *
 * LINKAGE: N/A (frontend regression guard). Additive only.
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

/** Isolate the Combobox JSX bound to a given form field (picker binding, not type defs). */
function comboboxNearField(src, fieldName) {
  const needle = `value={form.${fieldName}}`;
  const idx = src.indexOf(needle);
  if (idx < 0) return "";
  return src.slice(Math.max(0, idx - 120), idx + 900);
}

/** The four assertions, each a predicate over the comment-stripped source. */
export function checksFor(src) {
  const incomePicker = comboboxNearField(src, "incomeAccountId");
  const expensePicker = comboboxNearField(src, "expenseAccountId");

  return {
    incomeAllowAddNew:
      incomePicker.includes("<Combobox") && /allowAddNew=\{\{\s*label:\s*"\+ Add new account"/.test(incomePicker),
    expenseAllowAddNew:
      expensePicker.includes("<Combobox") && /allowAddNew=\{\{\s*label:\s*"\+ Add new account"/.test(expensePicker),
    nestedAccountCreate:
      /QuickCreateEntityModal/.test(src) &&
      /kind="category"/.test(src) &&
      /handleAccountCreated|onCreated=\{handleAccountCreated\}/.test(src),
    refetchAfterCreate: /invalidateQueries[\s\S]{0,200}\["catalogs",\s*"accounts",\s*"for-items"/.test(src),
  };
}

const CHECK_LABELS = {
  incomeAllowAddNew: "PS-A — Income account Combobox exposes allowAddNew (+ Add new account)",
  expenseAllowAddNew: "PS-A — Expense account Combobox exposes allowAddNew (+ Add new account)",
  nestedAccountCreate:
    "PS-A — Nested create uses QuickCreateEntityModal kind=\"category\" (same chrome as other accounting surfaces)",
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
  console.log("[verify-item-editor-account-addnew] PASS — income/expense account pickers have nested + Add new");
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `
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
  const bad = `
    <Combobox
    value={form.incomeAccountId}
    onChange={(v) => set("incomeAccountId", v)}
    allowClear
    <Combobox
    value={form.expenseAccountId}
    onChange={(v) => set("expenseAccountId", v)}
    allowClear
  `;
  const g = checksFor(stripComments(good));
  const b = checksFor(stripComments(bad));
  const failures = [];
  for (const key of Object.keys(CHECK_LABELS)) {
    if (!g[key]) failures.push(`good fixture should PASS ${key}`);
    if (b[key]) failures.push(`bad fixture should FAIL ${key}`);
  }
  if (failures.length) {
    console.error("[verify-item-editor-account-addnew] SELFTEST FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`[verify-item-editor-account-addnew] SELFTEST PASS — ${Object.keys(CHECK_LABELS).length} checks flag regressions`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
