#!/usr/bin/env node
// VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT
//
// apps/frontend/src/pages/VendorDetail.tsx's "Record Bill Payment" section (the multi-bill vendor
// payment flow, POST /api/v1/vendors/:id/bill-payments) never captured or sent a bank_account_id —
// the backend column `from_bank_account_id` stayed permanently NULL and `updateBankBalance` never
// ran for any payment recorded through this UI, silently skipping the bank-balance debit and
// breaking reconciliation/traceability for every such payment.
//
// This guard statically asserts:
// 1. apps/frontend/src/api/vendors.ts's recordVendorBillPayment forwards a bank_account_id field
//    in its POST body (not just accepting it on the payload type — actually sending it).
// 2. apps/frontend/src/pages/VendorDetail.tsx's recordVendorBillPayment call site passes a
//    bank_account_id into the payload (not just a type that allows one).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_FILE = path.join(__dirname, "..", "apps/frontend/src/api/vendors.ts");
const PAGE_FILE = path.join(__dirname, "..", "apps/frontend/src/pages/VendorDetail.tsx");

function checkApi(src) {
  const start = src.indexOf("export function recordVendorBillPayment");
  if (start === -1) return { ok: false, reason: "recordVendorBillPayment not found in api/vendors.ts" };
  const end = src.indexOf("\n}", start);
  const fn = src.slice(start, end + 2);
  if (!/body:\s*\{[^}]*bank_account_id\s*:\s*payload\.bank_account_id/s.test(fn)) {
    return { ok: false, reason: "POST body does not forward payload.bank_account_id as bank_account_id" };
  }
  return { ok: true };
}

function checkPage(src) {
  const idx = src.indexOf("recordVendorBillPayment(id, {");
  if (idx === -1) return { ok: false, reason: "recordVendorBillPayment(id, {...}) call site not found in VendorDetail.tsx" };
  const end = src.indexOf("}),", idx);
  const call = src.slice(idx, end + 3);
  if (!/bank_account_id\s*:/.test(call)) {
    return { ok: false, reason: "VendorDetail.tsx's recordVendorBillPayment call omits bank_account_id" };
  }
  return { ok: true };
}

function selftest() {
  const REGRESSED_API = `
export function recordVendorBillPayment(vendorId, payload) {
  return apiRequest(\`/api/v1/vendors/\${vendorId}/bill-payments\`, {
    method: "POST",
    body: {
      paid_at: payload.date,
      amount_cents: payload.amount_cents,
      payment_method: payload.method,
      reference_number: payload.reference,
      applications: payload.applications,
    },
  });
}
`;
  const r1 = checkApi(REGRESSED_API);
  if (r1.ok) throw new Error("selftest FAILED to catch the original api-layer regression (no bank_account_id)");

  const FIXED_API = `
export function recordVendorBillPayment(vendorId, payload) {
  return apiRequest(\`/api/v1/vendors/\${vendorId}/bill-payments\`, {
    method: "POST",
    body: {
      paid_at: payload.date,
      amount_cents: payload.amount_cents,
      payment_method: payload.method,
      bank_account_id: payload.bank_account_id,
      reference_number: payload.reference,
      applications: payload.applications,
    },
  });
}
`;
  const r2 = checkApi(FIXED_API);
  if (!r2.ok) throw new Error("selftest FAILED to accept the real api-layer fix: " + r2.reason);

  const REGRESSED_PAGE = `
      recordVendorBillPayment(id, {
        operating_company_id: companyId,
        date: billPayDate,
        amount_cents: billPayCents,
        method: billPayMethod,
        reference: billPayRef.trim() || undefined,
        applications: vendorBillPayBreakdown.applications,
      }),
`;
  const r3 = checkPage(REGRESSED_PAGE);
  if (r3.ok) throw new Error("selftest FAILED to catch the original call-site regression (no bank_account_id)");

  const FIXED_PAGE = `
      recordVendorBillPayment(id, {
        operating_company_id: companyId,
        date: billPayDate,
        amount_cents: billPayCents,
        method: billPayMethod,
        bank_account_id: billPayNeedsBankAccount ? billPayBankAccountId : undefined,
        reference: billPayRef.trim() || undefined,
        applications: vendorBillPayBreakdown.applications,
      }),
`;
  const r4 = checkPage(FIXED_PAGE);
  if (!r4.ok) throw new Error("selftest FAILED to accept the real call-site fix: " + r4.reason);

  console.log("  selftest: OK (api-layer + call-site regressions caught, both fixes accepted)");
}

const isSelftest = process.argv.includes("--selftest");
selftest();
if (isSelftest) {
  console.log("PASS (selftest only)");
  process.exit(0);
}

let apiSrc, pageSrc;
try {
  apiSrc = readFileSync(API_FILE, "utf8");
  pageSrc = readFileSync(PAGE_FILE, "utf8");
} catch (err) {
  console.error(`FAIL(gated): cannot read a target file: ${err.message}`);
  process.exit(1);
}

const apiResult = checkApi(apiSrc);
if (!apiResult.ok) {
  console.error(`FAIL(gated): apps/frontend/src/api/vendors.ts — ${apiResult.reason}`);
  process.exit(1);
}

const pageResult = checkPage(pageSrc);
if (!pageResult.ok) {
  console.error(`FAIL(gated): apps/frontend/src/pages/VendorDetail.tsx — ${pageResult.reason}`);
  process.exit(1);
}

console.log("PASS: VendorDetail's vendor bill payment flow captures and forwards bank_account_id end-to-end");
process.exit(0);
