#!/usr/bin/env node
/**
 * verify-reserve-dashboard-uses-paritytable — qbo-parity-a1 (factoring ReserveDashboard surface)
 *
 * Financial surface (factoring reserve = secured-borrowing-adjacent, DISPLAY-ONLY). The three
 * read-only tables (Reserve Balance Over Time, Forecast Releases schedule, Recent Movements)
 * must use the shared ParityTable grammar, not hand-rolled <table>s. UI-only migration:
 * column order, cents→USD formatting via asMoney, sign coloring on Signed Movement, the
 * external server-side history pager, and the settled-only empty texts (LIST-EMPTY-1) are all
 * preserved. This page has no mutations and must stay that way (no useMutation) — posting
 * logic, amounts math, API calls, and query keys are untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reserve-dashboard-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/ReserveDashboard.tsx";

const REQUIRED_LABELS = [
  // Reserve Balance Over Time
  "Date",
  "Signed Movement",
  "Running Balance",
  // Forecast Releases schedule
  "Release Date",
  "Projected",
  "Movements",
  // Recent Movements
  "Factor",
  "Reason",
  "Direction",
  "Amount",
];

const REQUIRED_STORAGE_KEYS = [
  "factoring-reserve-balance-history",
  "factoring-reserve-release-forecast",
  "factoring-reserve-recent-movements",
];

const REQUIRED_EMPTY_TEXTS = [
  "No reserve movements found for the selected factor.",
  "No projected reserve releases in the selected window.",
  "No recent movements for this factor.",
];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (history, forecast schedule, recent movements)`);
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
    if (!src.includes(`storageKey="${key}"`)) {
      errors.push(`${PAGE}: must set storageKey="${key}" (distinct key per table)`);
    }
  }
  for (const text of REQUIRED_EMPTY_TEXTS) {
    if (!src.includes(text)) {
      errors.push(`${PAGE}: must keep the settled-only empty text (LIST-EMPTY-1): "${text}"`);
    }
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on query error`);
  }
  if (!src.includes("asMoney")) {
    errors.push(`${PAGE}: must keep the asMoney cents→USD formatter (display parity)`);
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
    function asMoney(cents) { return money.format(cents / 100); }
    const HISTORY_COLUMNS = [
      { key: "created_at", label: "Date" },
      { key: "signed_amount_cents", label: "Signed Movement" },
      { key: "running_balance_cents", label: "Running Balance" },
    ];
    const FORECAST_COLUMNS = [
      { key: "release_date", label: "Release Date" },
      { key: "projected_release_cents", label: "Projected" },
      { key: "source_movement_count", label: "Movements" },
    ];
    const movementColumns = [
      { key: "factor_id", label: "Factor" },
      { key: "reason", label: "Reason" },
      { key: "direction", label: "Direction" },
      { key: "amount_cents", label: "Amount" },
    ];
    <ListErrorState title="Couldn't load reserve balance history" onRetry={() => {}} />
    <ParityTable storageKey="factoring-reserve-balance-history"
      emptyText={"No reserve movements found for the selected factor."} />
    <ParityTable storageKey="factoring-reserve-release-forecast"
      emptyText={"No projected reserve releases in the selected window."} />
    <ParityTable storageKey="factoring-reserve-recent-movements"
      emptyText={"No recent movements for this factor."} />
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    export function ReserveDashboard() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Date</th></tr></thead>
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
    `OK ${LABEL}: ${PAGE} uses ParityTable ×3; columns/formatting/empty texts/error surface preserved; display-only.`,
  );
}

main();
