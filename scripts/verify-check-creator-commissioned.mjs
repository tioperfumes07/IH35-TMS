#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["connectivity","vendor"],"leaves":["accounting.modal.write_check"]} */
// ROUND 326 queue item 15 (G-16, CC-1) — COMMISSION THE CHECK CREATOR. Backend half. Fails if:
//   1. there is no printable check face (GET /api/v1/checks/:id.html through renderCheckBody + wrapPdfDocument);
//   2. the stock settings stop accepting print offsets / company-address toggle, or a save resets the stored
//      check_type (COALESCE keeps it);
//   3. a closed period on create / reissue falls through to a 500 instead of a named 409.
//   4. (ROUND 365.6, matrix leaf accounting.modal.write_check) the Write Check modal stops being reachable and
//      wired: /accounting/checks/new must mount CheckCreatePage -> WriteCheckForm, the form must POST createCheck
//      with the payee, POST /api/v1/checks must be registered, and the vendor payee must be a real company vendor
//      (company-scoped vendor roster in the picker, mdata.vendors resolved by id + operating_company_id server-side).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-check-creator-commissioned";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  routes: "apps/backend/src/accounting/checks/checks.routes.ts",
  stock: "apps/backend/src/accounting/checks/check-stock.service.ts",
  tpl: "apps/backend/src/render/check.template.ts",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  form: "apps/frontend/src/components/checks/WriteCheckForm.tsx",
  printPage: "apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  createPage: "apps/frontend/src/pages/accounting/checks/CheckCreatePage.tsx",
  payee: "apps/backend/src/accounting/checks/check-payee.service.ts",
  index: "apps/backend/src/index.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const routes = strip(src.routes);
  if (!/"\/api\/v1\/checks\/:id\.html"[\s\S]{0,4000}renderCheckBody\([\s\S]{0,1200}wrapPdfDocument\(/.test(routes)) p.push("GET /api/v1/checks/:id.html must render the check face (renderCheckBody + wrapPdfDocument)");
  if (!/export function checkAmountInWords/.test(strip(src.tpl))) p.push("the check face must print the amount in words");
  if (!/offset_x_mm: z\.number\(\)/.test(routes) || !/print_company_address: z\.boolean\(\)/.test(routes)) p.push("PUT /checks/stock-settings must accept the print offsets and the company-address toggle");
  const stock = strip(src.stock);
  if (!/check_type = COALESCE\(\$4, banking\.check_stock_settings\.check_type\)/.test(stock)) p.push("saving stock settings must keep the stored check_type when none is sent");
  if ((routes.match(/err instanceof PostingEngineError && err\.code === "PERIOD_LOCKED"\) return reply\.code\(409\)/g) ?? []).length < 2) p.push("create and reissue must answer a closed period with a named 409");
  // Frontend half: reachable, printable, the saved style shown, Print check not blocked on a typed number.
  if (!/path: "\/accounting\/checks"/.test(src.subnav) || !/path: "\/accounting\/checks\/print"/.test(src.subnav)) p.push("Checks and Print checks must be in the accounting sub-nav");
  if (!/disabled=\{!canPrintCheck\}/.test(src.form) || !/const canPrintCheck = !isBillPayment && checkLinesReady/.test(src.form)) p.push("Print check must not wait for a typed check number (it prints later)");
  if (!/openPrintableDocument\(`\/api\/v1\/checks\/\$\{a\.check_id\}\.html/.test(src.printPage)) p.push("the print page must open each assigned check's printable face");
  if (!/setCheckType\(savedCheckType\)/.test(src.printPage)) p.push("the print page must load the bank account's saved check style");
  // accounting.modal.write_check — connectivity: routed, mounted, posting to a registered route.
  if (!/path="\/accounting\/checks\/new"[\s\S]{0,200}<CheckCreatePage \/>/.test(src.manifest)) p.push("/accounting/checks/new must mount CheckCreatePage (write_check connectivity)");
  if (!/<WriteCheckForm/.test(src.createPage)) p.push("CheckCreatePage must render WriteCheckForm (write_check connectivity)");
  if (!/await createCheck\(\{[\s\S]{0,400}payee_kind: payeeKind,[\s\S]{0,40}payee_id: payeeId/.test(src.form)) p.push("WriteCheckForm must POST createCheck with payee_kind + payee_id (write_check connectivity)");
  if (!/app\.post\(\s*"\/api\/v1\/checks"/.test(routes) || !/^\s*await registerCheckRoutes\(app\);/m.test(src.index)) p.push("POST /api/v1/checks must exist and registerCheckRoutes must be mounted (write_check connectivity)");
  // accounting.modal.write_check — vendor: a company-scoped vendor picker, resolved to a live company vendor.
  if (!/listVendors\(\{ operating_company_id: operatingCompanyId/.test(src.form) || !/<ReferenceSelect\s+id="check-payee"[\s\S]{0,300}createKind=\{payeeKind\}/.test(src.form)) p.push("Write Check must pick the vendor payee from the company's vendor roster (write_check vendor)");
  if (!/FROM mdata\.vendors\s+WHERE id = \$1::uuid AND operating_company_id = \$2::uuid AND deactivated_at IS NULL/.test(src.payee)) p.push("a vendor payee must resolve to an active vendor of the same company (write_check vendor)");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no face", { ...src, routes: src.routes.replace('"/api/v1/checks/:id.html"', '"/api/v1/checks/:id/face"') }],
      ["style reset", { ...src, stock: src.stock.replace("check_type = COALESCE($4, banking.check_stock_settings.check_type)", "check_type = EXCLUDED.check_type") }],
      ["not in subnav", { ...src, subnav: src.subnav.replace('path: "/accounting/checks/print"', 'path: "/x"') }],
      ["print waits for number", { ...src, form: src.form.replace("disabled={!canPrintCheck}", "disabled={!canSave}") }],
      ["write check unrouted", { ...src, manifest: src.manifest.replace('path="/accounting/checks/new"', 'path="/accounting/checks/new-x"') }],
      ["vendor not company-scoped", { ...src, payee: src.payee.replace("WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL", "WHERE id = $1::uuid") }],
      ["period 500", { ...src, routes: src.routes.replace('err.code === "PERIOD_LOCKED") return reply.code(409)', 'err.code === "X") return reply.code(409)') }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — printable check face, writable print offsets, stored style kept, closed period answers 409.`);
}
