#!/usr/bin/env node
/**
 * verify-booking-gap-report-uses-paritytable — qbo-parity-a1 (BookingGapReport surface)
 *
 * Dispatcher booking-gap analytics must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Outages must surface ListErrorState (never a bare banner).
 * Columns Rank / Dispatcher / Loads / Avg Gap (h) / P50 (h) / P90 (h) preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-booking-gap-report-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/BookingGapReport.tsx";

const REQUIRED_LABELS = ["Rank", "Dispatcher", "Loads", "Avg Gap (h)", "P50 (h)", "P90 (h)"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("ParityTable")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes('storageKey="booking-gap-report"')) {
    errors.push(`${PAGE}: must set storageKey="booking-gap-report"`);
  }
  if (!src.includes("No data available for this period.")) {
    errors.push(`${PAGE}: must keep emptyText for empty period`);
  }
  if (!src.includes("Couldn't load booking gap report")) {
    errors.push(`${PAGE}: must keep ListErrorState title for outage`);
  }
  if (!src.includes("rowClassName")) {
    errors.push(`${PAGE}: must keep rowClassName for rank highlight (best/worst)`);
  }
  if (!src.includes('(["week", "month", "quarter"]')) {
    errors.push(`${PAGE}: must keep week/month/quarter period toggle`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "rank", label: "Rank" },
      { key: "dispatcher_label", label: "Dispatcher" },
      { key: "loads_counted", label: "Loads" },
      { key: "avg_gap_hours", label: "Avg Gap (h)" },
      { key: "p50_gap_hours", label: "P50 (h)" },
      { key: "p90_gap_hours", label: "P90 (h)" },
    ];
    (["week", "month", "quarter"] as Period[]).map((p) => null);
    <ListErrorState title="Couldn't load booking gap report" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="booking-gap-report"
      emptyText="No data available for this period."
      rowClassName={(row) => ""}
    />
  `;
  const bad = `
    export function BookingGapReport() {
      return (
        <div>
          <table><thead><tr><th>Rank</th></tr></thead></table>
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
