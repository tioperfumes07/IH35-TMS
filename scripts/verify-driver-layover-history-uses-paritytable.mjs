#!/usr/bin/env node
/**
 * verify-driver-layover-history-uses-paritytable — qbo-parity-a1 (DriverLayoverHistory)
 *
 * Driver layover history must use the shared ParityTable grammar rather than a hand-rolled
 * table. The date range, billable toggle, per-diem status, and no-results/error states remain
 * reachable after the migration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-layover-history-uses-paritytable";
const PAGE = "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx";
const REQUIRED_LABELS = ["Started", "Ended", "Hours", "Billable", "Per Diem"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src) || /<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="driver-layover-history"')) {
    errors.push(`${PAGE}: must set storageKey="driver-layover-history"`);
  }
  if (!src.includes("No layovers detected in this period.")) {
    errors.push(`${PAGE}: must preserve the empty period message`);
  }
  if (!src.includes("Couldn't load driver layovers")) {
    errors.push(`${PAGE}: must preserve an actionable load-error state`);
  }
  if (!src.includes("mark-billable") || !src.includes("billableMutation.mutate")) {
    errors.push(`${PAGE}: must preserve the mark-billable action`);
  }
  if (!src.includes("per_diem_eligible")) {
    errors.push(`${PAGE}: must preserve the per-diem status`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "layover_started_at", label: "Started" },
      { key: "layover_ended_at", label: "Ended" },
      { key: "duration_hours", label: "Hours" },
      { key: "billable_to_customer", label: "Billable" },
      { key: "per_diem_eligible", label: "Per Diem" },
    ];
    const billableMutation = { mutate() {} };
    const endpoint = "/mark-billable";
    billableMutation.mutate({ uuid: "layover-1", billable: true });
    <ListErrorState title="Couldn't load driver layovers" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="driver-layover-history"
      emptyText="No layovers detected in this period."
    />
  `;
  const bad = `
    export function DriverLayoverHistory() {
      return <table><thead><tr><th>Started</th></tr></thead></table>;
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
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; layover actions preserved.`);
}

main();
