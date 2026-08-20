#!/usr/bin/env node
/**
 * ACCT-F5623 — every bill-payment WRITE path must cap the payable amount net of non-voided
 * accounting.vendor_credit_applications, the same way BILL_OPEN_BALANCE_SQL already nets them on the
 * read side (bills.service.ts, AP aging / bills list / Pay-Bill picker). Without this, a bill already
 * partly or fully settled by a vendor credit can still be paid in cash up to its face amount minus
 * prior PAYMENTS only — a real duplicate/over-payment of company cash.
 *
 * Three writers, one shared helper (bills.service.ts's getAppliedVendorCreditsCents): payBill()
 * itself, the vendor bill-payments route (single + batch), and the bulk mark_paid action — the most
 * exposed of the three, since it has no caller-specified amount at all and just pays whatever
 * `remaining` computes to.
 */
import fs from "node:fs";

const TARGETS = [
  { file: "apps/backend/src/accounting/bills.service.ts", label: "payBill()" },
  { file: "apps/backend/src/accounting/vendor-bill-payments.routes.ts", label: "vendor bill-payments route" },
  { file: "apps/backend/src/accounting/bills-bulk.routes.ts", label: "bulk mark_paid action" },
];

export function run(root = process.cwd()) {
  const failures = [];

  const serviceSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/bills.service.ts`, "utf8");
  if (!serviceSrc.includes("export async function getAppliedVendorCreditsCents")) {
    failures.push("bills.service.ts must export getAppliedVendorCreditsCents (the shared helper all three writers call)");
  }
  if (!/voided_at IS NULL/.test(serviceSrc) || !serviceSrc.includes("vendor_credit_applications")) {
    failures.push("getAppliedVendorCreditsCents must exclude voided (voided_at IS NOT NULL) vendor credit applications");
  }

  for (const { file, label } of TARGETS) {
    const src = fs.readFileSync(`${root}/${file}`, "utf8");
    if (!src.includes("getAppliedVendorCreditsCents")) {
      failures.push(`${label} (${file}) does not call getAppliedVendorCreditsCents — remaining balance is not net of vendor credits`);
      continue;
    }
    // The subtraction must actually happen: "remaining = ... - appliedCreditsCents" (or equivalent
    // variable name) — a call whose result is discarded would satisfy the string check above while
    // fixing nothing.
    const usesResult = /remaining\s*=[^;]*appliedCreditsCents/.test(src);
    if (!usesResult) {
      failures.push(`${label} (${file}) calls getAppliedVendorCreditsCents but does not subtract it into the remaining-balance calculation`);
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
const remaining = amount - paid - appliedCreditsCents;
`;
  const goodService = `
export async function getAppliedVendorCreditsCents(client, billId, operatingCompanyId) {
  // ... vendor_credit_applications ... voided_at IS NULL ...
}

export async function payBill(input, userId) {
${goodWriter}
}
`;
  mk("apps/backend/src/accounting/bills.service.ts", goodService);
  mk("apps/backend/src/accounting/vendor-bill-payments.routes.ts", goodWriter);
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", goodWriter);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: a writer stops calling the helper entirely.
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", "const remaining = amountCents - paidCents;\n");
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: writer with no getAppliedVendorCreditsCents call should be caught");
  if (!f.some((m) => m.includes("bulk mark_paid"))) throw new Error("FAIL fail: message should name bulk mark_paid action");

  // Regression 2: the helper is called but its result is never subtracted (dead call).
  mk(
    "apps/backend/src/accounting/bills-bulk.routes.ts",
    `
const _unused = await getAppliedVendorCreditsCents(client, billId, operatingCompanyId);
const remaining = amountCents - paidCents;
`
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: dead getAppliedVendorCreditsCents call (result unused) should be caught");

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
