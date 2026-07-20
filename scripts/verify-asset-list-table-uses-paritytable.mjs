#!/usr/bin/env node
/**
 * verify-asset-list-table-uses-paritytable — qbo-parity-a1 (AssetListTable surface)
 *
 * Assets register must use shared ParityTable grammar (sort/resize/gear), not hand-rolled
 * <table>. Workspace must call real GET /api/v1/assets and surface ListErrorState on failure
 * (never silent demo FALLBACK_ROWS).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-asset-list-table-uses-paritytable";
const TABLE = "apps/frontend/src/components/assets/AssetListTable.tsx";
const PAGE = "apps/frontend/src/pages/assets/AssetsWorkspacePage.tsx";

const REQUIRED_LABELS = [
  "Unit",
  "Type",
  "Lifecycle",
  "Driver",
  "Assigned load",
  "Location",
  "Utilization",
];

function assertTable(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${TABLE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${TABLE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${TABLE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${TABLE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${TABLE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes("No assets found for this filter.")) {
    errors.push(`${TABLE}: must keep emptyText for filtered-empty register`);
  }
  if (!src.includes("assets-register-row-")) {
    errors.push(`${TABLE}: must preserve rowTestId prefix assets-register-row-`);
  }
  return errors;
}

function assertPage(src) {
  const errors = [];
  if (!src.includes("/api/v1/assets?")) {
    errors.push(`${PAGE}: must fetch GET /api/v1/assets (real list route)`);
  }
  if (/resolveApiUrl\(\s*[`'"]\/api\/v1\/assets\/list/.test(src) || /fetch\([^)]*\/api\/v1\/assets\/list/.test(src)) {
    errors.push(`${PAGE}: must not call nonexistent /api/v1/assets/list`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if (/\bFALLBACK_ROWS\b/.test(src)) {
    errors.push(`${PAGE}: must not keep demo FALLBACK_ROWS (false-empty / prod fake data)`);
  }
  if (!src.includes('payload.assets')) {
    errors.push(`${PAGE}: must map response.assets from GET /api/v1/assets`);
  }
  return errors;
}

function assertMigrated(tableSrc, pageSrc) {
  return [...assertTable(tableSrc), ...assertPage(pageSrc)];
}

function selftest() {
  const goodTable = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const COLUMNS = [
      { key: "unit_number", label: "Unit" },
      { key: "kind", label: "Type" },
      { key: "lifecycle", label: "Lifecycle" },
      { key: "assigned_driver_name", label: "Driver" },
      { key: "assigned_load_display", label: "Assigned load" },
      { key: "location_label", label: "Location" },
      { key: "utilization_score", label: "Utilization" },
    ];
    <ParityTable emptyText="No assets found for this filter." rowTestId={(row) => \`assets-register-row-\${row.id}\`} />
  `;
  const goodPage = `
    import { ListErrorState } from "../../components/ListErrorState";
    fetch(resolveApiUrl(\`/api/v1/assets?\${params}\`));
    const payload = { assets: [] };
    return payload.assets.map(mapBackendAsset);
    <ListErrorState title="Couldn't load assets" onRetry={retry} />
  `;
  const badTable = `
    <table className="min-w-full"><thead><tr><th>Unit</th></tr></thead></table>
  `;
  const badPage = `
    fetch(resolveApiUrl("/api/v1/assets/list?" + params));
    const FALLBACK_ROWS = [];
    setRows(FALLBACK_ROWS);
  `;
  if (assertMigrated(goodTable, goodPage).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected`);
    process.exit(1);
  }
  const badErrors = assertMigrated(badTable, badPage);
  if (!badErrors.some((e) => e.includes("hand-rolled") || e.includes("ParityTable") || e.includes("assets/list") || e.includes("FALLBACK"))) {
    console.error(`${LABEL} SELFTEST FAILED — bad fixture not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const tableSrc = fs.readFileSync(path.join(ROOT, TABLE), "utf8");
const pageSrc = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const errors = assertMigrated(tableSrc, pageSrc);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — AssetListTable uses ParityTable; AssetsWorkspace wired to /api/v1/assets + ListErrorState`);
process.exit(0);
