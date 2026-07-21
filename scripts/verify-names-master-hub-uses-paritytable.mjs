#!/usr/bin/env node
/**
 * verify-names-master-hub-uses-paritytable — qbo-parity-a1 (Names Master hub results surface)
 *
 * The Names Master cross-module search results grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns Type / Name / Email /
 * Phone / QBO ID preserved; the per-row Open navigate button and the empty copy preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-names-master-hub-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx";

const REQUIRED_LABELS = ["Type", "Name", "Email", "Phone", "QBO ID"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on names search query failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="names-master-hub"')) {
    errors.push(`${PAGE}: must set storageKey="names-master-hub"`);
  }
  if (!src.includes('tableTestId="names-master-hub-table"')) {
    errors.push(`${PAGE}: must set tableTestId="names-master-hub-table"`);
  }
  if (!src.includes("Couldn't load names")) {
    errors.push(`${PAGE}: must keep ListErrorState title for names search outage`);
  }
  if (!src.includes("No results. Try a search term.")) {
    errors.push(`${PAGE}: must keep emptyText for empty search results`);
  }
  if (!src.includes("link_to_module_page")) {
    errors.push(`${PAGE}: must keep the per-row Open navigate to link_to_module_page`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "entity_type", label: "Type" },
      { key: "display_name", label: "Name" },
      { key: "primary_email", label: "Email" },
      { key: "primary_phone", label: "Phone" },
      { key: "qbo_id", label: "QBO ID" },
      { key: "open", label: "", render: (row) => <button onClick={() => navigate(row.link_to_module_page)}>Open</button> },
    ];
    <ListErrorState title="Couldn't load names" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="names-master-hub"
      tableTestId="names-master-hub-table"
      emptyText="No results. Try a search term."
    />
  `;
  const bad = `
    export function NamesMasterHub() {
      return (
        <div>
          <table><thead><tr><th>Type</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
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
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
