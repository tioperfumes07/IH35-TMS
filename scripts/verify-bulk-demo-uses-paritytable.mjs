#!/usr/bin/env node
/**
 * verify-bulk-demo-uses-paritytable — qbo-parity-a1 (BulkDemoPage surface)
 *
 * Dev-only bulk-components demo must use shared ParityTable grammar
 * (sort/resize/gear/select-all + batch bar), not a hand-rolled <table>.
 * Mock static rows (no query failure path → no ListErrorState). BulkActionModal +
 * BulkProgressDialog + bulkUpdate demo call preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bulk-demo-uses-paritytable";
const PAGE = "apps/frontend/src/pages/dev/BulkDemoPage.tsx";

const REQUIRED_LABELS = ["Name", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
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
  if (!src.includes('storageKey="dev-bulk-demo"')) {
    errors.push(`${PAGE}: must set storageKey="dev-bulk-demo"`);
  }
  if (!src.includes("selectable")) {
    errors.push(`${PAGE}: must enable ParityTable selectable batch mode`);
  }
  if (!src.includes("maxSelectable={200}")) {
    errors.push(`${PAGE}: must set maxSelectable={200}`);
  }
  if (!src.includes("batchActions")) {
    errors.push(`${PAGE}: must wire batchActions for Set inactive demo action`);
  }
  if (!src.includes("BulkActionModal")) {
    errors.push(`${PAGE}: must keep BulkActionModal for reason-gated confirm`);
  }
  if (!src.includes("BulkProgressDialog")) {
    errors.push(`${PAGE}: must keep BulkProgressDialog for bulk result feedback`);
  }
  if (!src.includes('domain: "demo"') || !src.includes('resource: "items"')) {
    errors.push(`${PAGE}: must preserve bulkUpdate demo domain/resource call`);
  }
  if (!src.includes('emptyText="No demo rows."')) {
    errors.push(`${PAGE}: must keep emptyText for empty demo rows`);
  }
  if (src.includes("TableSelection") || src.includes("BulkActionBar")) {
    errors.push(`${PAGE}: must not use legacy TableSelection/BulkActionBar (ParityTable owns selection chrome)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { bulkUpdate } from "../../api/bulk";
    const COLUMNS = [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
    ];
    await bulkUpdate({ domain: "demo", resource: "items", ids, action: "set_status" });
    <ParityTable
      storageKey="dev-bulk-demo"
      selectable
      maxSelectable={200}
      emptyText="No demo rows."
      batchActions={(selected) => <button>Set inactive</button>}
    />
    <BulkActionModal open={false} />
    <BulkProgressDialog open={false} />
  `;
  const bad = `
    export function BulkDemoPage() {
      return (
        <div>
          <BulkActionBar />
          <TableSelection>
            <table><thead><tr><th>Name</th></tr></thead></table>
          </TableSelection>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; bulk modal/progress demo preserved.`);
}

main();
