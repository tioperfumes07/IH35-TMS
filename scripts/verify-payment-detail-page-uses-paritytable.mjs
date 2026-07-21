#!/usr/bin/env node
/**
 * verify-payment-detail-page-uses-paritytable — qbo-parity-a1 (PaymentDetailPage surface)
 *
 * Financial surface (owner greenlit UI-only migration). The Applications grid on the
 * customer-payment detail page must use the shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. DISPLAY-ONLY migration: the apply/unapply/void mutations,
 * their onError toast wiring (verify-payment-detail-mutation-onerror), the ListErrorState
 * detail-query error surface, the ListErrorBanner open-invoices error surface, the
 * EntityLink invoice drill-through, the per-row Unapply action, and the "No applications
 * yet." empty text must all be preserved 1:1. No new GL math, no posting changes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payment-detail-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx";

const REQUIRED_LABELS = ["Invoice #", "Applied amount", "Open after", "Applied at", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
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
  if (!src.includes('storageKey="payment-detail-applications"')) {
    errors.push(`${PAGE}: must set storageKey="payment-detail-applications"`);
  }
  if (!src.includes('tableTestId="payment-detail-applications-table"')) {
    errors.push(`${PAGE}: must set tableTestId="payment-detail-applications-table"`);
  }
  if (!src.includes('emptyText="No applications yet."')) {
    errors.push(`${PAGE}: must keep the "No applications yet." empty text`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must keep ListErrorState on the payment detail query error`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner on the open-invoices query error`);
  }
  if (!src.includes('EntityLink kind="invoice"')) {
    errors.push(`${PAGE}: must keep the EntityLink invoice drill-through in the Invoice # cell`);
  }
  if (!src.includes("unapplyMutation.mutate(app.id)")) {
    errors.push(`${PAGE}: must keep the per-row Unapply action calling unapplyMutation.mutate(app.id)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    import { ListErrorState } from "../../components/ListErrorState";
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    const applicationColumns = [
      { key: "invoice_display_id", label: "Invoice #", render: (app) => <EntityLink kind="invoice" id={app.invoice_id ?? undefined} /> },
      { key: "amount_cents", label: "Applied amount" },
      { key: "invoice_amount_open_cents", label: "Open after" },
      { key: "applied_at", label: "Applied at" },
      { key: "actions", label: "Actions", render: (app) => <Button onClick={() => unapplyMutation.mutate(app.id)}>Unapply</Button> },
    ];
    <ParityTable
      storageKey="payment-detail-applications"
      tableTestId="payment-detail-applications-table"
      emptyText="No applications yet."
    />
  `;
  const bad = `
    export function PaymentDetailPage() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Invoice #</th></tr></thead>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/actions/error surfaces preserved; display-only.`);
}

main();
