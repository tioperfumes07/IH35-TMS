#!/usr/bin/env node
/**
 * Rule 16 / DoD C guard: a vendor credit is not an active path unless the UI
 * can apply or void it and the bill detail exposes the reverse credit hop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx";
const API = "apps/frontend/src/api/vendor-credits.ts";
const ROUTES = "apps/backend/src/accounting/vendor-credits.routes.ts";
const BILL_SERVICE = "apps/backend/src/accounting/bills.service.ts";
const BILL_PAGE = "apps/frontend/src/pages/accounting/BillDetailPage.tsx";

function source(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertActivePath(input) {
  const errors = [];
  const requirements = [
    [input.page, "createVendorCredit(companyId", `${PAGE}: Save must invoke the scoped vendor-credit creator`],
    [input.page, "getVendorCredit", `${PAGE}: selected credit must load its applications`],
    [input.page, "applyMut.mutate()", `${PAGE}: Apply to bill must submit the selected application`],
    [input.page, "voidMut.mutateAsync(reason)", `${PAGE}: Void must submit the governed void reason`],
    [input.page, "VendorCreditApplications", `${PAGE}: credit detail must render applied-bill links`],
    [input.api, "getVendorCredit", `${API}: client must expose the credit detail endpoint`],
    [input.api, '`/api/v1/accounting/vendor-credits?operating_company_id=${encodeURIComponent(operatingCompanyId)}`', `${API}: create must target the canonical scoped route`],
    [input.api, '{ method: "POST", body: payload }', `${API}: create must submit its payload with POST`],
    [input.routes, 'app.post("/api/v1/accounting/vendor-credits"', `${ROUTES}: canonical create route missing`],
    [input.routes, "INSERT INTO accounting.vendor_credits", `${ROUTES}: create must persist to the canonical table`],
    [input.routes, 'app.get("/api/v1/accounting/vendor-credits/:id"', `${ROUTES}: credit detail route missing`],
    [input.routes, "JOIN accounting.bills b", `${ROUTES}: credit detail must return canonical bill links`],
    [input.billService, "vendor_credit_applications", `${BILL_SERVICE}: bill detail must return reverse credit applications`],
    [input.billPage, "bill-detail-vendor-credit-applications", `${BILL_PAGE}: bill detail must render the reverse credit section`],
    [input.billPage, "/accounting/vendor-credits?credit_id=", `${BILL_PAGE}: reverse credit rows must drill to the exact credit`],
  ];
  for (const [text, token, message] of requirements) {
    if (!text.includes(token)) errors.push(message);
  }
  return errors;
}

function assertRejectsMutatedSource(name, sources, mutate) {
  const mutated = mutate({ ...sources });
  const errors = assertActivePath(mutated);
  if (errors.length === 0) throw new Error(`SELFTEST INERT: removing ${name} did not fail`);
}

function selftest() {
  const sources = {
    page: source(PAGE),
    api: source(API),
    routes: source(ROUTES),
    billService: source(BILL_SERVICE),
    billPage: source(BILL_PAGE),
  };
  const baseline = assertActivePath(sources);
  if (baseline.length) throw new Error(`live sources rejected:\n${baseline.join("\n")}`);
  assertRejectsMutatedSource("create submit", sources, (s) => ({ ...s, page: s.page.replace("createVendorCredit(companyId", "createRemoved(companyId") }));
  assertRejectsMutatedSource("create POST", sources, (s) => ({ ...s, api: s.api.replace('{ method: "POST", body: payload }', '{ method: "GET" }') }));
  assertRejectsMutatedSource("canonical INSERT", sources, (s) => ({ ...s, routes: s.routes.replace("INSERT INTO accounting.vendor_credits", "INSERT INTO wrong.vendor_credits") }));
  assertRejectsMutatedSource("apply mutation", sources, (s) => ({ ...s, page: s.page.replace("applyMut.mutate()", "applyRemoved()") }));
  assertRejectsMutatedSource("void mutation", sources, (s) => ({ ...s, page: s.page.replace("voidMut.mutateAsync(reason)", "voidRemoved(reason)") }));
  assertRejectsMutatedSource("credit-to-bill query", sources, (s) => ({ ...s, routes: s.routes.replace("JOIN accounting.bills b", "JOIN removed_bills b") }));
  assertRejectsMutatedSource("bill reverse panel", sources, (s) => ({ ...s, billPage: s.billPage.replace("bill-detail-vendor-credit-applications", "removed-credit-panel") }));
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const errors = assertActivePath({
      page: source(PAGE),
      api: source(API),
      routes: source(ROUTES),
      billService: source(BILL_SERVICE),
      billPage: source(BILL_PAGE),
    });
    if (errors.length) throw new Error(errors.join("\n"));
  }
  console.log("PASS: verify-vendor-credit-active-path");
} catch (error) {
  console.error(`FAIL: verify-vendor-credit-active-path\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
