#!/usr/bin/env node
/**
 * verify-cancellations-report-uses-paritytable — qbo-parity-a1 (CancellationsReportPage)
 *
 * Reports → Cancellations analytics must use shared ParityTable grammar (sort/resize/gear)
 * for all four bucket groupings (reason / driver / customer / date), not hand-rolled
 * <table> elements. Columns Count / Billable / Charges preserved; KPI summary cards
 * and date-range filters preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cancellations-report-uses-paritytable";
const PAGE = "apps/frontend/src/pages/reports/CancellationsReportPage.tsx";

const REQUIRED_LABELS = ["Count", "Billable", "Charges"];
const REQUIRED_STORAGE_KEYS = [
  "cancellations-report-by-reason",
  "cancellations-report-by-driver",
  "cancellations-report-by-customer",
  "cancellations-report-by-date",
];
const REQUIRED_GROUPINGS = ["by_reason", "by_driver", "by_customer", "by_date"];
const REQUIRED_SECTION_TITLES = ["By reason", "By driver", "By customer", "By date"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityUses = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityUses < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable> usage, found ${parityUses}`);
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
    if (!src.includes(`storageKey="${key}"`) && !src.includes(`storageKey: "${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}"`);
    }
  }
  for (const prop of REQUIRED_GROUPINGS) {
    if (!src.includes(prop)) {
      errors.push(`${PAGE}: must render grouping ${prop}`);
    }
  }
  for (const title of REQUIRED_SECTION_TITLES) {
    if (!src.includes(title)) {
      errors.push(`${PAGE}: must keep section title "${title}"`);
    }
  }
  if (!src.includes('emptyText="No cancellations in range."')) {
    errors.push(`${PAGE}: must keep emptyText for empty bucket tables`);
  }
  if (!src.includes("Billable to customer")) {
    errors.push(`${PAGE}: must keep KPI summary cards`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const BUCKET_SECTIONS = [
      { title: "By reason", prop: "by_reason", storageKey: "cancellations-report-by-reason" },
      { title: "By driver", prop: "by_driver", storageKey: "cancellations-report-by-driver" },
      { title: "By customer", prop: "by_customer", storageKey: "cancellations-report-by-customer" },
      { title: "By date", prop: "by_date", storageKey: "cancellations-report-by-date" },
    ];
    const columns = [
      { key: "label", label: "reason" },
      { key: "count", label: "Count" },
      { key: "billable_count", label: "Billable" },
      { key: "total_charge_cents", label: "Charges" },
    ];
    export function CancellationsReportPage() {
      return (
        <div>
          <div>Billable to customer</div>
          <div>By reason</div>
          <ParityTable storageKey="cancellations-report-by-reason" emptyText="No cancellations in range." columns={columns} rows={data?.by_reason ?? []} />
          <div>By driver</div>
          <ParityTable storageKey="cancellations-report-by-driver" emptyText="No cancellations in range." columns={columns} rows={data?.by_driver ?? []} />
          <div>By customer</div>
          <ParityTable storageKey="cancellations-report-by-customer" emptyText="No cancellations in range." columns={columns} rows={data?.by_customer ?? []} />
          <div>By date</div>
          <ParityTable storageKey="cancellations-report-by-date" emptyText="No cancellations in range." columns={columns} rows={data?.by_date ?? []} />
        </div>
      );
    }
  `;
  const bad = `
    export function CancellationsReportPage() {
      return (
        <table><thead><tr><th>Count</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable for all four cancellation bucket groupings.`);
}

main();
