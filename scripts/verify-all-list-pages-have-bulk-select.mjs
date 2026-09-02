#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

/** Canonical entity list surfaces from AUDIT-FIX-1 (PASS 2 SF-1). */
const REQUIRED_BULK_FILES = [
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  "apps/frontend/src/pages/factoring/RecoursePipelineTable.tsx",
  "apps/frontend/src/pages/factoring/ChargebacksTable.tsx",
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
  "apps/frontend/src/pages/drivers/DriversTable.tsx",
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  "apps/frontend/src/components/FleetTable.tsx",
  "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx",
  "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx",
  "apps/frontend/src/pages/Users.tsx",
  "apps/frontend/src/components/catalogs/CatalogTable.tsx",
  // dispatch/components/LoadTable.tsx was deleted (orphan-triage batch 05) as a verified-dead
  // duplicate of DispatchBoard, the live dispatch loads table (already useBulkSelection-wired).
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/hooks/useBulkSelection.ts",
  "apps/frontend/src/components/shared/BulkSelectableTable.tsx",
];

const BULK_MARKERS = [
  "useBulkSelection",
  "BulkSelectableTable",
  // ParityTable's built-in bulk-select surface (selectable + batchActions renders the bulk-action bar).
  // Proven by ParityTable.test "supports selection → batch bar". A valid bulk mechanism, not an exemption.
  "batchActions",
  "from \"../../hooks/useBulkSelection\"",
  "from '../../hooks/useBulkSelection'",
  "from \"../hooks/useBulkSelection\"",
  "from '../hooks/useBulkSelection'",
  "from \"./bulk\"",
  "from './bulk'",
  "from \"../bulk\"",
  "from '../bulk'",
  "from \"../../components/bulk\"",
  "from '../../components/bulk'",
];

const EXEMPT_ANNOTATION = "intentionally-no-bulk-select";

function hasBulkWiring(source) {
  if (source.includes(EXEMPT_ANNOTATION)) return true;
  if (BULK_MARKERS.some((marker) => source.includes(marker))) return true;

  // Some pre-ParityTable surfaces implement the same complete interaction locally. Guard the
  // behavior, not a preferred helper name: state, row toggle, checkbox control, and a selected-row
  // action must all remain present. Omitting any leg fails closed.
  return ["selectedIds", "selectedRows", "toggleRow", 'type="checkbox"'].every((marker) =>
    source.includes(marker),
  );
}

if (process.argv.includes("--selftest")) {
  const complete = 'const [selectedIds] = useState(); const selectedRows = []; function toggleRow() {} <input type="checkbox" />';
  const cases = [
    ["complete local selection passes", complete, true],
    ["missing toggle fails", complete.replace("toggleRow", "changeRow"), false],
    ["missing selected rows fails", complete.replace("selectedRows", "visibleRows"), false],
    ["bare checkbox fails", '<input type="checkbox" />', false],
    ["canonical shared helper passes", "useBulkSelection()", true],
  ];
  for (const [name, source, expected] of cases) {
    if (hasBulkWiring(source) !== expected) {
      console.error(`[verify-all-list-pages-have-bulk-select] SELFTEST FAIL: ${name}`);
      process.exit(1);
    }
  }
  console.log(`[verify-all-list-pages-have-bulk-select] SELFTEST PASS (${cases.length}/${cases.length})`);
  process.exit(0);
}

const failures = [];

for (const rel of REQUIRED_BULK_FILES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing — create or update manifest path)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (!hasBulkWiring(source)) {
    failures.push(`${rel} (missing useBulkSelection / BulkSelectableTable)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-all-list-pages-have-bulk-select] FAIL:");
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(`[verify-all-list-pages-have-bulk-select] OK (${REQUIRED_BULK_FILES.length} canonical surfaces)`);
