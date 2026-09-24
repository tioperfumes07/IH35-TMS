#!/usr/bin/env node
// FILTER-MULTI-01 (owner, ROUND E11/E13 series) — every money list gets ONE always-visible
// toolbar: one search, one gear, one date-range control, every filter a visible dropdown, real
// multi-select (checkbox dropdown, "Label (N)" closed label) on the fields that are naturally
// multi-valued. `CollapsedListFilters`' click-to-reveal "Filters (N)" popover is the dead-on-click
// defect this whole sweep replaces.
//
// REGISTRY, not a whole-tree scan — this sweep is in progress (4 of 12 named pages done as of this
// guard's introduction: Bills, Expenses, Invoices, Banking). A page joins REGISTERED_PAGES only
// once it is actually retrofitted; Required: 0 against the registry, not against every money list
// that might ever exist — the same incremental-adoption shape verify-money-module-design.mjs and
// go26-consolidation-baseline.json already use in this repo. Adding a page here without doing the
// retrofit first would just make this guard permanently red; the discipline is the other order.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-list-toolbar-one-and-multiselect";

const REGISTERED_PAGES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
];

// Pages named in the packet but NOT yet retrofitted — tracked here so a reviewer can see the real
// remaining scope in one place, not scattered across commit messages. Never auto-checked; adding a
// page to REGISTERED_PAGES above (after retrofitting it) is what turns enforcement on.
const KNOWN_NOT_YET_DONE = [
  "Load Costs (LoadCostsBoardPage.tsx)",
  "Settlements (SettlementsPage.tsx)",
  "Factoring (FactoringListPage.tsx)",
  "Fuel (FuelTransactionsTable.tsx)",
  "Customers",
  "Vendors",
];

const fail = (m) => {
  console.error(`\n${LABEL}: FAIL — ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`${LABEL}: ${m}`);

function read(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

const violations = [];

for (const rel of REGISTERED_PAGES) {
  const source = read(rel);
  if (source === null) {
    violations.push(`${rel} is registered but does not exist — remove it from REGISTERED_PAGES or restore the file.`);
    continue;
  }

  // (1) the dead-popover pattern must be gone.
  if (/\bCollapsedListFilters\b/.test(source)) {
    violations.push(`${rel} still imports/uses CollapsedListFilters — the "Filters (N)" popover, the dead-on-click defect this sweep replaces. Use MoneyListToolbar instead.`);
  }

  // (2) at least one real multi-select must be present — the checkbox-dropdown pattern, not a
  // button/chip row or bare native <select> standing in for a filter.
  if (!/\bMultiSelectDropdown\b/.test(source)) {
    violations.push(`${rel} has no MultiSelectDropdown usage at all — every registered page must have at least one real multi-select filter.`);
  }

  // (3) duplicate search: a page that renders its own search box (via MoneyListToolbar, which
  // always takes a `search` prop) must suppress ParityTable's own native search.
  const ownsSearch = /\bMoneyListToolbar\b/.test(source);
  const suppressesSearch = /suppressToolbarSearch/.test(source);
  if (ownsSearch && !suppressesSearch) {
    violations.push(`${rel} mounts MoneyListToolbar (its own search box) but never passes suppressToolbarSearch to ParityTable — two competing search inputs.`);
  }

  // (4) duplicate date range: a page that renders its own DateRangePresets must suppress
  // ParityTable's own native Range popover.
  const ownsRange = /\bDateRangePresets\b/.test(source);
  const suppressesRange = /suppressToolbarRange/.test(source);
  if (ownsRange && !suppressesRange) {
    violations.push(`${rel} mounts DateRangePresets (its own date range) but never passes suppressToolbarRange to ParityTable — two competing range controls.`);
  }
}

if (violations.length) {
  fail(`${violations.length} problem(s) on registered money list(s):\n` + violations.map((v) => `    ${v}`).join("\n"));
}

if (process.argv.includes("--selftest")) {
  console.log(`${LABEL} SELFTEST — structural checks only; the real run above is the live verdict.`);
}

ok(
  `PASS — ${REGISTERED_PAGES.length} registered page(s) clean (no CollapsedListFilters, at least one ` +
    `real multi-select each, no duplicate search/range). ${KNOWN_NOT_YET_DONE.length} page(s) not yet ` +
    `retrofitted, not yet registered, not yet enforced: ${KNOWN_NOT_YET_DONE.join(", ")}.`,
);
