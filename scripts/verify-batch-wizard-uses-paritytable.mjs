#!/usr/bin/env node
/**
 * verify-batch-wizard-uses-paritytable — qbo-parity-a1 (Factoring BatchWizard step-1 candidates surface)
 *
 * The factoring batch-wizard candidate-invoice selection list must use the shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. DISPLAY-ONLY migration: the Pick
 * checkbox (toggleInvoice) and the draft/submit mutation handlers stay untouched, and the
 * Face Amount money rendering (asMoney) stays 1:1. Load failures must surface ListErrorState
 * (never a false-empty candidate list).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-batch-wizard-uses-paritytable";
const PAGE = "apps/frontend/src/pages/factoring/BatchWizard.tsx";

const REQUIRED_LABELS = ["Pick", "Invoice", "Customer", "Issue Date", "Due Date", "Face Amount"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"') && !src.includes("from '../../components/parity/ParityTable'")) {
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
  if (!src.includes('storageKey="factoring-batch-wizard-candidates"')) {
    errors.push(`${PAGE}: must set storageKey="factoring-batch-wizard-candidates"`);
  }
  if (!src.includes('tableTestId="factoring-batch-wizard-candidates-parity"')) {
    errors.push(`${PAGE}: must set tableTestId="factoring-batch-wizard-candidates-parity"`);
  }
  if (!src.includes("No paid-ready invoices available for a new batch.")) {
    errors.push(`${PAGE}: must keep emptyText`);
  }
  if (!src.includes("toggleInvoice(invoice.id)")) {
    errors.push(`${PAGE}: must keep the Pick checkbox toggleInvoice handler`);
  }
  if (!src.includes("asMoney(invoice.total_cents)")) {
    errors.push(`${PAGE}: must keep asMoney(invoice.total_cents) for Face Amount`);
  }
  if (!src.includes("Couldn't load candidate invoices")) {
    errors.push(`${PAGE}: must keep ListErrorState title for candidates outage`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const candidateColumns = [
      { key: "pick", label: "Pick", render: (invoice) => (
        <input type="checkbox" checked={selectedInvoiceIds.includes(invoice.id)} onChange={() => toggleInvoice(invoice.id)} />
      ) },
      { key: "display_id", label: "Invoice" },
      { key: "customer_name", label: "Customer" },
      { key: "issue_date", label: "Issue Date" },
      { key: "due_date", label: "Due Date" },
      { key: "total_cents", label: "Face Amount", render: (invoice) => asMoney(invoice.total_cents) },
    ];
    <ListErrorState title="Couldn't load candidate invoices" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="factoring-batch-wizard-candidates"
      tableTestId="factoring-batch-wizard-candidates-parity"
      emptyText="No paid-ready invoices available for a new batch."
    />
  `;
  const bad = `
    export function BatchWizard() {
      return (
        <div>
          <table><thead><tr><th>Pick</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; Pick/money renderers + handlers preserved.`);
}

main();
