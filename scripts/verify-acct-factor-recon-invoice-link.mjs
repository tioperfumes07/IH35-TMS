#!/usr/bin/env node
/**
 * verify-acct-factor-recon-invoice-link — Factor reconciliation reverse (26/28).
 *
 * Root cause: FactorReconciliationItem.invoice_id was returned by the API but the items
 * ParityTable rendered statement invoice text only — no EntityLink reverse to the ledger invoice.
 *
 * Fix: Ledger invoice column with EntityLink kind=invoice. No posting/GL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-factor-recon-invoice-link";
const PAGE = "apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check(src) {
  const errors = [];
  if (!src) {
    errors.push(`${PAGE}: missing`);
    return errors;
  }
  if (!src.includes('from "../../components/shared/EntityLink"')) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  if (!src.includes('key: "invoice_id"') || !src.includes('label: "Ledger invoice"')) {
    errors.push(`${PAGE}: must expose Ledger invoice column on invoice_id`);
  }
  if (!/kind="invoice"/.test(src) || !/item\.invoice_id/.test(src)) {
    errors.push(`${PAGE}: must EntityLink kind=invoice on item.invoice_id`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { EntityLink } from "../../components/shared/EntityLink";
    { key: "invoice_id", label: "Ledger invoice",
      render: (item) => <EntityLink kind="invoice" id={item.invoice_id ?? undefined} /> }
  `;
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAILED on good fixture`);
    process.exit(1);
  }
  const bad = `render: (item) => <span>{item.statement_invoice_number}</span>`;
  if (check(bad).length < 2) {
    console.error(`${LABEL} SELFTEST FAILED: planted gap must fail`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`PASS: ${LABEL} --selftest`);
  process.exit(0);
}

const errors = check(read(PAGE));
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`PASS: ${LABEL}`);
