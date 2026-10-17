#!/usr/bin/env node
/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31 Part 2 guard.
 * List rows must use shared table columns, not middot sentences.
 *
 * LEAD 443.181 (owner 2026-10-16: "all tables built the same way") — both surfaces moved from the retired
 * components/DataTable onto the ONE shared table, components/parity/ParityTable. Same columns, same
 * factory, same governed headers; the primitive checks below now point at ParityTable.
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
  if (!dataTableExists) failures.push("canonical ParityTable primitive missing at apps/frontend/src/components/parity/ParityTable.tsx");
  if (!settlements.includes('from "../../components/parity/ParityTable"')) {
    failures.push("SettlementsPage must import the canonical components/parity/ParityTable primitive");
  }
  if (!/function buildOpenDriverBillColumns\([^)]*\): ParityColumn<OpenDriverBill>\[\]/.test(settlements) ||
      !/const columns = useMemo\(\(\) => buildOpenDriverBillColumns\(/.test(settlements) ||
      !/<ParityTable\s+storageKey="[^"]+"\s+columns=\{columns\}/.test(settlements)) {
    failures.push("SettlementsPage must build the Open Driver Bills ParityTable columns (buildOpenDriverBillColumns) and render them");
  }
  if (!preSettlements.includes('from "../parity/ParityTable"') || !preSettlements.includes("preSettlementColumns")) {
    failures.push("PreSettlementsPanel must use the canonical components/parity/ParityTable column primitive");
  }
  for (const header of PRE_SETTLEMENT_HEADERS) {
    if (!preSettlements.includes(`label: "${header}"`)) failures.push(`PreSettlementsPanel missing governed ${header} column`);
  }
  if (preSettlements.includes('<span className="text-gray-400">·</span>')) {
    failures.push("PreSettlementsPanel must not jam repeated row fields together with middots");
  }
  if (/OpenDriverBillsPanel[\s\S]*?flex flex-wrap items-center gap-1[\s\S]*?·[\s\S]*?Load/.test(settlements)) {
    failures.push("OpenDriverBillsPanel must NOT use the old column-jam flex layout (Driver · Load · Bill in one cell) — use ParityTable");
  }
  if (!dataTable.includes("<thead")) failures.push("ParityTable primitive must use <thead> convention");
  // GLB-02 (owner 2026-09-03): "grey-on-near-white did not differentiate" -- superseded to
  // ParityTable's own locked navy/white thead (docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md).
  // One token, everywhere: colors.tableHeaderBg/tableHeaderText, not a literal Tailwind class.
  if (!dataTable.includes("colors.tableHeaderBg") || !dataTable.includes("colors.tableHeaderText")) {
    failures.push("ParityTable primitive must use the canonical colors.tableHeaderBg/tableHeaderText thead standard (GLB-02, supersedes bg-gray-50)");
  }
  if (!dataTable.includes("onClick={() => toggleSort(key)}") || !dataTable.includes("column.sortValue")) {
    failures.push("ParityTable sortable columns must render an operable sort control (header <button> + column.sortValue)");
  }
  if (duplicateExists) failures.push("duplicate shared/DataTable primitive must not exist; consolidate on components/parity/ParityTable");
  return failures;
}

const exists = (p) => { try { readFileSync(p, "utf8"); return true; } catch { return false; } };
const dataTablePath = path.join(root, "apps/frontend/src/components/parity/ParityTable.tsx");
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
    ["open driver bills table not rendering the columns", { settlements: SOURCES.settlements.replace(/(<ParityTable\s+storageKey="[^"]+"\s+)columns=\{columns\}/, "$1columns={[]}") }],
    ["pre-settlement Settlement/Tour column dropped", { preSettlements: SOURCES.preSettlements.replace('label: "Settlement/Tour"', 'label: "Ref"') }],
    ["pre-settlement period end dropped", { preSettlements: SOURCES.preSettlements.replace('label: "Period End"', 'label: "End"') }],
    ["middot column jam", { preSettlements: SOURCES.preSettlements + '\n<span className="text-gray-400">·</span>' }],
    ["sort control inoperable", { dataTable: SOURCES.dataTable.replaceAll("onClick={() => toggleSort(key)}", "onClick={undefined}") }],
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

console.log("verify-list-rows-use-datatable: OK — OpenDriverBillsPanel uses ParityTable columns (not middot column-jam)");
process.exit(0);
