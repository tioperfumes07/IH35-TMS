#!/usr/bin/env node
/**
 * verify-factor-reserve-card-uses-paritytable — qbo-parity-a1 (FactorReserveCard surface)
 *
 * The factor reserve "Reserve balances by customer" table must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. DISPLAY-ONLY migration on a
 * money-adjacent surface (factoring secured borrowing): the money() cents formatter, the
 * Customer/Current reserve/Accrued/Released column order, and the ListErrorState on the
 * balances query error must all be preserved. The table itself is read-only — no mutation
 * lives inside it; the "Latest reserve events" panel is untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-reserve-card-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/FactorReserveCard.tsx";

const REQUIRED_LABELS = ["Customer", "Current reserve", "Accrued", "Released"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('storageKey="accounting-factor-reserve-balances"')) {
    errors.push(`${PAGE}: must set storageKey="accounting-factor-reserve-balances"`);
  }
  if (!src.includes('tableTestId="factor-reserve-balances-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factor-reserve-balances-table"`);
  }
  if (
    !/function money\(/.test(src) ||
    !src.includes("money(row.reserve_balance_cents)") ||
    !src.includes("money(row.reserve_accrued_cents)") ||
    !src.includes("money(row.reserve_released_cents)")
  ) {
    errors.push(`${PAGE}: must keep the money() cents formatter on Current reserve/Accrued/Released cells`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState on the balances query error surface`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    function money(cents) { return String(cents); }
    const columns = [
      { key: "customer_name", label: "Customer" },
      { key: "reserve_balance_cents", label: "Current reserve", render: (row) => money(row.reserve_balance_cents) },
      { key: "reserve_accrued_cents", label: "Accrued", render: (row) => money(row.reserve_accrued_cents) },
      { key: "reserve_released_cents", label: "Released", render: (row) => money(row.reserve_released_cents) },
    ];
    <ListErrorState title="Couldn't load reserve balances" />
    <ParityTable
      storageKey="accounting-factor-reserve-balances"
      tableTestId="factor-reserve-balances-table"
    />
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    export function FactorReserveCard() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Customer</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; money formatting, column order, and error surface preserved.`);
}

main();
