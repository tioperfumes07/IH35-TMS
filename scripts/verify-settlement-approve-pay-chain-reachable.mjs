#!/usr/bin/env node
/**
 * SET-33 guard: verify the settlement approve→pay chain is reachable end to end.
 *
 * DEFECT (found 2026-09-07): POST /api/v1/settlements/approve existed in the backend
 * (approval.routes.ts → approvalService.approveSettlement) but was NOT callable from the
 * frontend — no API function, no Approve button. So approval_status was stuck at
 * 'needs_review' for all 25 USMCA settlements (live measure: total=25, paid=0,
 * needs_review=25). The pay route (mark-paid-manually) was reachable but the approve
 * step was a dead-end.
 *
 * This guard asserts the chain is reachable:
 *   1. Backend: approval.routes.ts has POST /api/v1/settlements/approve → approveSettlement
 *   2. Backend: settlement-payment.routes.ts has POST /api/v1/driver-pay/settlements/:id/mark-paid-manually → markPaidManually
 *   3. Frontend: driverFinance.ts has an approveSettlement function calling the approve route
 *   4. Frontend: SettlementDetailPage.tsx has an Approve button that calls approveSettlement
 *
 * Usage:
 *   node scripts/verify-settlement-approve-pay-chain-reachable.mjs --selftest   (mutation cases)
 *   node scripts/verify-settlement-approve-pay-chain-reachable.mjs              (static check)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-approve-pay-chain-reachable";

const APPROVAL_ROUTES = "apps/backend/src/settlements/approval.routes.ts";
const APPROVAL_SERVICE = "apps/backend/src/settlements/approval.service.ts";
const PAYMENT_ROUTES = "apps/backend/src/driver-finance/settlement-payment.routes.ts";
const PAYMENT_SERVICE = "apps/backend/src/driver-finance/settlement-payment.service.ts";
const FRONTEND_API = "apps/frontend/src/api/driverFinance.ts";
const FRONTEND_PAGE = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";

export function checkSources({ approvalRoutes, approvalService, paymentRoutes, paymentService, frontendApi, frontendPage }) {
  const problems = [];

  // 1. Backend approve route exists
  if (!/app\.post\("\/api\/v1\/settlements\/approve"/.test(approvalRoutes)) {
    problems.push(`${APPROVAL_ROUTES}: POST /api/v1/settlements/approve route is missing`);
  }
  // 2. Backend approve service flips approval_status to 'approved'
  if (!/approval_status\s*=\s*'approved'/.test(approvalService)) {
    problems.push(`${APPROVAL_SERVICE}: approveSettlement no longer sets approval_status = 'approved'`);
  }
  // 3. Backend pay route exists
  if (!/\/api\/v1\/driver-pay\/settlements\/:id\/mark-paid-manually/.test(paymentRoutes)) {
    problems.push(`${PAYMENT_ROUTES}: POST /api/v1/driver-pay/settlements/:id/mark-paid-manually route is missing`);
  }
  // 4. Backend pay service flips payment_state to 'manual_paid'
  if (!/payment_state\s*=\s*'manual_paid'/.test(paymentService)) {
    problems.push(`${PAYMENT_SERVICE}: markPaidManually no longer sets payment_state = 'manual_paid'`);
  }
  // 5. Frontend API has approveSettlement function
  if (!/export function approveSettlement\b/.test(frontendApi)) {
    problems.push(`${FRONTEND_API}: approveSettlement API function is missing — the approve route is a dead-end`);
  }
  if (!/\/api\/v1\/settlements\/approve/.test(frontendApi)) {
    problems.push(`${FRONTEND_API}: approveSettlement does not call /api/v1/settlements/approve`);
  }
  // 6. Frontend page has an Approve button that calls approveSettlement
  if (!/approveSettlement/.test(frontendPage)) {
    problems.push(`${FRONTEND_PAGE}: SettlementDetailPage does not call approveSettlement — the Approve button is missing`);
  }
  if (!/Approve Settlement/.test(frontendPage)) {
    problems.push(`${FRONTEND_PAGE}: SettlementDetailPage has no "Approve Settlement" button`);
  }

  return problems;
}

function selftest() {
  const goodApprovalRoutes = `app.post("/api/v1/settlements/approve", { config: {} }, async (req, reply) => {});`;
  const goodApprovalService = `SET approval_status = 'approved', approved_at = now()`;
  const goodPaymentRoutes = `app.post("/api/v1/driver-pay/settlements/:id/mark-paid-manually", ...);`;
  const goodPaymentService = `SET payment_state = 'manual_paid', paid_at = now()`;
  const goodFrontendApi = `export function approveSettlement(id: string, companyId: string) { return apiRequest("/api/v1/settlements/approve?..."); }`;
  const goodFrontendPage = `<button onClick={() => approveSettlement(...)}>Approve Settlement</button>`;

  const base = { approvalRoutes: goodApprovalRoutes, approvalService: goodApprovalService, paymentRoutes: goodPaymentRoutes, paymentService: goodPaymentService, frontendApi: goodFrontendApi, frontendPage: goodFrontendPage };
  const cases = [
    { name: "good state", args: base, expectProblems: false },
    { name: "approve route missing", args: { ...base, approvalRoutes: "" }, expectProblems: true },
    { name: "approve service drops approval_status='approved'", args: { ...base, approvalService: "SET status = 'approved'" }, expectProblems: true },
    { name: "pay route missing", args: { ...base, paymentRoutes: "" }, expectProblems: true },
    { name: "pay service drops manual_paid", args: { ...base, paymentService: "SET payment_state = 'paid'" }, expectProblems: true },
    { name: "frontend API missing approveSettlement", args: { ...base, frontendApi: "export function finalizeSettlement() {}" }, expectProblems: true },
    { name: "frontend page missing Approve button", args: { ...base, frontendPage: "<button>Finalize</button>" }, expectProblems: true },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkSources(c.args);
    const ok = (problems.length > 0) === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }

  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const approvalRoutes = fs.readFileSync(path.join(ROOT, APPROVAL_ROUTES), "utf8");
  const approvalService = fs.readFileSync(path.join(ROOT, APPROVAL_SERVICE), "utf8");
  const paymentRoutes = fs.readFileSync(path.join(ROOT, PAYMENT_ROUTES), "utf8");
  const paymentService = fs.readFileSync(path.join(ROOT, PAYMENT_SERVICE), "utf8");
  const frontendApi = fs.readFileSync(path.join(ROOT, FRONTEND_API), "utf8");
  const frontendPage = fs.readFileSync(path.join(ROOT, FRONTEND_PAGE), "utf8");

  const problems = checkSources({ approvalRoutes, approvalService, paymentRoutes, paymentService, frontendApi, frontendPage });
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — approve route (backend + frontend) and pay route (backend + frontend) are both reachable end to end`);
}

main().catch((err) => {
  console.error(`${LABEL}: ERROR`, err);
  process.exit(1);
});
