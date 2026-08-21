#!/usr/bin/env node
/**
 * ACCT-F5623 — every bill-payment WRITE path must cap the payable amount net of non-voided
 * accounting.vendor_credit_applications, the same way BILL_OPEN_BALANCE_SQL already nets them on the
 * read side (bills.service.ts, AP aging / bills list / Pay-Bill picker). Without this, a bill already
 * partly or fully settled by a vendor credit can still be paid in cash up to its face amount minus
 * prior PAYMENTS only — a real duplicate/over-payment of company cash.
 *
 * ACCT-F5691 — the SAME class of gap for accounting.payment_applications (target_kind='bill'), a
 * separate cash-application path (apply.service.ts's applyToBill). It has its OWN writer too — a
 * second application to the same bill via this path must net the first, or it silently overshoots
 * the bill's real open balance with no bound (the cap check re-read the same stale paid_cents every
 * time, since bills.paid_cents never learns about this path — see bills.service.ts's own comment on
 * APPLIED_BILL_PAYMENT_APPLICATIONS_SQL for why it must never gain a fifth writer there).
 *
 * Four writers total, two shared helpers (bills.service.ts's getAppliedVendorCreditsCents and
 * getAppliedBillPaymentApplicationsCents): payBill() itself, the vendor bill-payments route (single +
 * batch), the bulk mark_paid action (the most exposed of the three original writers — no
 * caller-specified amount at all, just pays whatever `remaining` computes to), and now
 * apply.service.ts's applyToBill (the ACCT-F5691 writer, which additionally must net ITS OWN prior
 * applications, not just vendor credits).
 */
import fs from "node:fs";

const TARGETS = [
  { file: "apps/backend/src/accounting/bills.service.ts", label: "payBill()" },
  { file: "apps/backend/src/accounting/vendor-bill-payments.routes.ts", label: "vendor bill-payments route" },
  { file: "apps/backend/src/accounting/bills-bulk.routes.ts", label: "bulk mark_paid action" },
  { file: "apps/backend/src/accounting/payments/apply.service.ts", label: "apply.service.ts applyToBill" },
];

export function run(root = process.cwd()) {
  const failures = [];

  const serviceSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/bills.service.ts`, "utf8");
  if (!serviceSrc.includes("export async function getAppliedVendorCreditsCents")) {
    failures.push("bills.service.ts must export getAppliedVendorCreditsCents (the shared helper all writers call)");
  }
  if (!/voided_at IS NULL/.test(serviceSrc) || !serviceSrc.includes("vendor_credit_applications")) {
    failures.push("getAppliedVendorCreditsCents must exclude voided (voided_at IS NOT NULL) vendor credit applications");
  }
  if (!serviceSrc.includes("export async function getAppliedBillPaymentApplicationsCents")) {
    failures.push("bills.service.ts must export getAppliedBillPaymentApplicationsCents (ACCT-F5691, the shared helper for the payment_applications/target_kind='bill' path)");
  }
  if (!/unapplied_at IS NULL/.test(serviceSrc) || !serviceSrc.includes("target_kind = 'bill'")) {
    failures.push("getAppliedBillPaymentApplicationsCents must scope to target_kind='bill' and exclude unapplied (voided) rows");
  }

  for (const { file, label } of TARGETS) {
    const src = fs.readFileSync(`${root}/${file}`, "utf8");
    if (!src.includes("getAppliedVendorCreditsCents")) {
      failures.push(`${label} (${file}) does not call getAppliedVendorCreditsCents — remaining balance is not net of vendor credits`);
      continue;
    }
    if (!src.includes("getAppliedBillPaymentApplicationsCents")) {
      failures.push(`${label} (${file}) does not call getAppliedBillPaymentApplicationsCents — remaining balance is not net of prior payment_applications (ACCT-F5691)`);
      continue;
    }
    // The subtraction must actually happen: "remaining = ... - appliedCreditsCents" (or equivalent
    // variable name) — a call whose result is discarded would satisfy the string check above while
    // fixing nothing. Same requirement for the ACCT-F5691 sibling, and for applyToBill's own
    // billOpen variable (it does not use the name "remaining").
    const usesVendorCreditsResult = /(remaining|billOpen)\s*=[^;]*appliedCreditsCents/.test(src);
    if (!usesVendorCreditsResult) {
      failures.push(`${label} (${file}) calls getAppliedVendorCreditsCents but does not subtract it into the remaining/open-balance calculation`);
    }
    const usesPaymentApplicationsResult = /(remaining|billOpen)\s*=[^;]*appliedPaymentApplicationsCents/.test(src);
    if (!usesPaymentApplicationsResult) {
      failures.push(`${label} (${file}) calls getAppliedBillPaymentApplicationsCents but does not subtract it into the remaining/open-balance calculation`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bill-payment-nets-vendor-credits-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodWriter = `
const appliedCreditsCents = await getAppliedVendorCreditsCents(client, billId, operatingCompanyId);
const appliedPaymentApplicationsCents = await getAppliedBillPaymentApplicationsCents(client, billId, operatingCompanyId);
const remaining = amount - paid - appliedCreditsCents - appliedPaymentApplicationsCents;
`;
  const goodApplyToBillWriter = `
const appliedCreditsCents = await getAppliedVendorCreditsCents(client, row.target_id, operatingCompanyId);
const appliedPaymentApplicationsCents = await getAppliedBillPaymentApplicationsCents(client, row.target_id, operatingCompanyId);
const billOpen = Math.max(0, billTotal - billPaid - appliedCreditsCents - appliedPaymentApplicationsCents);
`;
  const goodService = `
export async function getAppliedVendorCreditsCents(client, billId, operatingCompanyId) {
  // ... vendor_credit_applications ... voided_at IS NULL ...
}

export async function getAppliedBillPaymentApplicationsCents(client, billId, operatingCompanyId) {
  // ... payment_applications ... target_kind = 'bill' ... unapplied_at IS NULL ...
}

export async function payBill(input, userId) {
${goodWriter}
}
`;
  mk("apps/backend/src/accounting/bills.service.ts", goodService);
  mk("apps/backend/src/accounting/vendor-bill-payments.routes.ts", goodWriter);
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", goodWriter);
  mk("apps/backend/src/accounting/payments/apply.service.ts", goodApplyToBillWriter);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: a writer stops calling the vendor-credits helper entirely.
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", "const remaining = amountCents - paidCents;\n");
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: writer with no getAppliedVendorCreditsCents call should be caught");
  if (!f.some((m) => m.includes("bulk mark_paid"))) throw new Error("FAIL fail: message should name bulk mark_paid action");
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", goodWriter);

  // Regression 2: the helper is called but its result is never subtracted (dead call).
  mk(
    "apps/backend/src/accounting/bills-bulk.routes.ts",
    `
const _unused = await getAppliedVendorCreditsCents(client, billId, operatingCompanyId);
const appliedPaymentApplicationsCents = await getAppliedBillPaymentApplicationsCents(client, billId, operatingCompanyId);
const remaining = amountCents - paidCents - appliedPaymentApplicationsCents;
`
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: dead getAppliedVendorCreditsCents call (result unused) should be caught");
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", goodWriter);

  // Regression 3 (ACCT-F5691) — a writer stops calling the payment_applications sibling entirely.
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", "const appliedCreditsCents = await getAppliedVendorCreditsCents(client, billId, operatingCompanyId);\nconst remaining = amountCents - paidCents - appliedCreditsCents;\n");
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: writer with no getAppliedBillPaymentApplicationsCents call should be caught");
  if (!f.some((m) => m.includes("ACCT-F5691"))) throw new Error("FAIL fail: message should reference ACCT-F5691");
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", goodWriter);

  // Regression 4 (ACCT-F5691) — applyToBill's own writer drops the netting (its variable is billOpen, not remaining).
  mk("apps/backend/src/accounting/payments/apply.service.ts", "const billOpen = Math.max(0, billTotal - billPaid);\n");
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: applyToBill with no netting at all should be caught");
  mk("apps/backend/src/accounting/payments/apply.service.ts", goodApplyToBillWriter);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bill-payment-nets-vendor-credits --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-bill-payment-nets-vendor-credits — OK");
}
