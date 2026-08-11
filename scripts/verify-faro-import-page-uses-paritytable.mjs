#!/usr/bin/env node
/**
 * verify-faro-import-page-uses-paritytable — factoring (FaroImportPage)
 *
 * The Faro CSV import PREVIEW table (display-only result of preview_only=true) must use the
 * shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. This is a UI-only
 * display migration: the preview/commit mutation, amounts math (cents/100 via the shared
 * Intl.NumberFormat currency formatter), column order, and toast error surfacing must remain
 * exactly as before. There is no useQuery list on this page — load/import failures surface via
 * the mutation onError toast, so ListErrorState is not applicable here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-import-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/FaroImportPage.tsx";

const COLUMN_LABELS = ["Invoice", "Customer", "Gross", "Advance", "Reserve", "Net"];
const AMOUNT_RENDERS = [
  "currency.format(row.gross_amount_cents / 100)",
  "currency.format(row.advance_amount_cents / 100)",
  "currency.format(row.reserve_amount_cents / 100)",
  "currency.format(row.net_amount_cents / 100)",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> (Faro preview lines)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of COLUMN_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  // Amount formatting must stay 1:1 (cents/100 through the shared USD formatter).
  for (const render of AMOUNT_RENDERS) {
    if (!src.includes(render)) {
      errors.push(`${PAGE}: missing exact amount render: ${render}`);
    }
  }
  if (!src.includes('storageKey="factoring-faro-import-preview"')) {
    errors.push(`${PAGE}: must set storageKey="factoring-faro-import-preview"`);
  }
  if (!src.includes('tableTestId="faro-import-preview-table"')) {
    errors.push(`${PAGE}: must set tableTestId="faro-import-preview-table"`);
  }
  // The import mutation + toast error surfacing must remain untouched (display-only migration).
  if (!src.includes("/api/v1/factoring/import/faro")) {
    errors.push(`${PAGE}: must keep the Faro import endpoint call unchanged`);
  }
  if (
    !src.includes('pushToast(error.message || "Import failed", "error")') &&
    !src.includes('pushToast(userFacingApiError(error, "Import failed"), "error")')
  ) {
    errors.push(`${PAGE}: must keep the mutation onError toast (no silent failures)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "invoice_number", label: "Invoice" },
      { key: "customer_name", label: "Customer" },
      { key: "gross_amount_cents", label: "Gross", render: (row) => currency.format(row.gross_amount_cents / 100) },
      { key: "advance_amount_cents", label: "Advance", render: (row) => currency.format(row.advance_amount_cents / 100) },
      { key: "reserve_amount_cents", label: "Reserve", render: (row) => currency.format(row.reserve_amount_cents / 100) },
      { key: "net_amount_cents", label: "Net", render: (row) => currency.format(row.net_amount_cents / 100) },
    ];
    apiRequest("/api/v1/factoring/import/faro", {});
    pushToast(error.message || "Import failed", "error");
    <ParityTable storageKey="factoring-faro-import-preview" tableTestId="faro-import-preview-table" />
  `;
  const bad = `
    export function FaroImportPage() {
      return (
        <div>
          <table><thead><tr><th>Invoice</th></tr></thead></table>
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
  console.log(
    `OK ${LABEL}: ${PAGE} preview uses ParityTable; amounts, columns, and import mutation preserved.`,
  );
}

main();
