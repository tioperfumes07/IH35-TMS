#!/usr/bin/env node
/**
 * verify-wo-detail-uses-paritytable — qbo-parity-a1 (WorkOrderDetailPage surface)
 *
 * The three read-only display grids on the WO detail page (posting-preview lines, linked bills,
 * linked expenses) must use the shared ParityTable grammar (sort/resize/gear), not hand-rolled
 * <table>. The posting preview is a READ-ONLY preview — no journal entry is created or edited
 * from this surface — so migrating its display is not a GL-posting change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";

const REQUIRED_LABELS = ["Line", "P&S Category", "P&S Item", "Asset", "Amount", "Bill", "Expense", "Date", "Status"];
const REQUIRED_STORAGE_KEYS = ["wo-detail-posting-preview", "wo-detail-linked-bills", "wo-detail-linked-expenses"];
const REQUIRED_TEST_IDS = [
  "wo-detail-posting-preview-parity",
  "wo-detail-linked-bills-parity",
  "wo-detail-linked-expenses-parity",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityCount = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityCount < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (posting preview + linked bills + linked expenses); found ${parityCount}`);
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
  for (const key of REQUIRED_STORAGE_KEYS) {
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}"`);
    }
  }
  for (const id of REQUIRED_TEST_IDS) {
    if (!src.includes(`tableTestId="${id}"`)) {
      errors.push(`${PAGE}: must set tableTestId="${id}"`);
    }
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must keep EntityLink drill-through in linked bills/expenses`);
  }
  if (!src.includes('data-testid="wo-linked-financials"')) {
    errors.push(`${PAGE}: must keep wo-linked-financials section wrapper`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    const COLUMNS = [
      { key: "description", label: "Line" },
      { key: "ps_category_name", label: "P&S Category" },
      { key: "ps_item_name", label: "P&S Item" },
      { key: "asset_unit_code", label: "Asset" },
      { key: "amount_cents", label: "Amount" },
      { key: "bill_number", label: "Bill" },
      { key: "id", label: "Expense" },
      { key: "bill_date", label: "Date" },
      { key: "status", label: "Status" },
    ];
    <section data-testid="wo-linked-financials">
      <ParityTable storageKey="wo-detail-posting-preview" tableTestId="wo-detail-posting-preview-parity" />
      <ParityTable storageKey="wo-detail-linked-bills" tableTestId="wo-detail-linked-bills-parity" />
      <ParityTable storageKey="wo-detail-linked-expenses" tableTestId="wo-detail-linked-expenses-parity" />
    </section>
  `;
  const bad = `
    export function WorkOrderDetailPage() {
      return (
        <div>
          <table><thead><tr><th>Bill</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} renders 3 ParityTable grids (posting preview, linked bills, linked expenses); no hand-rolled <table>.`);
}

main();
