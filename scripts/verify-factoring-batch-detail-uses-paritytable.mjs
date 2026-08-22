#!/usr/bin/env node
/**
 * verify-factoring-batch-detail-uses-paritytable — qbo-parity-a1 (factoring BatchDetail surface)
 *
 * Read-only factoring batch detail (reserve movements list) must use the shared ParityTable
 * grammar, not a hand-rolled <table>. DISPLAY-ONLY migration on a money-adjacent surface
 * (factoring = secured borrowing): the signed +/- amount rendering, red-negative styling,
 * running reserve balance column, and ListErrorState error surfaces must all be preserved.
 * This surface has no mutations and must stay that way (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-batch-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/BatchDetail.tsx";

const REQUIRED_LABELS = ["Created At", "Reason", "Direction", "Amount", "Running Reserve Balance"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
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
  if (!src.includes('storageKey="factoring-batch-reserve-movements"')) {
    errors.push(`${PAGE}: must set storageKey="factoring-batch-reserve-movements"`);
  }
  if (!src.includes('tableTestId="factoring-batch-reserve-movements-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factoring-batch-reserve-movements-table"`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("No reserve movements for this batch.")) {
    errors.push(`${PAGE}: must keep the empty text "No reserve movements for this batch."`);
  }
  if (!src.includes("signed_amount_cents") || !src.includes("running_balance_cents")) {
    errors.push(`${PAGE}: must keep signed amount + running reserve balance derivation (display-only, unchanged math)`);
  }
  if (!src.includes("text-red-700")) {
    errors.push(`${PAGE}: must keep the red styling for negative (debit) amounts`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only surface — must not add mutations (financial-hold: display-only)`);
  }
  if (!src.includes('kind="invoice"') || !src.includes("factoring-batch-invoices-table")) {
    errors.push(`${PAGE}: batch invoices must EntityLink invoice + customer in ParityTable`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const RESERVE_COLUMNS = [
      { key: "created_at", label: "Created At" },
      { key: "reason", label: "Reason" },
      { key: "direction", label: "Direction" },
      { key: "signed_amount_cents", label: "Amount",
        render: (row) => <span className={row.signed_amount_cents >= 0 ? "text-slate-700" : "text-red-700"}>x</span> },
      { key: "running_balance_cents", label: "Running Reserve Balance" },
    ];
    <ListErrorState title="Couldn't load reserve movements" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="factoring-batch-reserve-movements"
      tableTestId="factoring-batch-reserve-movements-table"
      emptyText="No reserve movements for this batch."
    />
    <EntityLink kind="invoice" id={row.id} />
    <ParityTable storageKey="factoring-batch-invoices" tableTestId="factoring-batch-invoices-table" />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function BatchDetail() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Created At</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; signed amounts, running balance, and error surfaces preserved; read-only.`);
}

main();
