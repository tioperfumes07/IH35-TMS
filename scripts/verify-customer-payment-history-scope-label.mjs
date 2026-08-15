#!/usr/bin/env node
/**
 * LINK-F5170-F5171-CUSTOMER-PAYMENT-HISTORY-SCOPE-LABEL —
 *
 * ROOT CAUSE: apps/frontend/src/api/customers.ts's listCustomerPayments never sent
 * operating_company_id, but the backend's listCustomerPaymentsQuerySchema (customer-payments.
 * routes.ts) extends companyQuerySchema — a REQUIRED (non-optional) uuid. Every real call 400'd
 * unconditionally; CustomerDetail.tsx's `retry: false` + `data?.rows ?? []` fallback rendered
 * that as "No payments recorded" (false-empty, not legitimately-zero data). Separately, the
 * backend SELECT never projected accounting.payments.display_id (a real column, format
 * PMT-YYYY-NNNNN), so the row's own payment identity fell through entityLabel to a raw uuid.
 *
 * FIX: listCustomerPayments now requires + sends operating_company_id; the backend SELECT
 * projects p.display_id; the frontend row type carries it and renders it through entityLabel.
 *
 * Usage: node scripts/verify-customer-payment-history-scope-label.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-payment-history-scope-label";

const FILES = {
  api: "apps/frontend/src/api/customers.ts",
  routes: "apps/backend/src/accounting/customer-payments.routes.ts",
  detailPage: "apps/frontend/src/pages/CustomerDetail.tsx",
};

export function checkAll(readFile) {
  const failures = [];
  const read = (rel) => {
    const src = readFile(rel);
    if (src === null) failures.push(`${rel}: not found`);
    return src ?? "";
  };

  const api = read(FILES.api);
  if (!/function listCustomerPayments\(\s*customerId: string,\s*operatingCompanyId: string/.test(api)) {
    failures.push(`${FILES.api}: listCustomerPayments must require operatingCompanyId (backend query schema is non-optional)`);
  }
  if (!/operating_company_id:\s*operatingCompanyId/.test(api)) {
    failures.push(`${FILES.api}: listCustomerPayments must send operating_company_id in the query`);
  }
  if (!/display_id:\s*string;/.test(api)) {
    failures.push(`${FILES.api}: CustomerPaymentListRow must carry display_id`);
  }

  const routes = read(FILES.routes);
  if (!/p\.display_id,/.test(routes)) {
    failures.push(`${FILES.routes}: GET /customers/:id/payments must SELECT p.display_id`);
  }
  if (!/listCustomerPaymentsQuerySchema = companyQuerySchema\.extend/.test(routes)) {
    failures.push(`${FILES.routes}: list query schema must stay required-company-scoped (companyQuerySchema.extend)`);
  }

  const detail = read(FILES.detailPage);
  if (!/entityLabel\(p\.display_id, p\.id, "Payment"\)/.test(detail)) {
    failures.push(`${FILES.detailPage}: payment row must render entityLabel(p.display_id, p.id, "Payment"), not a null-display_id fallback to raw uuid`);
  }
  if (!/listCustomerPayments\(id, operatingCompanyId!/.test(detail)) {
    failures.push(`${FILES.detailPage}: customerPaymentsQuery must call listCustomerPayments with operatingCompanyId`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    [FILES.api]:
      'export function listCustomerPayments(customerId: string, operatingCompanyId: string, params: { limit?: number } = {}) {\n' +
      '  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });\n' +
      '  display_id: string;',
    [FILES.routes]:
      'const listCustomerPaymentsQuerySchema = companyQuerySchema.extend({\n' +
      '  SELECT\n    p.id,\n    p.display_id,\n    p.payment_date::text AS date,',
    [FILES.detailPage]:
      'queryFn: () => listCustomerPayments(id, operatingCompanyId!, { limit: 50 }),\n' +
      'render: (p) => <EntityLink kind="payment" id={p.id} label={entityLabel(p.display_id, p.id, "Payment")} />,',
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length < Object.keys(GOOD_FIXTURES).length + 2) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should trip every check`);
    process.exit(1);
  }
  // Targeted regression: reverting ONLY the detail page's label to the old null-display_id call.
  const labelRegressed = checkAll((f) =>
    f === FILES.detailPage
      ? GOOD_FIXTURES[f].replace('entityLabel(p.display_id, p.id, "Payment")', 'entityLabel(null, p.id, "Payment")')
      : (GOOD_FIXTURES[f] ?? null)
  );
  if (!labelRegressed.some((f) => f.includes(FILES.detailPage))) {
    console.error(`[${LABEL}] selftest FAIL: reverting to entityLabel(null, ...) must be caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed/targeted-regression fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — customer payment history is company-scoped and renders its real display_id`);
