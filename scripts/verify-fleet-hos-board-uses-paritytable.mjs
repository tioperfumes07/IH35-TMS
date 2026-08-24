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
  if (!/onRowClick=\{\(row\) => navigate\(`\/fleet\/units\/\$\{row\.unit_id\}`\)\}/.test(src)) {
    errors.push(`${PAGE}: must preserve row drill-through to fleet unit detail`);
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
  const bad = `
    export function FleetHosBoardSection() {
      return <table><thead><tr><th>Unit</th></tr></thead></table>;
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 8) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
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
