#!/usr/bin/env node
/**
 * verify-driver-detail-uses-paritytable — qbo-parity-a1 (DriverDetail rate-history surface)
 *
 * The driver detail rate-history modal grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns Date range / Amount /
 * Reason / Notes / Changed by / Changed at preserved; corrected-row strike-through
 * chrome and empty copy preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-detail-uses-paritytable";
const PAGE = "apps/frontend/src/pages/DriverDetail.tsx";

const REQUIRED_LABELS = ["Date range", "Amount", "Reason", "Notes", "Changed by", "Changed at"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../components/parity/ParityTable"') &&
    !src.includes("from '../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on rate-history query failure`);
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
  if (!src.includes('storageKey="driver-rate-history"')) {
    errors.push(`${PAGE}: must set storageKey="driver-rate-history"`);
  }
  if (!src.includes('tableTestId="driver-rate-history-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-rate-history-table"`);
  }
  if (!src.includes("Couldn't load rate history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for rate-history outage`);
  }
  if (!src.includes("No rate history found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty rate history`);
  }
  if (!src.includes("Corrected")) {
    errors.push(`${PAGE}: must keep the Corrected badge on same-day corrected rates`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
    const COLUMNS = [
      { key: "effective_from", label: "Date range" },
      { key: "amount", label: "Amount" },
      { key: "change_reason", label: "Reason" },
      { key: "change_notes", label: "Notes" },
      { key: "created_by_user_email", label: "Changed by" },
      { key: "created_at", label: "Changed at" },
    ];
    <span>Corrected</span>
    <ListErrorState title="Couldn't load rate history" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="driver-rate-history"
      tableTestId="driver-rate-history-table"
      emptyText="No rate history found."
    />
  `;
  const bad = `
    export function DriverDetailPage() {
      return (
        <div>
          <table><thead><tr><th>Date range</th></tr></thead></table>
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
