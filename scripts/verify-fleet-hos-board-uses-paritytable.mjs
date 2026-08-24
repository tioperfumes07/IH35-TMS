#!/usr/bin/env node
/**
 * verify-fleet-hos-board-uses-paritytable — qbo-parity-a1 (FleetHosBoardSection)
 *
 * The live and offline Fleet HOS tables must use the shared ParityTable grammar
 * while preserving search, row drill-through, stale segregation, Excel export,
 * loading/empty states, and a retryable query error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-hos-board-uses-paritytable";
const PAGE = "apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx";

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import shared ParityTable`);
  }
  if (!src.includes('from "../../components/ListErrorState"')) {
    errors.push(`${PAGE}: must import ListErrorState`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 2) {
    errors.push(`${PAGE}: expected live + offline <ParityTable> uses, found ${parityUses}`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled table markup`);
  }
  if (!src.includes("<ListErrorState")) {
    errors.push(`${PAGE}: query failures must render ListErrorState`);
  }
  for (const required of [
    'label: "Unit"',
    'label: "Driver"',
    'label: "Last Update (Laredo)"',
    'label: "Drive Rem (11h)"',
    'label: "Shift Rem (14h)"',
    'label: "HOS"',
    'label: "Map"',
    'storageKey="compliance-fleet-hos"',
    'storageKey="compliance-fleet-hos-offline"',
    'emptyText="No reporting vehicles."',
    'tableTestId="compliance-fleet-hos-table"',
    'tableTestId="compliance-fleet-hos-offline-table"',
    "filterBar={",
    "downloadFleetLocationHosXlsx",
    "Offline / stale (",
  ]) {
    if (!src.includes(required)) {
      errors.push(`${PAGE}: missing preserved ParityTable contract: ${required}`);
    }
  }
  const rowDrills = (src.match(/onRowClick=\{\(row\) => navigate\(`\/fleet\/units\/\$\{row\.unit_id\}`\)\}/g) ?? []).length;
  if (rowDrills < 2) {
    errors.push(`${PAGE}: must preserve live + offline row drill-through to fleet unit detail`);
  }
  if (!/async function exportFleetHos\(\)[\s\S]*await downloadFleetLocationHosXlsx\(companyId\)[\s\S]*setExportError\(error instanceof Error \? error\.message : "Fleet HOS export failed"\)/.test(src)) {
    errors.push(`${PAGE}: Excel export must surface rejected downloads`);
  }
  if (!/disabled=\{exportPending\}[\s\S]*onClick=\{\(\) => void exportFleetHos\(\)\}/.test(src)) {
    errors.push(`${PAGE}: Excel export must prevent duplicate pending downloads`);
  }
  if (!/role="alert"[\s\S]*\{exportError\}/.test(src)) {
    errors.push(`${PAGE}: Excel export error must render accessibly`);
  }
  if (/downloadFleetLocationHosXlsx\(companyId\)\.catch\(\(\) => undefined\)/.test(src)) {
    errors.push(`${PAGE}: Excel export must not swallow failures`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    const columns = [
      { label: "Unit" }, { label: "Driver" }, { label: "Last Update (Laredo)" },
      { label: "Drive Rem (11h)" }, { label: "Shift Rem (14h)" }, { label: "HOS" }, { label: "Map" },
    ];
    async function exportFleetHos() {
      try { await downloadFleetLocationHosXlsx(companyId); }
      catch (error) { setExportError(error instanceof Error ? error.message : "Fleet HOS export failed"); }
    }
    Offline / stale (
    <ListErrorState />
    <ParityTable
      storageKey="compliance-fleet-hos"
      emptyText="No reporting vehicles."
      tableTestId="compliance-fleet-hos-table"
      filterBar={<><input /><button disabled={exportPending} onClick={() => void exportFleetHos()} /><p role="alert">{exportError}</p></>}
      onRowClick={(row) => navigate(\`/fleet/units/\${row.unit_id}\`)}
    />
    <ParityTable
      storageKey="compliance-fleet-hos-offline"
      tableTestId="compliance-fleet-hos-offline-table"
      onRowClick={(row) => navigate(\`/fleet/units/\${row.unit_id}\`)}
    />
  `;
  const goodErrors = assertMigrated(good);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  const mutations = [
    ['from "../../components/parity/ParityTable"', 'from "./LegacyTable"', "import shared ParityTable"],
    ['from "../../components/ListErrorState"', 'from "./LegacyError"', "import ListErrorState"],
    ["<ParityTable", "<LegacyTable", "expected live + offline"],
    ["const columns", "<table></table> const columns", "hand-rolled table"],
    ["<ListErrorState", "<LegacyErrorState", "query failures must render"],
    ['label: "Unit"', 'label: "Vehicle"', 'label: "Unit"'],
    ['label: "Driver"', 'label: "Operator"', 'label: "Driver"'],
    ['label: "Last Update (Laredo)"', 'label: "Last Update"', 'label: "Last Update (Laredo)"'],
    ['label: "Drive Rem (11h)"', 'label: "Drive"', 'label: "Drive Rem (11h)"'],
    ['label: "Shift Rem (14h)"', 'label: "Shift"', 'label: "Shift Rem (14h)"'],
    ['label: "HOS"', 'label: "Hours"', 'label: "HOS"'],
    ['label: "Map"', 'label: "Location"', 'label: "Map"'],
    ['storageKey="compliance-fleet-hos"', 'storageKey="wrong-live"', 'storageKey="compliance-fleet-hos"'],
    ['storageKey="compliance-fleet-hos-offline"', 'storageKey="wrong-offline"', 'storageKey="compliance-fleet-hos-offline"'],
    ['emptyText="No reporting vehicles."', 'emptyText="None"', 'emptyText="No reporting vehicles."'],
    ['tableTestId="compliance-fleet-hos-table"', 'tableTestId="wrong-live"', 'tableTestId="compliance-fleet-hos-table"'],
    ['tableTestId="compliance-fleet-hos-offline-table"', 'tableTestId="wrong-offline"', 'tableTestId="compliance-fleet-hos-offline-table"'],
    ["filterBar={", "toolbar={", "filterBar={"],
    ["downloadFleetLocationHosXlsx", "downloadWrongExport", "downloadFleetLocationHosXlsx"],
    ["Offline / stale (", "Offline (", "Offline / stale ("],
    ["onRowClick", "onOfflineRowClick", "live + offline row drill-through"],
    ['setExportError(error instanceof Error ? error.message : "Fleet HOS export failed")', "setExportError(undefined)", "surface rejected downloads"],
    ["disabled={exportPending}", "disabled={false}", "prevent duplicate pending downloads"],
    ['role="alert"', 'role="status"', "render accessibly"],
    ["async function exportFleetHos()", 'async function exportFleetHos() { downloadFleetLocationHosXlsx(companyId).catch(() => undefined); } function oldExport()', "must not swallow failures"],
  ];
  for (const [from, to, expected] of mutations) {
    const errors = assertMigrated(good.replace(from, to));
    if (!errors.some((error) => error.includes(expected))) {
      console.error(`${LABEL} --selftest FAIL mutation ${from}: expected ${expected}`, errors);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length}/${mutations.length} ParityTable/drill/export/error defects detected`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
