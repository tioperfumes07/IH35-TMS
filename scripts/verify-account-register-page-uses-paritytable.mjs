#!/usr/bin/env node
/**
 * verify-account-register-page-uses-paritytable — qbo-parity (AccountRegisterPage surface)
 *
 * Money-adjacent ledger DISPLAY — both views of the account register (Register + Audit history)
 * must use the shared ParityTable grammar, not a hand-rolled <table>. Display-only migration:
 * the CHAIN-02 register error surface, the honest C/R reconciliation banner, the pinned
 * opening-balance summary row, the QBO column grammar, and the audit-view columns
 * (When/Action/Journal entry/Dr/Cr/Amount) must all be preserved. Audit-view outages surface
 * ListErrorState. This page posts nothing and must stay that way (no useMutation).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-register-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx";

const REGISTER_LABELS = ["Date", "Ref No.", "Payee", "Memo", "Class", "Payment", "Deposit", "Balance", "Type", "Account", "Location", "C/R"];
const AUDIT_LABELS = ["When", "Action", "Journal entry", "Dr/Cr", "Amount"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (register view + audit-history view)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of [...REGISTER_LABELS, ...AUDIT_LABELS]) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="account-register"')) {
    errors.push(`${PAGE}: register view must set storageKey="account-register"`);
  }
  if (!src.includes('storageKey="account-register-audit"')) {
    errors.push(`${PAGE}: audit-history view must set storageKey="account-register-audit"`);
  }
  if (!src.includes("Couldn't load the register for this account and date range.")) {
    errors.push(`${PAGE}: must keep the CHAIN-02 register error surface literal`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on audit-history load failure`);
  }
  if (!src.includes("Couldn't load audit history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for audit-history outage`);
  }
  if (!src.includes("No audit events for this account.")) {
    errors.push(`${PAGE}: must keep the audit-history emptyText`);
  }
  if (!src.includes("No transactions in this range.")) {
    errors.push(`${PAGE}: must keep the register emptyText`);
  }
  if (!src.includes("Reconciliation not yet available")) {
    errors.push(`${PAGE}: must keep the honest C/R reconciliation banner`);
  }
  if (!src.includes("Opening balance")) {
    errors.push(`${PAGE}: must keep the pinned opening-balance summary row`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only ledger surface — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    const columns = [
      { key: "entry_date", label: "Date" },
      { key: "reference", label: "Ref No." },
      { key: "payee", label: "Payee" },
      { key: "memo", label: "Memo" },
      { key: "class_name", label: "Class" },
      { key: "payment", label: "Payment" },
      { key: "deposit", label: "Deposit" },
      { key: "running_balance_cents", label: "Balance" },
      { key: "type", label: "Type" },
      { key: "split_account", label: "Account" },
      { key: "location", label: "Location" },
      { key: "cr", label: "C/R" },
    ];
    const auditColumns = [
      { key: "occurred_at", label: "When" },
      { key: "event_class", label: "Action" },
      { key: "journal_entry_id", label: "Journal entry" },
      { key: "debit_or_credit", label: "Dr/Cr" },
      { key: "amount_cents", label: "Amount" },
    ];
    <p>Couldn't load the register for this account and date range.</p>
    <div>Reconciliation not yet available</div>
    <span>Opening balance</span>
    <ParityTable storageKey="account-register" emptyText="No transactions in this range." />
    <ListErrorState title="Couldn't load audit history" status={0} onRetry={() => {}} />
    <ParityTable storageKey="account-register-audit" emptyText="No audit events for this account." />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function AccountRegisterPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>When</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable in both views; columns/error surfaces preserved; display-only.`);
}

main();
