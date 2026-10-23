#!/usr/bin/env node
/**
 * verify-actual-vs-projected-tab-uses-paritytable — cash-flow ActualVsProjectedTab surface.
 *
 * Owner-greenlit UI-only migration of a financial (money-adjacent, read-only report) surface:
 * the per-day actual-vs-projected table must use the shared ParityTable grammar, not a
 * hand-rolled <table>. Display-only: the read-only useQuery stays (no mutations), amount
 * formatting stays on formatCents/formatUsdCents (sign + minus-sign preserved), the eight
 * column labels stay in order, the business-date range helpers (companyToday/addDaysIso,
 * CASHFLOW-1) stay, and errors surface via ListErrorState with a Retry refetch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-actual-vs-projected-tab-uses-paritytable";
const PAGE = "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx";

const REQUIRED_LABELS = [
  "Date",
  "Projected Income",
  "Actual Income",
  "Income Variance",
  "Projected Exp.",
  "Actual Exp.",
  "Exp. Variance",
  "Net",
];

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
  if (!src.includes('storageKey="cash-flow-avp"')) {
    errors.push(`${PAGE}: must set storageKey="cash-flow-avp"`);
  }
  if (!src.includes('tableTestId="cash-flow-avp-table"')) {
    errors.push(`${PAGE}: must set tableTestId="cash-flow-avp-table"`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must surface query errors via ListErrorState`);
  }
  if (!src.includes("No data for the selected date range.")) {
    errors.push(`${PAGE}: must keep the empty-state text "No data for the selected date range."`);
  }
  // Display-only financial surface: formatting + business-date helpers stay, no writes.
  if (!src.includes("formatUsdCents")) {
    errors.push(`${PAGE}: must keep formatUsdCents-based cents formatting (no cents truncation)`);
  }
  if (!src.includes("companyToday") || !src.includes("addDaysIso")) {
    errors.push(`${PAGE}: must keep companyToday/addDaysIso business-date range (CASHFLOW-1)`);
  }
  if (src.includes("useMutation")) {
    errors.push(`${PAGE}: read-only report surface — must not add mutations`);
  }
  // ROUND 443.250 — V3 board chrome (piggyback; no new EVEN claim).
  for (const comp of ["V3KpiTile", "V3Panel", "V3Segmented"]) {
    if (!src.includes(comp)) {
      errors.push(`${PAGE}: ROUND 443.250 must mount ${comp}`);
    }
  }
  for (const testId of [
    "cash-flow-avp-v3-kpis",
    "cash-flow-avp-chart-panel",
    "cash-flow-avp-chart-grain",
  ]) {
    if (!src.includes(testId)) {
      errors.push(`${PAGE}: missing V3 testId ${testId}`);
    }
  }
  if (!src.includes('from "../../../design/v3-tokens"') && !src.includes('from "../../../design/v3-tokens.ts"')) {
    if (!src.includes("v3-tokens")) {
      errors.push(`${PAGE}: must import V3 from design/v3-tokens`);
    }
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { addDaysIso, companyToday } from "../../../lib/businessDate";
    import { formatUsdCents } from "../../../lib/money";
    import { V3 } from "../../../design/v3-tokens";
    import { V3KpiTile } from "../../../components/v3/V3KpiTile";
    import { V3Panel } from "../../../components/v3/V3Panel";
    import { V3Segmented } from "../../../components/v3/V3Segmented";
    const COLUMNS = [
      { key: "date", label: "Date" },
      { key: "projected_income", label: "Projected Income" },
      { key: "actual_income", label: "Actual Income" },
      { key: "income_variance", label: "Income Variance" },
      { key: "projected_expenses", label: "Projected Exp." },
      { key: "actual_expenses", label: "Actual Exp." },
      { key: "expense_variance", label: "Exp. Variance" },
      { key: "net", label: "Net" },
    ];
    <ListErrorState status={0} onRetry={() => {}} />
    <div data-testid="cash-flow-avp-v3-kpis"><V3KpiTile label="Income accuracy" value="$1" /></div>
    <V3Panel title="Cumulative" testId="cash-flow-avp-chart-panel">
      <V3Segmented value="cumulative" onChange={() => {}} options={[]} testId="cash-flow-avp-chart-grain" />
    </V3Panel>
    <ParityTable
      storageKey="cash-flow-avp"
      tableTestId="cash-flow-avp-table"
      emptyText="No data for the selected date range."
    />
  `;
  const bad = `
    import { DataTable } from "../../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function ActualVsProjectedTab() {
      return (
        <table className="w-full min-w-[640px] text-sm">
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
    `OK ${LABEL}: ${PAGE} uses ParityTable + ROUND 443.250 V3KpiTile/V3Panel/V3Segmented; columns/formatting/business-date/error surface preserved; read-only.`,
  );
}

main();
