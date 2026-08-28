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

  if (customersApiSrc == null) return [`${CUSTOMERS_API_FILE} not found`];
  if (customerDetailSrc == null) return [`${CUSTOMER_DETAIL_FILE} not found`];
  if (backendRouteSrc == null) return [`${BACKEND_ROUTE_FILE} not found`];

  // (1) The dead unmounted route string must not be constructed anywhere in the frontend API layer.
  const deadRoutePattern = /\/payments\/\$\{[a-zA-Z]+\}\/unapply/;
  if (deadRoutePattern.test(customersApiSrc)) {
    failures.push(
      `${CUSTOMERS_API_FILE}: still builds the dead .../payments/:paymentId/unapply URL — ` +
        `no backend route mounts this path, every call 404s`
    );
  }

  // (2) CustomerDetail's unapply mutation must call the canonical re-export, not construct its own
  // fetch to the dead path, and must reference `application_id` (the value threaded from the list).
  const mutationStart = customerDetailSrc.indexOf("unapplyCustomerPaymentMutation");
  if (mutationStart < 0) {
    failures.push(`${CUSTOMER_DETAIL_FILE}: unapplyCustomerPaymentMutation not found — extractor may be stale`);
  } else {
    const mutationBody = customerDetailSrc.slice(mutationStart, mutationStart + 800);
    if (!/unapplyCustomerPaymentApplication\s*\(/.test(mutationBody)) {
      failures.push(
        `${CUSTOMER_DETAIL_FILE}: unapplyCustomerPaymentMutation no longer calls unapplyCustomerPaymentApplication ` +
          `(the canonical DELETE .../applications/:id path) — it may have regressed to the dead route`
      );
    }
    if (!/\.application_id\b/.test(mutationBody)) {
      failures.push(
        `${CUSTOMER_DETAIL_FILE}: unapplyCustomerPaymentMutation no longer reads .application_id — ` +
          `without it there is no id to pass to the canonical DELETE route`
      );
    }
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
    const unapplyCustomerPaymentMutation = useMutation({
      mutationFn: async (payment) => {
        const applications = payment.applied_to_invoices ?? [];
        for (const application of applications) {
          await unapplyCustomerPaymentApplication(payment.id, application.application_id, selectedCompanyId ?? "");
        }
      },
    });
  `;
  const regressedCustomerDetailWrongFn = `
    const unapplyCustomerPaymentMutation = useMutation({
      mutationFn: (paymentId) => unapplyCustomerPayment(id, paymentId),
    });
  `;
  const regressedCustomerDetailNoAppId = `
    const unapplyCustomerPaymentMutation = useMutation({
      mutationFn: (payment) => unapplyCustomerPaymentApplication(payment.id, payment.id, selectedCompanyId ?? ""),
    });
  `;
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

  const checks = [
    [
      "fully-fixed shape produces zero failures",
      check({ customersApi: goodCustomersApi, customerDetail: goodCustomerDetail, backendRoute: goodBackendRoute }).length === 0,
    ],
    [
      "dead .../unapply URL construction in customers.ts is caught",
      check({ customersApi: regressedCustomersApi, customerDetail: goodCustomerDetail, backendRoute: goodBackendRoute }).some((f) =>
        f.includes("dead .../payments/:paymentId/unapply")
      ),
    ],
    [
      "CustomerDetail regressing to the dead-route function is caught",
      check({ customersApi: goodCustomersApi, customerDetail: regressedCustomerDetailWrongFn, backendRoute: goodBackendRoute }).some((f) =>
        f.includes("no longer calls unapplyCustomerPaymentApplication")
      ),
    ],
    [
      "CustomerDetail dropping .application_id is caught",
      check({ customersApi: goodCustomersApi, customerDetail: regressedCustomerDetailNoAppId, backendRoute: goodBackendRoute }).some((f) =>
        f.includes("no longer reads .application_id")
      ),
    ],
    [
      "backend route dropping 'application_id', pa.id is caught",
      check({ customersApi: goodCustomersApi, customerDetail: goodCustomerDetail, backendRoute: regressedBackendRoute }).some((f) =>
        f.includes("no longer selects 'application_id', pa.id")
      ),
    ],
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
