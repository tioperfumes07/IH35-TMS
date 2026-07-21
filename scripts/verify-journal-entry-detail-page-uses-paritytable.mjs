#!/usr/bin/env node
/**
 * verify-journal-entry-detail-page-uses-paritytable — qbo-parity (JournalEntryDetailPage surface)
 *
 * Financial surface (owner greenlit UI-only migration). The Postings grid on the journal-entry
 * detail page must use the shared ParityTable grammar (sort/resize/gear), not a hand-rolled
 * <table>. DISPLAY-ONLY migration: the column set/order (Line / Account / Class / Entity /
 * Side / Amount / Description), the cents→USD money formatting, the "No posting lines." empty
 * text, the ListErrorState detail-query error surface, and the "Journal entry not found."
 * missing-record surface must all be preserved 1:1. Read-only GL surface — this page posts
 * nothing and must stay that way (no useMutation, no new GL math, no posting changes).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-journal-entry-detail-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";

const POSTING_LABELS = ["Line", "Account", "Class", "Entity", "Side", "Amount", "Description"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!/<ParityTable\b/.test(src)) {
    errors.push(`${PAGE}: must render <ParityTable> for the Postings grid`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of POSTING_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="journal-entry-detail-postings"')) {
    errors.push(`${PAGE}: Postings grid must set storageKey="journal-entry-detail-postings"`);
  }
  if (!src.includes("No posting lines.")) {
    errors.push(`${PAGE}: must keep the "No posting lines." emptyText`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on detail-query load failure`);
  }
  if (!src.includes("Couldn't load journal entry")) {
    errors.push(`${PAGE}: must keep ListErrorState title for detail-query outage`);
  }
  if (!src.includes("Journal entry not found.")) {
    errors.push(`${PAGE}: must keep the "Journal entry not found." missing-record surface`);
  }
  if (!src.includes('currency: "USD"')) {
    errors.push(`${PAGE}: must keep the cents→USD money formatting for the Amount column`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only GL surface — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ListErrorState } from "../../../components/ListErrorState";
    function money(cents) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
    }
    const postingColumns = [
      { key: "line_sequence", label: "Line" },
      { key: "account_name", label: "Account" },
      { key: "class_name", label: "Class" },
      { key: "entity_uuid", label: "Entity" },
      { key: "debit_or_credit", label: "Side" },
      { key: "amount_cents", label: "Amount" },
      { key: "description", label: "Description" },
    ];
    <ListErrorState title="Couldn't load journal entry" status={0} onRetry={() => {}} />
    <div>Journal entry not found.</div>
    <ParityTable storageKey="journal-entry-detail-postings" emptyText="No posting lines." />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function JournalEntryDetailPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Line</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} Postings grid uses ParityTable; columns/error surfaces preserved; display-only.`);
}

main();
