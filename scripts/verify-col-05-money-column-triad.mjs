#!/usr/bin/env node
/**
 * COL-05 / INV-UI-MONEY-01 — Total / Open / Variance on AR/AP money list grids.
 * Applies to partially-payable document families (invoices, bills, customer payments).
 * Expenses/bill-payments/settlements remain N/A (single-shot records per register).
 *
 *   node scripts/verify-col-05-money-column-triad.mjs
 *   node scripts/verify-col-05-money-column-triad.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-col-05-money-column-triad";

const SURFACES = [
  {
    rel: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    varianceKey: "variance_cents",
  },
  {
    rel: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    varianceKey: "variance_cents",
  },
  {
    rel: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    varianceKey: "variance_cents",
  },
];

function auditSurface(src, { rel, varianceKey }) {
  const errors = [];
  const totalIdx = src.indexOf('label: "Total"');
  const openIdx = src.indexOf('label: "Open"');
  const varianceIdx = src.indexOf(`key: "${varianceKey}"`);
  const varianceLabelIdx = src.indexOf('label: "Variance"');

  if (totalIdx === -1) errors.push(`${rel}: missing label: "Total"`);
  if (openIdx === -1) errors.push(`${rel}: missing label: "Open"`);
  if (varianceIdx === -1) errors.push(`${rel}: missing key: "${varianceKey}"`);
  if (varianceLabelIdx === -1) errors.push(`${rel}: missing label: "Variance"`);

  if (totalIdx !== -1 && openIdx !== -1 && varianceIdx !== -1) {
    if (!(totalIdx < openIdx && openIdx < varianceIdx)) {
      errors.push(`${rel}: Total / Open / Variance columns must appear in that order`);
    }
  }

  if (!/variance\s*!==\s*0\s*\?\s*"text-red-700"/.test(src)) {
    errors.push(`${rel}: Variance cell must redden when non-zero (text-red-700)`);
  }

  return errors;
}

function selftest() {
  const goodInvoice = `
    { key: "total_cents", label: "Total" },
    { key: "amount_open_cents", label: "Open" },
    { key: "variance_cents", label: "Variance", render: (row) => (
      <span className={\`font-semibold \${variance !== 0 ? "text-red-700" : "text-slate-400"}\`}>{money(variance)}</span>
    )},
  `;
  if (auditSurface(goodInvoice, SURFACES[0]).length) {
    console.error(`${LABEL} --selftest FAIL good invoice fixture reddened`);
    process.exit(1);
  }

  const badMissingVariance = `
    { key: "total_cents", label: "Total" },
    { key: "amount_open_cents", label: "Open" },
  `;
  if (!auditSurface(badMissingVariance, SURFACES[0]).some((e) => e.includes("Variance"))) {
    console.error(`${LABEL} --selftest FAIL missing Variance not caught`);
    process.exit(1);
  }

  const badOrder = `
    { key: "variance_cents", label: "Variance" },
    { key: "total_cents", label: "Total" },
    { key: "amount_open_cents", label: "Open", render: () => <span className={\`\${variance !== 0 ? "text-red-700" : ""}\`} /> },
  `;
  if (!auditSurface(badOrder, SURFACES[0]).some((e) => e.includes("order"))) {
    console.error(`${LABEL} --selftest FAIL wrong column order not caught`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = [];
  for (const surface of SURFACES) {
    const src = fs.readFileSync(path.join(ROOT, surface.rel), "utf8");
    errors.push(...auditSurface(src, surface));
  }

  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`OK ${LABEL}: InvoicesListPage + BillsPage + PaymentsListPage expose Total/Open/Variance in order with red variance.`);
}

main();
