#!/usr/bin/env node
/**
 * verify-cash-advances-table-uses-paritytable — qbo-parity-a1 (Cash Advances list surface)
 *
 * The Cash Advances list grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Query failures must surface ListErrorState + Retry on the
 * home page (never a silent empty table). Columns Display ID / Driver / Amount / Purpose /
 * Method / Disbursement Status / Outstanding / Created / Action preserved; the View Detail
 * and Mark Disbursed inline cell actions keep their untouched handlers; status pill chrome,
 * $-amount formatting, and the settled empty copy preserved.
 * Display-only migration — no mutation/posting logic may change (financial surface).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advances-table-uses-paritytable";
const TABLE = "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx";
const HOME = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";

const REQUIRED_LABELS = [
  "Display ID",
  "Driver",
  "Amount",
  "Purpose",
  "Method",
  "Disbursement Status",
  "Outstanding",
  "Created",
  "Action",
];

function assertTableMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
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
  if (!src.includes('storageKey="cash-advances-table"')) {
    errors.push(`${TABLE}: must set storageKey="cash-advances-table"`);
  }
  if (!src.includes('tableTestId="cash-advances-table"')) {
    errors.push(`${TABLE}: must set tableTestId="cash-advances-table"`);
  }
  if (!src.includes("No cash advances found.")) {
    errors.push(`${TABLE}: must keep emptyText for empty cash advances`);
  }
  if (!src.includes("View Detail")) {
    errors.push(`${TABLE}: must keep the View Detail inline action`);
  }
  if (!src.includes("Mark Disbursed")) {
    errors.push(`${TABLE}: must keep the Mark Disbursed inline action`);
  }
  if (!src.includes("onOpenDetail(row)")) {
    errors.push(`${TABLE}: must keep the untouched onOpenDetail handler`);
  }
  if (!src.includes("onMarkDisbursed(row)")) {
    errors.push(`${TABLE}: must keep the untouched onMarkDisbursed handler`);
  }
  if (!src.includes("statusPill(")) {
    errors.push(`${TABLE}: must keep the status pill chrome`);
  }
  return errors;
}

function assertHomeErrorState(src) {
  const errors = [];
  if (!src.includes("ListErrorState")) {
    errors.push(`${HOME}: must render ListErrorState on cash-advances list query failure`);
  }
  if (!src.includes("Couldn't load cash advances")) {
    errors.push(`${HOME}: must keep ListErrorState title for cash-advances outage`);
  }
  return errors;
}

function selftest() {
  const goodTable = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function statusPill(status) { return ""; }
    const columns = [
      { key: "display_id", label: "Display ID" },
      { key: "driver_full_name", label: "Driver" },
      { key: "amount", label: "Amount" },
      { key: "purpose", label: "Purpose" },
      { key: "disbursement_method", label: "Method" },
      { key: "disbursement_status", label: "Disbursement Status", render: (row) => statusPill(row) },
      { key: "outstanding_balance", label: "Outstanding" },
      { key: "created_at", label: "Created" },
      { key: "actions", label: "Action", render: (row) => (
        <>
          <button onClick={() => onOpenDetail(row)}>View Detail</button>
          <button onClick={() => onMarkDisbursed(row)}>Mark Disbursed</button>
        </>
      ) },
    ];
    <ParityTable
      storageKey="cash-advances-table"
      tableTestId="cash-advances-table"
      emptyText="No cash advances found."
    />
  `;
  const badTable = `
    export function CashAdvancesTable() {
      return (
        <div>
          <table><thead><tr><th>Display ID</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodHome = `
    import { ListErrorState } from "../../components/ListErrorState";
    <ListErrorState title="Couldn't load cash advances" status={0} onRetry={() => {}} />
  `;
  const badHome = `
    export function CashAdvancesHomePage() { return <div />; }
  `;
  const goodTableErrors = assertTableMigrated(goodTable);
  const badTableErrors = assertTableMigrated(badTable);
  const goodHomeErrors = assertHomeErrorState(goodHome);
  const badHomeErrors = assertHomeErrorState(badHome);
  if (goodTableErrors.length) {
    console.error(`${LABEL} --selftest FAIL good table fixture:`, goodTableErrors);
    process.exit(1);
  }
  if (badTableErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad table fixture should fail hard:`, badTableErrors);
    process.exit(1);
  }
  if (goodHomeErrors.length) {
    console.error(`${LABEL} --selftest FAIL good home fixture:`, goodHomeErrors);
    process.exit(1);
  }
  if (badHomeErrors.length < 2) {
    console.error(`${LABEL} --selftest FAIL bad home fixture should fail hard:`, badHomeErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const tableSrc = fs.readFileSync(path.join(ROOT, TABLE), "utf8");
  const homeSrc = fs.readFileSync(path.join(ROOT, HOME), "utf8");
  const errors = [...assertTableMigrated(tableSrc), ...assertHomeErrorState(homeSrc)];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${TABLE} uses ParityTable; ${HOME} renders ListErrorState; columns + inline actions preserved.`,
  );
}

main();
