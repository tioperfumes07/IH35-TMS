#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["customer","connectivity","reverse_link"],"leafRe":"^(home\\.recourse_pipeline|recourse_pipeline)","task":"FACT-RECOURSE-CUSTOMER","pr":"pending"} */
/**
 * verify-recourse-pipeline-table-uses-paritytable — qbo-parity-a1 (RecoursePipelineTable surface)
 *
 * Factoring recourse pipeline list (financial surface — display-only, owner-greenlit UI migration)
 * must use the shared ParityTable grammar (sort/resize/gear/pager + selectable batch bar), not a
 * hand-rolled <table> inside BulkSelectableTable. Columns preserved 1:1 (Invoice, Customer,
 * Advance, Reserve, Recourse Expiry, Days Left), the EntityLink to the factoring advance kept,
 * the CSV "Export Selected" batch action kept, and the empty-state literal kept. Read-only:
 * the component receives rows as props and must never post (no useMutation, no fetch).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-recourse-pipeline-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/RecoursePipelineTable.tsx";
const ROUTES = "apps/backend/src/factoring/factoring.routes.ts";

const REQUIRED_LABELS = ["Invoice", "Customer", "Advance", "Reserve", "Recourse Expiry", "Days Left"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (src.includes("BulkSelectableTable")) {
    errors.push(`${PAGE}: must not use BulkSelectableTable after ParityTable migration (use selectable/batchActions)`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must keep the EntityLink to the factoring advance in the Invoice column`);
  }
  if (!src.includes("No invoice #")) {
    errors.push(`${PAGE}: Invoice column must use No invoice # for a visible empty document number (not Advance tombstone)`);
  }
  if (/entityLabel\(row\.invoice_reference,\s*row\.factoring_advance_id,\s*"Advance"\)/.test(src)) {
    errors.push(`${PAGE}: Invoice column must not tombstone a visible row as Advance — not visible`);
  }
  if (!/<EntityLink[^>]*kind=["']customer["'][\s\S]{0,240}?row\.customer_id/.test(src)) {
    errors.push(`${PAGE}: customer column must use EntityLink kind="customer" id={row.customer_id} when present`);
  }
  if (!src.includes("Export Selected")) {
    errors.push(`${PAGE}: must keep the "Export Selected" CSV batch action`);
  }
  if (!src.includes("No recourse pipeline rows available in this environment.")) {
    errors.push(`${PAGE}: must keep the empty-state literal`);
  }
  if (!src.includes('storageKey="factoring-recourse-pipeline"')) {
    errors.push(`${PAGE}: must set storageKey="factoring-recourse-pipeline"`);
  }
  if (!src.includes('tableTestId="factoring-recourse-pipeline-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factoring-recourse-pipeline-table"`);
  }
  if (src.includes("useMutation") || /\bfetch\s*\(/.test(src)) {
    errors.push(`${PAGE}: display-only financial surface — must not add mutations or direct fetches`);
  }
  return errors;
}

function assertRecourseApi(src) {
  const errors = [];
  if (!/inv\.customer_id/.test(src) || !/factoring_advance_id = rr\.factoring_advance_id/.test(src)) {
    errors.push(
      `${ROUTES}: recourse-pipeline must join accounting.invoices on factoring_advance_id and return customer_id`,
    );
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    const columns = [
      { key: "invoice_reference", label: "Invoice", render: (row) => <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={row.invoice_reference || "No invoice #"} /> },
      { key: "customer_name", label: "Customer", render: (row) => <EntityLink kind="customer" id={row.customer_id} label={row.customer_name} /> },
      { key: "advance_amount", label: "Advance" },
      { key: "reserve_amount", label: "Reserve" },
      { key: "recourse_expiry_date", label: "Recourse Expiry" },
      { key: "days_until_recourse_expiry", label: "Days Left" },
    ];
    <ParityTable
      storageKey="factoring-recourse-pipeline"
      tableTestId="factoring-recourse-pipeline-table"
      emptyText="No recourse pipeline rows available in this environment."
      batchActions={(selected) => <button>Export Selected</button>}
    />
  `;
  const bad = `
    import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
    import { useMutation } from "@tanstack/react-query";
    export function RecoursePipelineTable() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Invoice</th></tr></thead>
        </table>
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
  const badCustomer = good.replace(
    'kind="customer" id={row.customer_id}',
    'kind="vendor" id={row.customer_id}',
  );
  if (assertMigrated(badCustomer).length < 1) {
    console.error(`${LABEL} --selftest FAIL customer EntityLink regression`);
    process.exit(1);
  }
  const goodRoutes = `
    SELECT rr.*, inv.customer_id
    LEFT JOIN LATERAL (
      SELECT i.customer_id
      FROM accounting.invoices i
      WHERE i.factoring_advance_id = rr.factoring_advance_id
    ) inv ON true
  `;
  const badRoutes = `SELECT * FROM views.factoring_recourse_at_risk`;
  if (assertRecourseApi(goodRoutes).length !== 0 || assertRecourseApi(badRoutes).length === 0) {
    console.error(`${LABEL} --selftest FAIL recourse API fixture`);
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
  const routeSrc = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  const errors = [...assertMigrated(src), ...assertRecourseApi(routeSrc)];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/EntityLink/export/empty-state preserved; display-only.`);
}

main();
