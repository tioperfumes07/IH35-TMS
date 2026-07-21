#!/usr/bin/env node
/**
 * verify-reserve-tracker-uses-paritytable — factoring ReserveTracker surface
 *
 * FARO reserve tracker (financial surface — display-only, owner-greenlit UI-only migration).
 * All three read-only tables (release forecast schedule, reserve movement history,
 * chargeback + fee history) must use the shared ParityTable grammar, not hand-rolled
 * <table>s. Columns/order/formatting preserved 1:1; the server-side history pager
 * (histPage → API offset) and its handlers must stay; ListErrorState surfaces query
 * errors. Factoring reserve is money-adjacent (secured borrowing) — this page has no
 * mutations and must stay that way (no useMutation, no posting logic).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reserve-tracker-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

const REQUIRED_LABELS = [
  // forecast schedule
  "Release Date",
  "Projected Amount",
  "Source Movements",
  // reserve movement history
  "Date",
  "Reason",
  "Movement",
  "Running Balance",
  // chargeback + fee history
  "Advance",
  "Chargeback",
  "Fee",
];

const REQUIRED_STORAGE_KEYS = [
  'storageKey="factoring-reserve-forecast-schedule"',
  'storageKey="factoring-reserve-movement-history"',
  'storageKey="factoring-chargeback-fee-history"',
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  const parityCount = (src.match(/<ParityTable\b/g) ?? []).length;
  if (parityCount < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (forecast, history, chargebacks), found ${parityCount}`);
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
    if (!src.includes(key)) {
      errors.push(`${PAGE}: missing distinct ${key}`);
    }
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must surface query errors via ListErrorState`);
  }
  // Server-side history pager must survive the migration (handlers unchanged).
  if (!src.includes("setHistPage")) {
    errors.push(`${PAGE}: must keep the server-side history pager (setHistPage)`);
  }
  // Preserved copy literals (1:1 display parity).
  if (!src.includes("Calculating…")) {
    errors.push(`${PAGE}: must keep the "Calculating…" forecast loading copy`);
  }
  if (!src.includes("No movements recorded for this factor.")) {
    errors.push(`${PAGE}: must keep the history empty-state copy`);
  }
  if (!src.includes("No projected releases in the next 60 days.")) {
    errors.push(`${PAGE}: must keep the forecast empty-state copy`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must keep the EntityLink advance drill-through`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: display-only financial surface — must not add mutations`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    const FORECAST_COLUMNS = [
      { key: "release_date", label: "Release Date" },
      { key: "projected_release_cents", label: "Projected Amount" },
      { key: "source_movement_count", label: "Source Movements" },
    ];
    const HISTORY_COLUMNS = [
      { key: "created_at", label: "Date" },
      { key: "reason", label: "Reason" },
      { key: "signed_amount_cents", label: "Movement" },
      { key: "running_balance_cents", label: "Running Balance" },
    ];
    const CHARGEBACK_COLUMNS = [
      { key: "created_at", label: "Date" },
      { key: "factoring_advance_id", label: "Advance", render: (r) => <EntityLink /> },
      { key: "chargeback_amount", label: "Chargeback" },
      { key: "factor_fee_amount", label: "Fee" },
    ];
    <ListErrorState status={0} onRetry={() => {}} />
    <ParityTable storageKey="factoring-reserve-forecast-schedule"
      emptyText={loading ? "Calculating…" : "No projected releases in the next 60 days."} />
    <ParityTable storageKey="factoring-reserve-movement-history"
      emptyText="No movements recorded for this factor." />
    <button onClick={() => setHistPage((p) => p + 1)}>Next</button>
    <ParityTable storageKey="factoring-chargeback-fee-history" />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function ReserveTracker() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Release Date</th></tr></thead>
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
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable ×3; columns/copy/server pager preserved; display-only (no mutations).`,
  );
}

main();
