#!/usr/bin/env node
/**
 * Customers Transaction List Filter — staged Apply/Cancel/Reset (CLS-FILTER-GEAR-APPLY).
 *
 * FAIL: Filter panel binds Status/Date/Category to live state with no Apply/Cancel/Reset
 *       (AUDIT 2610 / LV-CUSTOMERS-TRANSACTION-FILTER-NO-STAGED-APPLY).
 * PASS: useStagedListFilters + CollapsedListFilters onApply/onReset/onCancel; draft fields only.
 *
 * Self-test: node scripts/verify-customers-transaction-filter-staged-apply.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-transaction-filter-staged-apply";
const PAGE = path.join(ROOT, "apps/frontend/src/pages/Customers.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(PAGE, "utf8");
  assert(/txFilters\s*=\s*useStagedListFilters/.test(src), "Customers.tsx must define txFilters via useStagedListFilters");
  assert(
    /data-customers-tx-filter-toolbar["']\s*:\s*["']collapsed["']/.test(src) || /data-customers-tx-filter-toolbar=["']collapsed["']/.test(src),
    "Transaction Filters must use CollapsedListFilters (data-customers-tx-filter-toolbar)",
  );
  assert(/onApply=\{txFilters\.apply\}/.test(src), "CollapsedListFilters must wire onApply={txFilters.apply}");
  assert(/onReset=\{txFilters\.reset\}/.test(src), "CollapsedListFilters must wire onReset={txFilters.reset}");
  assert(/onCancel=\{txFilters\.cancel\}/.test(src), "CollapsedListFilters must wire onCancel={txFilters.cancel}");
  assert(/txFilters\.draft\.statusFilter/.test(src), "Status control must bind draft.statusFilter, not live statusFilter");
  assert(/txFilters\.draft\.dateFrom/.test(src), "DateFrom must bind draft.dateFrom");
  assert(/txFilters\.draft\.dateTo/.test(src), "DateTo must bind draft.dateTo");
  assert(/txFilters\.draft\.categoryFilter/.test(src), "Category must bind draft.categoryFilter");
  assert(/txFilters\.draft\.typeFilter/.test(src), "Type control must bind draft.typeFilter, not live typeFilter");
  assert(
    /applied:\s*\{[^}]*typeFilter/.test(src) && /setTypeFilter\(next\.typeFilter\)/.test(src),
    "typeFilter must be staged through useStagedListFilters onApply",
  );
  // Ban the pre-fix live-bind pattern inside a custom showFilterBox panel.
  assert(!/setShowFilterBox/.test(src), "Must not use ad-hoc showFilterBox for transaction filters");
  assert(
    !/<SelectCombobox value=\{statusFilter\} onChange=\{\(event\) => setStatusFilter/.test(src),
    "Status must not live-bind setStatusFilter inside the filter panel",
  );
  assert(
    !/<SelectCombobox value=\{typeFilter\} onChange=\{\(event\) => setTypeFilter/.test(src),
    "Type must not live-bind setTypeFilter outside staged draft",
  );
}

function selftest() {
  const original = fs.readFileSync(PAGE, "utf8");
  const broken = original
    .replace(/onApply=\{txFilters\.apply\}/, "onApply={() => {}}")
    .replace(/txFilters\.draft\.statusFilter/g, "statusFilter");
  fs.writeFileSync(PAGE, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(PAGE, original);
  }
  assert(failed, "--selftest expected FAIL when Apply wiring / draft binding is mutated away");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
