#!/usr/bin/env node
/**
 * verify-company-settlement-pdf-house-template.mjs
 *
 * SET-30 (owner LOCKED MANDATE 2026-09-09: "SET-25/28/30 ... company settlement PDF onto the house
 * template (driver PDF is done)").
 *
 * The DRIVER settlement letter is the house template: an HTML-letter route
 * (GET /api/v1/driver-finance/settlements/:id.html) that feeds a body renderer into wrapPdfDocument
 * with PDF_BASE_STYLES (doc-page / doc-head / sec-head / data-table / total-line). The COMPANY
 * settlement had only a JSON report (buildCompanySettlementReport) and NO printable letter.
 *
 * This guard locks the SET-30 vertical slice so it cannot silently regress to "JSON only":
 *   1. company-settlement.template.ts renders the company report inside the SAME house shell classes,
 *      and lays out all real report sections (customer charges, driver payment, fuel, expenses, P&L,
 *      net revenue, miles/MPG) — no invented money math (it consumes CompanySettlementReport).
 *   2. company-settlement-render.routes.ts serves GET .../company-settlements/:id.html, builds the
 *      report via buildCompanySettlementReport and wraps it with wrapPdfDocument (the house shell).
 *   3. The route is mounted in index.ts (a built-but-unmounted route is not done).
 *   4. The frontend opens the canonical backend letter (companySettlementHtmlUrl + openCanonicalDocument
 *      / openPrintableDocument) — never window.print() on the SPA shell.
 *
 * node scripts/verify-company-settlement-pdf-house-template.mjs
 * node scripts/verify-company-settlement-pdf-house-template.mjs --selftest
 */
import { readdirSync, readFileSync } from "node:fs";

const templatePath = "apps/backend/src/render/company-settlement.template.ts";
const routePath = "apps/backend/src/accounting/company-settlement-render.routes.ts";
const indexPath = "apps/backend/src/index.ts";
const pagePath = "apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx";
const apiPath = "apps/frontend/src/api/accounting.ts";

const source = {
  template: readFileSync(templatePath, "utf8"),
  route: readFileSync(routePath, "utf8"),
  index: readFileSync(indexPath, "utf8"),
  page: readFileSync(pagePath, "utf8"),
  api: readFileSync(apiPath, "utf8"),
};

export function collectFailures(src = source) {
  const failures = [];

  // --- 1. Template: house shell + real report sections, consuming the canonical report type ---
  if (!/export function renderCompanySettlementBody/.test(src.template)) {
    failures.push(`${templatePath}: no longer exports renderCompanySettlementBody`);
  }
  if (!/import type \{ CompanySettlementReport \} from "\.\.\/accounting\/company-settlement-report\.service\.js"/.test(src.template)) {
    failures.push(`${templatePath}: no longer consumes the canonical CompanySettlementReport (would risk inventing money math)`);
  }
  for (const cls of ["sheet", "dochead", "headbar", "loadblock", "lbhead"]) {
    if (!src.template.includes(cls)) {
      failures.push(`${templatePath}: locked v10 class "${cls}" missing — not on the #31 v10 PDF shell`);
    }
  }
  if (!/data-doc-skin="v10"/.test(src.template)) {
    failures.push(`${templatePath}: data-doc-skin="v10" missing (ROUND 285.4.9 / #31)`);
  }
  if (!/COMPANY SETTLEMENT/.test(src.template)) {
    failures.push(`${templatePath}: carrier title COMPANY SETTLEMENT missing`);
  }
  for (const [label, re] of [
    ["customer charges", /s\.customer_charges\.rows/],
    ["driver payment", /s\.driver_payment\.rows/],
    ["fuel purchases", /s\.fuel_purchases\.rows/],
    ["company expenses", /s\.expenses\.rows/],
    ["P&L rollup", /s\.pl_rollup\.lines/],
    ["net revenue total", /pl_rollup\.net_revenue_cents/],
    ["miles & mpg", /miles_and_mpg\.total_miles/],
    // ROUND 285.4.9 / #58 — downtime ledger + fuel consumed + three margins print automatically.
    ["downtime ledger", /downtime_ledger|renderDowntimeLedger/],
    ["fuel consumed", /fuel_consumed|renderFuelConsumed/],
    ["three margins", /margins\.cash_margin_cents|renderThreeMargins/],
  ]) {
    if (!re.test(src.template)) failures.push(`${templatePath}: report section "${label}" not rendered`);
  }

  const reportPath = "apps/backend/src/accounting/company-settlement-report.service.ts";
  const reportSrc = readFileSync(reportPath, "utf8");
  for (const [label, re] of [
    ["downtime.events read", /FROM downtime\.events/],
    ["downtime.event_costs read", /FROM downtime\.event_costs/],
    ["downtime.lost_opportunity read", /FROM downtime\.lost_opportunity/],
    ["fuel.load_fuel_cost read", /FROM fuel\.load_fuel_cost/],
    ["cash_margin_cents", /cash_margin_cents/],
    ["true_cost_margin_cents", /true_cost_margin_cents/],
    ["economic_margin_cents", /economic_margin_cents/],
  ]) {
    if (!re.test(reportSrc)) failures.push(`${reportPath}: missing "${label}" for ROUND 285.4.9 #58`);
  }


  // ROUND 285.4.9 / #31 — the three locked v10 documents share the same skin markers.
  const driverTpl = readFileSync("apps/backend/src/render/settlement.template.ts", "utf8");
  const invoiceTpl = readFileSync("apps/backend/src/render/invoice.template.ts", "utf8");
  const pdfTpl = readFileSync("apps/backend/src/render/pdf-template.ts", "utf8");
  if (!/PDF_V10_STYLES/.test(pdfTpl)) failures.push("pdf-template.ts: PDF_V10_STYLES not wired");
  if (!/skin\?:\s*"house"\s*\|\s*"v10"/.test(pdfTpl)) failures.push("pdf-template.ts: wrapPdfDocument skin option missing");
  for (const [label, srcDoc] of [["driver settlement", driverTpl], ["invoice", invoiceTpl]]) {
    if (!/data-doc-skin="v10"/.test(srcDoc)) failures.push(`${label} template: data-doc-skin="v10" missing`);
  }
  if (!/DRIVER SETTLEMENT/.test(driverTpl)) failures.push("settlement.template.ts: DRIVER SETTLEMENT carrier title missing");
  if (!/invtitle/.test(invoiceTpl) || !/Balance due/.test(invoiceTpl)) failures.push("invoice.template.ts: QuickBooks invtitle / Balance due missing");
  if (!/class="appr"/.test(invoiceTpl)) failures.push("invoice.template.ts: APPROVED BY/METHOD (.appr) missing for detention/layover");
  const invoiceRender = readFileSync("apps/backend/src/accounting/invoice-render.routes.ts", "utf8");
  if (!/dr\.approval_method/.test(invoiceRender)) {
    failures.push("invoice-render.routes.ts: must SELECT dr.approval_method for ROUND 285.4.9 #59 METHOD print");
  }
  const approveRoutes = readFileSync("apps/backend/src/dispatch/detention-approval.routes.ts", "utf8");
  if (!/approval_method:\s*z/.test(approveRoutes)) {
    failures.push("detention-approval.routes.ts: approve body must require approval_method (ROUND 285.4.9 #59)");
  }
  const methodMigration = readdirSync("db/migrations").find((f) => f.includes("detention_requests_approval_method"));
  if (!methodMigration) {
    failures.push("db/migrations: missing *detention_requests_approval_method*.sql (ROUND 285.4.9 #59)");
  } else {
    const mig = readFileSync(`db/migrations/${methodMigration}`, "utf8");
    if (!/ADD COLUMN IF NOT EXISTS approval_method/.test(mig)) {
      failures.push(`${methodMigration}: must ADD COLUMN IF NOT EXISTS approval_method`);
    }
  }

  // --- 2. Route: canonical HTML letter route feeding the report into the house shell ---
  if (!/"\/api\/v1\/accounting\/company-settlements\/:id\.html"/.test(src.route)) {
    failures.push(`${routePath}: GET /api/v1/accounting/company-settlements/:id.html route path missing`);
  }
  if (!/buildCompanySettlementReport\(/.test(src.route)) {
    failures.push(`${routePath}: does not build the report via buildCompanySettlementReport`);
  }
  if (!/renderCompanySettlementBody\(/.test(src.route)) {
    failures.push(`${routePath}: does not render the company body`);
  }
  if (!/wrapPdfDocument\(\{/.test(src.route)) {
    failures.push(`${routePath}: does not wrap the body in the house shell (wrapPdfDocument)`);
  }
  if (!/skin:\s*["']v10["']/.test(src.route)) {
    failures.push(`${routePath}: wrapPdfDocument must use skin: "v10" (ROUND 285.4.9 / #31)`);
  }
  if (!/export async function registerCompanySettlementHtmlRoutes/.test(src.route)) {
    failures.push(`${routePath}: no longer exports registerCompanySettlementHtmlRoutes`);
  }

  // --- 3. Mounted via the accounting-directory @fastify/autoload (default fp), NOT double-mounted ---
  // The accounting/ directory is autoloaded by default-fp export (like invoice-render.routes.ts). The
  // route MUST carry that default export to be mounted, and index.ts MUST NOT also call it explicitly
  // (doing both crashes boot with "Method 'GET' already declared" — the exact SET-30 boot crash).
  if (!/export default fp\(async \(app\) => \{[\s\S]*?registerCompanySettlementHtmlRoutes\(app\)/.test(src.route)) {
    failures.push(`${routePath}: no default fp export — the accounting autoloader will not mount it (built-but-unmounted)`);
  }
  if (/registerCompanySettlementHtmlRoutes\(app\)/.test(src.index)) {
    failures.push(`${indexPath}: must NOT explicitly mount registerCompanySettlementHtmlRoutes — it is autoload-mounted; double registration crashes boot`);
  }

  // --- 4. Frontend opens the canonical backend letter, never window.print() ---
  if (!/export function companySettlementHtmlUrl/.test(src.api)) {
    failures.push(`${apiPath}: companySettlementHtmlUrl helper missing`);
  }
  if (!/company-settlements\/\$\{encodeURIComponent\(companySettlementId\)\}\.html/.test(src.api)) {
    failures.push(`${apiPath}: companySettlementHtmlUrl no longer targets the .html letter route`);
  }
  if (!/companySettlementHtmlUrl\(companyId, row\.id\)/.test(src.page)) {
    failures.push(`${pagePath}: PDF buttons no longer call companySettlementHtmlUrl(companyId, row.id)`);
  }
  if (!/openCanonicalDocument\(companySettlementHtmlUrl/.test(src.page)) {
    failures.push(`${pagePath}: View PDF button no longer opens the canonical backend letter`);
  }
  if (!/openPrintableDocument\(companySettlementHtmlUrl/.test(src.page)) {
    failures.push(`${pagePath}: Print button no longer opens the canonical printable letter`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-company-settlement-pdf-house-template SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["template export", "template", /export function renderCompanySettlementBody/, "function renderCompanySettlementBody"],
    ["report type import", "template", /import type \{ CompanySettlementReport \} from "\.\.\/accounting\/company-settlement-report\.service\.js";\n/, ""],
    ["v10 skin marker", "template", /data-doc-skin="v10"/, 'data-doc-skin="legacy"'],
    ["v10 loadblock", "template", /loadblock/g, "legacyblock"],
    ["pl section", "template", /s\.pl_rollup\.lines/g, "s.PL_DISABLED.lines"],
    ["route path", "route", /"\/api\/v1\/accounting\/company-settlements\/:id\.html"/, '"/api/v1/accounting/company-settlements/:id.json"'],
    ["build report", "route", /buildCompanySettlementReport\(/g, "buildDISABLEDReport("],
    ["wrap shell", "route", /wrapPdfDocument\(\{/g, "rawHtml({"],
    ["v10 skin on route", "route", /skin:\s*"v10"/g, 'skin: "house"'],
    ["route default fp export", "route", /export default fp\(async \(app\) => \{/, "const _unmounted = (async (app) => {"],
    ["index double-mount", "index", /await registerDriverFinanceSettlementHtmlRoutes\(app\);\n/, "await registerDriverFinanceSettlementHtmlRoutes(app);\n  await registerCompanySettlementHtmlRoutes(app);\n"],
    ["api helper", "api", /export function companySettlementHtmlUrl/, "function companySettlementHtmlUrl"],
    ["page view btn", "page", /openCanonicalDocument\(companySettlementHtmlUrl/, "openNothing(companySettlementHtmlUrl"],
    ["page print btn", "page", /openPrintableDocument\(companySettlementHtmlUrl/, "openNothing(companySettlementHtmlUrl"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-company-settlement-pdf-house-template SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-company-settlement-pdf-house-template SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-company-settlement-pdf-house-template: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-company-settlement-pdf-house-template: OK — company settlement on locked v10 shell (sheet/dochead/loadblock + wrapPdfDocument skin:v10), fed by buildCompanySettlementReport, mounted in index.ts, opened via companySettlementHtmlUrl; driver+invoice also carry data-doc-skin=v10"
);
