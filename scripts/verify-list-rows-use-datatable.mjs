#!/usr/bin/env node
/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31 Part 2 guard.
 * List rows must use DataTable columns, not middot sentences.
 *
 * Checks the shared primitive and both driver-finance column-jam instances.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
// LEAD 443.99 class B (2026-10-12) — two anchors re-pinned, both to owner/finding-driven code changes.
//   old rule (a): SettlementsPage contains the identifier openDriverBillColumns.
//   new rule (a): SettlementsPage defines buildOpenDriverBillColumns(...): DataTableColumn<OpenDriverBill>[] and the
//                 Open Driver Bills <DataTable columns={columns}> renders its result.
//   why (a): Q22 (#22519, d1f9bae0d3) made the column set a factory so the Settlement/Presettlement column can read
//            the settlement references; same DataTable, same columns.
//   old rule (b): PreSettlementsPanel headers Date, Driver, Load Number, Settlement / Bill Number, Amount, Status.
//   new rule (b): Period Begin, Period End, Driver, Load Number, Settlement/Tour, Amount, Status.
//   why (b): COL-06 (4b2365beb6) split the one Date into the period's begin/end and the ALL-SEATS law renamed the
//            settlement column Settlement/Tour. Still every governed column, one more than before.
export const PRE_SETTLEMENT_HEADERS = ["Period Begin", "Period End", "Driver", "Load Number", "Settlement/Tour", "Amount", "Status"];

export function collectFailures({ dataTableExists, settlements, preSettlements, dataTable, duplicateExists }) {
  const failures = [];
  if (!dataTableExists) failures.push("canonical DataTable primitive missing at apps/frontend/src/components/DataTable.tsx");
  if (!settlements.includes('from "../../components/DataTable"')) {
    failures.push("SettlementsPage must import the canonical components/DataTable primitive");
  }
  if (!/function buildOpenDriverBillColumns\([^)]*\): DataTableColumn<OpenDriverBill>\[\]/.test(settlements) ||
      !/const columns = useMemo\(\(\) => buildOpenDriverBillColumns\(/.test(settlements) ||
      !/<DataTable\s+columns=\{columns\}/.test(settlements)) {
    failures.push("SettlementsPage must build the Open Driver Bills DataTable columns (buildOpenDriverBillColumns) and render them");
  }
  if (!preSettlements.includes('from "../DataTable"') || !preSettlements.includes("preSettlementColumns")) {
    failures.push("PreSettlementsPanel must use the canonical components/DataTable column primitive");
  }
  for (const header of PRE_SETTLEMENT_HEADERS) {
    if (!preSettlements.includes(`label: "${header}"`)) failures.push(`PreSettlementsPanel missing governed ${header} column`);
  }
  if (preSettlements.includes('<span className="text-gray-400">·</span>')) {
    failures.push("PreSettlementsPanel must not jam repeated row fields together with middots");
  }
  if (/OpenDriverBillsPanel[\s\S]*?flex flex-wrap items-center gap-1[\s\S]*?·[\s\S]*?Load/.test(settlements)) {
    failures.push("OpenDriverBillsPanel must NOT use the old column-jam flex layout (Driver · Load · Bill in one cell) — use DataTable");
  }
  if (!dataTable.includes("<thead")) failures.push("DataTable primitive must use <thead> convention");
  // GLB-02 (owner 2026-09-03): "grey-on-near-white did not differentiate" -- superseded to
  // ParityTable's own locked navy/white thead (docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md).
  // One token, everywhere: colors.tableHeaderBg/tableHeaderText, not a literal Tailwind class.
  if (!dataTable.includes("colors.tableHeaderBg") || !dataTable.includes("colors.tableHeaderText")) {
    failures.push("DataTable primitive must use the canonical colors.tableHeaderBg/tableHeaderText thead standard (GLB-02, supersedes bg-gray-50)");
  }
  if (!dataTable.includes("aria-sort") || !dataTable.includes("column.sortValue")) {
    failures.push("DataTable sortable columns must render an operable, accessible sort control");
  }
  if (duplicateExists) failures.push("duplicate shared/DataTable primitive must not exist; consolidate on components/DataTable");
  return failures;
}

const exists = (p) => { try { readFileSync(p, "utf8"); return true; } catch { return false; } };
const dataTablePath = path.join(root, "apps/frontend/src/components/DataTable.tsx");
const SOURCES = {
  dataTableExists: exists(dataTablePath),
  settlements: readFileSync(path.join(root, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx"), "utf8"),
  preSettlements: readFileSync(path.join(root, "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx"), "utf8"),
  dataTable: exists(dataTablePath) ? readFileSync(dataTablePath, "utf8") : "",
  duplicateExists: exists(path.join(root, "apps/frontend/src/components/shared/DataTable.tsx")),
};

if (process.argv.includes("--selftest")) {
  const plants = [
    ["open driver bills columns removed", { settlements: SOURCES.settlements.replaceAll("buildOpenDriverBillColumns", "REMOVED_COLUMNS") }],
    ["open driver bills table not rendering the columns", { settlements: SOURCES.settlements.replace(/<DataTable\s+columns=\{columns\}/, "<DataTable columns={[]}") }],
    ["pre-settlement Settlement/Tour column dropped", { preSettlements: SOURCES.preSettlements.replace('label: "Settlement/Tour"', 'label: "Ref"') }],
    ["pre-settlement period end dropped", { preSettlements: SOURCES.preSettlements.replace('label: "Period End"', 'label: "End"') }],
    ["middot column jam", { preSettlements: SOURCES.preSettlements + '\n<span className="text-gray-400">·</span>' }],
    ["sort control unaccessible", { dataTable: SOURCES.dataTable.replaceAll("aria-sort", "aria-disabled") }],
    ["duplicate primitive", { duplicateExists: true }],
  ];
  const escaped = plants.filter(([, patch]) => collectFailures({ ...SOURCES, ...patch }).length === 0).map(([n]) => n);
  const clean = collectFailures(SOURCES);
  if (escaped.length || clean.length) {
    console.error(`verify-list-rows-use-datatable selftest FAIL — escaped: ${escaped.join(", ") || "none"}; clean flagged: ${clean.join("; ") || "none"}`);
    process.exit(1);
  }
  console.log(`verify-list-rows-use-datatable selftest: ${plants.length}/${plants.length} planted violations caught`);
  process.exit(0);
}

const failures = collectFailures(SOURCES);

if (failures.length) {
  console.error("verify-list-rows-use-datatable FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-list-rows-use-datatable: OK — OpenDriverBillsPanel uses DataTable columns (not middot column-jam)");
process.exit(0);
