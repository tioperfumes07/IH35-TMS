#!/usr/bin/env node
/**
 * verify-customer-payment-unapply-hits-mounted-route.mjs (CUST-MONEY-F6105)
 *
 * CustomerDetail.tsx's "Unapply" button used to call unapplyCustomerPayment(), which POSTed
 * /api/v1/customers/:customerId/payments/:paymentId/unapply — a route NO backend file ever
 * mounted (customer-payments.routes.ts only registers GET and POST /:id/payments). Every real
 * click 404'd, silently swallowed by the mutation's onError toast.
 *
 * The canonical, MOUNTED operation is company-scoped DELETE
 * /api/v1/accounting/payments/:paymentId/applications/:id (payment-applications.routes.ts),
 * which needs the payment_applications row's own id — a value the customer-payments list route
 * never selected.
 *
 * This guard asserts, against the REAL files:
 *   1. apps/frontend/src/api/customers.ts no longer defines the dead POST .../unapply call.
 *   2. apps/frontend/src/pages/CustomerDetail.tsx's unapply mutation calls into the canonical
 *      accounting.ts unapplyPayment (re-exported as unapplyCustomerPaymentApplication), not a
 *      customers.ts-local dead route.
 *   3. apps/backend/src/accounting/customer-payments.routes.ts's applied_to_invoices JSON includes
 *      `application_id` (pa.id) — the value the fix threads through to the canonical DELETE call.
 *
 * FAIL if any of the three drifts back to the disconnected shape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-payment-unapply-hits-mounted-route";

const CUSTOMERS_API_FILE = "apps/frontend/src/api/customers.ts";
const CUSTOMER_DETAIL_FILE = "apps/frontend/src/pages/CustomerDetail.tsx";
const BACKEND_ROUTE_FILE = "apps/backend/src/accounting/customer-payments.routes.ts";
const PAYMENT_DETAIL_FILE = "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `sources` (an object with the three file contents) to exercise this exact
 * function against synthetic content for the selftest; omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const customersApiSrc = sources ? sources.customersApi : (() => { try { return readReal(CUSTOMERS_API_FILE); } catch { return null; } })();
  const customerDetailSrc = sources ? sources.customerDetail : (() => { try { return readReal(CUSTOMER_DETAIL_FILE); } catch { return null; } })();
  const backendRouteSrc = sources ? sources.backendRoute : (() => { try { return readReal(BACKEND_ROUTE_FILE); } catch { return null; } })();
  const paymentDetailSrc = sources ? sources.paymentDetail : (() => { try { return readReal(PAYMENT_DETAIL_FILE); } catch { return null; } })();

  if (customersApiSrc == null) return [`${CUSTOMERS_API_FILE} not found`];
  if (customerDetailSrc == null) return [`${CUSTOMER_DETAIL_FILE} not found`];
  if (backendRouteSrc == null) return [`${BACKEND_ROUTE_FILE} not found`];
  if (paymentDetailSrc == null) return [`${PAYMENT_DETAIL_FILE} not found`];

  // (1) The dead unmounted route string must not be constructed anywhere in the frontend API layer.
  const deadRoutePattern = /\/payments\/\$\{[a-zA-Z]+\}\/unapply/;
  if (deadRoutePattern.test(customersApiSrc)) {
    failures.push(
      `${CUSTOMERS_API_FILE}: still builds the dead .../payments/:paymentId/unapply URL — ` +
        `no backend route mounts this path, every call 404s`
    );
  }

  // (2) LEAD 443.104 (2026-10-12).
  //   old rule: CustomerDetail mounts unapplyCustomerPaymentMutation calling unapplyCustomerPaymentApplication(payment.id,
  //             application.application_id, …).
  //   new rule: the customer profile mounts NO unapply writer and links each applied payment to the payment itself in
  //             Accounting (/accounting/payments/:id); PaymentDetailPage's Unapply is the one writer — it calls the
  //             canonical unapplyPayment(id, applicationId, …) (mounted DELETE .../applications/:id) and only after a
  //             ConfirmModal.
  //   why: owner ORDERS 2026-10-01 §3 made the customer profile A/R READ ONLY (CUST-F20 #23767 removed the profile
  //        writer; verify-customer-billing-invoice-wired fails a writer coming back). fb17a4b687 re-added the mutation
  //        to satisfy the old rule and never wired it (main typecheck red). The dead-route regression this guard exists
  //        for is still caught by (1) and by (2b) below.
  if (/unapplyCustomerPaymentApplication\s*\(|unapplyPayment\s*\(|unapplyCustomerPayment\s*\(/.test(customerDetailSrc)) {
    failures.push(`${CUSTOMER_DETAIL_FILE}: the A/R read-only customer profile mounts an unapply writer — unapply belongs on the payment in Accounting`);
  }
  if (!/applied_to_invoices[\s\S]{0,200}href=\{`\/accounting\/payments\/\$\{p\.id\}`\}/.test(customerDetailSrc)) {
    failures.push(`${CUSTOMER_DETAIL_FILE}: an applied payment must link to /accounting/payments/:id (Unapply in Accounting)`);
  }
  // (2b) The one unapply writer calls the canonical mounted route with the application's own id, behind a confirm.
  if (!/unapplyPayment\(id,\s*applicationId,/.test(paymentDetailSrc)) {
    failures.push(`${PAYMENT_DETAIL_FILE}: Unapply no longer calls the canonical unapplyPayment(id, applicationId, …) (mounted DELETE .../applications/:id)`);
  }
  if (!/setPendingUnapplyId\(app\.id\)/.test(paymentDetailSrc) || !/<ConfirmModal[\s\S]{0,900}unapplyMutation\.mutateAsync\(pendingUnapplyId\)/.test(paymentDetailSrc) || /onClick=\{\(\) => unapplyMutation\.mutate\(/.test(paymentDetailSrc)) {
    failures.push(`${PAYMENT_DETAIL_FILE}: Unapply must be confirmed (ConfirmModal) before it is sent`);
  }

  // (3) The backend list route must select payment_applications.id so the frontend has something to
  // send. Scope to the applied_to_invoices json_build_object block specifically (not the whole file)
  // so this doesn't false-pass on an unrelated `pa.id` reference elsewhere.
  const jsonBuildStart = backendRouteSrc.indexOf("json_build_object");
  const jsonBuildEnd = jsonBuildStart >= 0 ? backendRouteSrc.indexOf(")", backendRouteSrc.indexOf("invoice_display_id", jsonBuildStart)) : -1;
  const jsonBuildBlock = jsonBuildStart >= 0 && jsonBuildEnd >= 0 ? backendRouteSrc.slice(jsonBuildStart, jsonBuildEnd) : "";
  if (!/'application_id',\s*pa\.id/.test(jsonBuildBlock)) {
    failures.push(
      `${BACKEND_ROUTE_FILE}: applied_to_invoices json_build_object no longer selects 'application_id', pa.id — ` +
        `the frontend's Unapply action has no application id to call the canonical route with`
    );
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodCustomersApi = `
    export { unapplyPayment as unapplyCustomerPaymentApplication } from "./accounting";
  `;
  const regressedCustomersApi = `
    export function unapplyCustomerPayment(customerId, paymentId) {
      return apiRequest(\`/api/v1/customers/\${customerId}/payments/\${paymentId}/unapply\`, { method: "POST" });
    }
  `;
  const goodCustomerDetail = `
    render: (p) => (p.applied_to_invoices ?? []).length > 0 ? (<a href={\`/accounting/payments/\${p.id}\`}>Unapply in Accounting</a>) : "—",
  `;
  const regressedCustomerDetailWriter = `${goodCustomerDetail}
    const m = useMutation({ mutationFn: (p) => unapplyCustomerPaymentApplication(p.id, p.applied_to_invoices[0].application_id, c) });
  `;
  const regressedCustomerDetailDeadRoute = `${goodCustomerDetail}
    const m = useMutation({ mutationFn: (paymentId) => unapplyCustomerPayment(id, paymentId) });
  `;
  const regressedCustomerDetailNoLink = `render: (p) => "—",`;
  const goodPaymentDetail = `
    const unapplyMutation = useMutation({ mutationFn: (applicationId) => unapplyPayment(id, applicationId, selectedCompanyId!) });
    <Button onClick={() => setPendingUnapplyId(app.id)}>Unapply</Button>
    <ConfirmModal open={pendingUnapplyId !== null} onConfirm={async () => { await unapplyMutation.mutateAsync(pendingUnapplyId); }} />
  `;
  const regressedPaymentDetailNoConfirm = `
    const unapplyMutation = useMutation({ mutationFn: (applicationId) => unapplyPayment(id, applicationId, selectedCompanyId!) });
    <Button onClick={() => unapplyMutation.mutate(app.id)}>Unapply</Button>
  `;
  const regressedPaymentDetailWrongId = goodPaymentDetail.replace("unapplyPayment(id, applicationId,", "unapplyPayment(id, id,");
  const goodBackendRoute = `
    SELECT json_agg(
      json_build_object(
        'application_id', pa.id,
        'invoice_id', pa.invoice_id,
        'amount_cents', pa.amount_cents,
        'invoice_display_id', i.display_id
      )
    ) AS applied_to_invoices
  `;
  const regressedBackendRoute = `
    SELECT json_agg(
      json_build_object(
        'invoice_id', pa.invoice_id,
        'amount_cents', pa.amount_cents,
        'invoice_display_id', i.display_id
      )
    ) AS applied_to_invoices
  `;

  const base = { customersApi: goodCustomersApi, customerDetail: goodCustomerDetail, backendRoute: goodBackendRoute, paymentDetail: goodPaymentDetail };
  const has = (src, needle) => check({ ...base, ...src }).some((f) => f.includes(needle));
  const checks = [
    ["fully-fixed shape produces zero failures", check(base).length === 0],
    ["dead .../unapply URL construction in customers.ts is caught", has({ customersApi: regressedCustomersApi }, "dead .../payments/:paymentId/unapply")],
    ["an unapply writer back on the read-only profile is caught", has({ customerDetail: regressedCustomerDetailWriter }, "mounts an unapply writer")],
    ["the profile regressing to the dead-route function is caught", has({ customerDetail: regressedCustomerDetailDeadRoute }, "mounts an unapply writer")],
    ["the profile losing the Accounting link is caught", has({ customerDetail: regressedCustomerDetailNoLink }, "must link to /accounting/payments/:id")],
    ["an unconfirmed Unapply is caught", has({ paymentDetail: regressedPaymentDetailNoConfirm }, "must be confirmed")],
    ["Unapply sending the payment id instead of the application id is caught", has({ paymentDetail: regressedPaymentDetailWrongId }, "canonical unapplyPayment(id, applicationId")],
    ["backend route dropping 'application_id', pa.id is caught", has({ backendRoute: regressedBackendRoute }, "no longer selects 'application_id', pa.id")],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — customer-payment Unapply calls the mounted DELETE .../applications/:id route with a real application_id`);
}
