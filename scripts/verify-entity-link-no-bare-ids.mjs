#!/usr/bin/env node
/**
 * verify-entity-link-no-bare-ids.mjs
 *
 * Guards against regression where entity id columns are rendered as plain text
 * instead of using <EntityLink>. Scans table cell patterns that are known to be
 * entity id columns and ensures they are wrapped in EntityLink or a Link/anchor.
 *
 * Pattern: a <td> or table cell that renders a bare `*_id` field directly via
 * String(row.xxx_id) or {row.xxx_id} without a Link wrapper.
 *
 * This guard runs on files listed in MONITORED_FILES. When a new file is added
 * to the list and it has bare id columns, add <EntityLink> first — never expand
 * this list to "allow" a file that still has bare ids.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const BARE_ID_PATTERNS = [
  // String(row.load_id) / String(row.driver_id) / etc inside JSX without a Link
  /\{String\(row\.(load|driver|customer|vendor|unit|trailer|bill|invoice|payment|settlement|work_order|journal_entry)_id\s*\??\.?\s*\)\s*\}/g,
  // {row.load_id} directly (not inside a Link prop)
  /(?<!to=`[^`]*)(?<!href=`[^`]*)\{row\.(load|driver|customer|vendor|unit|trailer|bill|invoice|payment|settlement|work_order|journal_entry)_id\s*\?\?\s*["'][—-]["']\}/g,
];

const EXEMPT_ANNOTATION = "entity-link-exempt";

const MONITORED_FILES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
  "apps/frontend/src/pages/drivers/DriversTable.tsx",
  "apps/frontend/src/components/FleetTable.tsx",
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx",
  "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
  "apps/frontend/src/pages/accounting/AccountsReceivableAgingPage.tsx",
];

const failures = [];

for (const rel of MONITORED_FILES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  const source = fs.readFileSync(full, "utf8");
  if (source.includes(EXEMPT_ANNOTATION)) continue;
  for (const pattern of BARE_ID_PATTERNS) {
    const matches = [...source.matchAll(pattern)];
    for (const match of matches) {
      failures.push(`${rel}: bare id cell "${match[0].trim()}" — wrap with <EntityLink>`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify-entity-link-no-bare-ids] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-entity-link-no-bare-ids] OK — ${MONITORED_FILES.length} files checked, no bare id cells`);
