#!/usr/bin/env node
/**
 * ACCT-F5633 — accounting.invoices.amount_open_cents is a GENERATED column (total_cents -
 * amount_paid_cents, migration 0123) with NO knowledge of accounting.credit_memo_applications.
 * credit-memos.routes.ts's own apply route already nets non-voided credit-memo applications off
 * before capping a NEW credit-memo application, and ar-aging.service.ts was retrofitted the same way
 * under ACCT-F5612 — but neither cash-payment-apply cap check (apply.service.ts's applyToInvoice, and
 * customer-payments.routes.ts's inline duplicate) ever got the same netting. Without it, a cash
 * payment could apply on top of a balance a credit memo already covered — a real A/R overcollection.
 */
import fs from "node:fs";

const TARGETS = [
  { file: "apps/backend/src/accounting/payments/apply.service.ts", label: "applyToInvoice (apply.service.ts)" },
  { file: "apps/backend/src/accounting/customer-payments.routes.ts", label: "customer-payments create route" },
];

export function run(root = process.cwd()) {
  const failures = [];

  const applyServiceSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/payments/apply.service.ts`, "utf8");
  if (!applyServiceSrc.includes("export async function getAppliedCreditMemoCents")) {
    failures.push("apply.service.ts must export getAppliedCreditMemoCents (the shared helper both call sites use)");
  }
  if (!/voided_at IS NULL/.test(applyServiceSrc) || !applyServiceSrc.includes("credit_memo_applications")) {
    failures.push("getAppliedCreditMemoCents must exclude voided (voided_at IS NOT NULL) credit-memo applications");
  }

  for (const { file, label } of TARGETS) {
    const src = fs.readFileSync(`${root}/${file}`, "utf8");
    if (!src.includes("getAppliedCreditMemoCents")) {
      failures.push(`${label} (${file}) does not call getAppliedCreditMemoCents — the invoice cap is not net of applied credit memos`);
      continue;
    }
    // The subtraction must actually happen, not just a discarded call.
    const usesResult = /invoiceRemainingCents\s*=[^;]*appliedCreditMemoCents/.test(src);
    if (!usesResult) {
      failures.push(`${label} (${file}) calls getAppliedCreditMemoCents but does not subtract it into the cap calculation`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-customer-payment-apply-credit-memo-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodWriter = `
const appliedCreditMemoCents = await getAppliedCreditMemoCents(client, operatingCompanyId, invoice.id);
const invoiceRemainingCents = Number(invoice.amount_open_cents ?? 0) - appliedCreditMemoCents;
if (row.amount_cents > invoiceRemainingCents) throw new Error("amount_exceeds_invoice_open");
`;
  const goodService = `
export async function getAppliedCreditMemoCents(client, operatingCompanyId, invoiceId) {
  // ... credit_memo_applications ... voided_at IS NULL ...
}

${goodWriter}
`;
  mk("apps/backend/src/accounting/payments/apply.service.ts", goodService);
  mk("apps/backend/src/accounting/customer-payments.routes.ts", goodWriter);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: a writer stops calling the helper entirely.
  mk("apps/backend/src/accounting/customer-payments.routes.ts", "const remaining = invoice.amount_open_cents;\n");
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: writer with no getAppliedCreditMemoCents call should be caught");
  if (!f.some((m) => m.includes("customer-payments create route"))) {
    throw new Error("FAIL fail: message should name the customer-payments create route");
  }

  // Regression 2: the helper is called but its result is never subtracted (dead call).
  mk(
    "apps/backend/src/accounting/customer-payments.routes.ts",
    `
const _unused = await getAppliedCreditMemoCents(client, operatingCompanyId, invoice.id);
const invoiceRemainingCents = Number(invoice.amount_open_cents ?? 0);
`
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: dead getAppliedCreditMemoCents call (result unused) should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-customer-payment-apply-nets-credit-memos --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-customer-payment-apply-nets-credit-memos — OK");
}
