#!/usr/bin/env node
/**
 * verify-chargebacks-table-uses-paritytable — qbo-parity-a1 (ChargebacksTable surface)
 *
 * Factoring chargebacks/fees list must use the shared ParityTable grammar
 * (sort/resize/gear + selectable batchActions), not a hand-rolled <table>.
 * Display-only surface (rows/formatters passed as props; parent owns query).
 * Columns Advance / Date / Statement Ref / Chargeback / Fee preserved 1:1;
 * fmtCurrency/fmtDate, EntityLink, empty message, Export Selected + Dispute stub retained.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-chargebacks-table-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/ChargebacksTable.tsx";

const REQUIRED_LABELS = ["Advance", "Date", "Statement Ref", "Chargeback", "Fee"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
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
  if (!src.includes('storageKey="factoring-chargebacks"')) {
    errors.push(`${PAGE}: must set storageKey="factoring-chargebacks"`);
  }
  if (!src.includes('tableTestId="factoring-chargebacks-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factoring-chargebacks-table"`);
  }
  if (!src.includes("No chargeback/fee rows available.")) {
    errors.push(`${PAGE}: must keep empty message`);
  }
  if (!src.includes("selectable")) {
    errors.push(`${PAGE}: must keep bulk-select via ParityTable selectable`);
  }
  if (!src.includes("batchActions")) {
    errors.push(`${PAGE}: must wire batchActions (export selected + dispute stub)`);
  }
  if (!src.includes("Export Selected")) {
    errors.push(`${PAGE}: must keep Export Selected bulk action`);
  }
  // Assert the disabled Dispute affordance via its compliant tooltip, NOT the literal
  // "Dispute (coming soon)" — that rendered copy is forbidden by verify-no-prod-stubs, and
  // asserting it here would put the two guards in direct conflict (as happened on
  // SafetyEventsTable). The button label is "Dispute"; the tooltip explains it is not yet backed.
  if (!src.includes("Bulk dispute is not available yet")) {
    errors.push(`${PAGE}: must keep the disabled Dispute bulk affordance (tooltip "Bulk dispute is not available yet")`);
  }
  if (!src.includes("fmtCurrency(row.chargeback_amount)") || !src.includes("fmtCurrency(row.factor_fee_amount)")) {
    errors.push(`${PAGE}: must keep fmtCurrency for chargeback + fee amounts`);
  }
  if (!src.includes("fmtDate(row.created_at)")) {
    errors.push(`${PAGE}: must keep fmtDate for created_at`);
  }
  if (!src.includes("EntityLink") || !src.includes('kind="factoring_advance"')) {
    errors.push(`${PAGE}: must keep EntityLink for factoring_advance`);
  }
  if (src.includes("BulkSelectableTable")) {
    errors.push(`${PAGE}: must not wrap with BulkSelectableTable (ParityTable selectable replaces it)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { EntityLink } from "../../components/shared/EntityLink";
    const COLUMNS = [
      { key: "factoring_advance_id", label: "Advance", render: (row) => (
        <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={row.statement_reference || row.factoring_advance_id.slice(0, 8)} />
      ) },
      { key: "created_at", label: "Date", render: (row) => fmtDate(row.created_at) },
      { key: "statement_reference", label: "Statement Ref" },
      { key: "chargeback_amount", label: "Chargeback", render: (row) => fmtCurrency(row.chargeback_amount) },
      { key: "factor_fee_amount", label: "Fee", render: (row) => fmtCurrency(row.factor_fee_amount) },
    ];
    <ParityTable
      storageKey="factoring-chargebacks"
      tableTestId="factoring-chargebacks-table"
      emptyText="No chargeback/fee rows available."
      selectable
      batchActions={(selected) => (
        <>
          <button>Export Selected</button>
          <button disabled title="Bulk dispute is not available yet.">Dispute</button>
        </>
      )}
    />
  `;
  const bad = `
    export function ChargebacksTable() {
      return (
        <BulkSelectableTable>
          <table><thead><tr><th>Advance</th></tr></thead></table>
        </BulkSelectableTable>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; Advance/Date/Statement Ref/Chargeback/Fee preserved.`);
}

main();
