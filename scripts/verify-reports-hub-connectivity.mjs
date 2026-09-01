#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leafRe":"^(home\\.hub|subnav\\.(category_hub|run_report)|cat\\.(ops_dispatch|driver_perf|equipment|safety|customers|vendors|accounting|tax_reg|multi_company))$","task":"LV-REPORTS-CATEGORY-LANDINGS-BYPASS-CANONICAL-CATALOG"} */
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const hub = read("apps/frontend/src/pages/reports/ReportsHub.tsx");
const nav = read("apps/frontend/src/pages/reports/ReportsSubNav.tsx");
const api = read("apps/backend/src/reports/categories/routes.ts");
const catalog = read("apps/backend/src/reports/categories/category-catalog.ts");
const catalogApi = read("apps/frontend/src/pages/reports/categories/catalog-api.ts");
const categoryPage = read("apps/frontend/src/pages/reports/categories/ReportCategoryPage.tsx");
const manifest = read("apps/frontend/src/routes/manifest.tsx");
const wrappers = [
  ["ops-dispatch", "ops-dispatch.tsx"],
  ["driver-perf", "driver-perf.tsx"],
  ["equipment", "equipment.tsx"],
  ["safety", "safety.tsx"],
  ["customers", "customers.tsx"],
  ["vendors", "vendors.tsx"],
  ["accounting", "accounting.tsx"],
  ["tax-reg", "tax-reg.tsx"],
  ["multi-company", "multi-company.tsx"],
].map(([id, file]) => [id, file, read(`apps/frontend/src/pages/reports/categories/${file}`)]);

function failures(overrides = {}) {
  const h = overrides.hub ?? hub;
  const c = overrides.catalog ?? catalog;
  const ca = overrides.catalogApi ?? catalogApi;
  const cp = overrides.categoryPage ?? categoryPage;
  const ws = overrides.wrappers ?? wrappers;
  const out = [
    ["shared authenticated registry fetch", ca.includes('apiRequest<{ categories: CatalogCategory[] }>("/api/reports/categories/catalog")')],
    ["hub consumes shared registry fetch", h.includes('fetchReportCategoryCatalog') && h.includes("category.reports.map") && h.includes("route={report.route}")],
    ["backend route authenticated", api.includes('app.get("/api/reports/categories/catalog"') && api.includes("requireAuth(req, reply)")],
    ["registry is canonical code definition", c.includes("export const REPORT_CATEGORIES") && c.includes("allCatalogReportIds")],
    ["catalog card routes mounted", [...c.matchAll(/route:\s*"([^"]+)"/g)].map((match) => match[1]).every((route) =>
      manifest.includes(`path="${route}"`) || (route.startsWith("/reports/run/") && manifest.includes('path="/reports/run/:reportId"'))
    )],
    // Tolerate optional chaining (categories?.find) — the real page added a null-safety `?.` before
    // .find() that the literal-substring check never accounted for.
    ["shared page selects exact category", /categories\??\.find\(\(value\) => value\.id === categoryId\)/.test(cp)],
    ["shared page renders canonical cards", cp.includes("category.reports.map") && cp.includes("route={report.route}") && cp.includes("icon={report.icon}")],
    ["shared page honest states", cp.includes("Loading report category") && cp.includes("Couldn't load report category") && cp.includes("Report category not found")],
    ["hub category EntityLink", h.includes('kind="report_category"') && h.includes("id={category.id}")],
    ["hub route mounted", manifest.includes('path="/reports/hub"')],
    ["category subnav", nav.includes('{ label: "Category hub", to: "/reports/hub" }')],
    ["run-report flyout", /label:\s*"Run report"[\s\S]*?to:\s*"\/reports\/hub"[\s\S]*?children:\s*flattenReportRunLinks\(\)/.test(nav)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
  for (const [id, , source] of ws) {
    if (!source.includes("<ReportCategoryPage") || !source.includes(`categoryId="${id}"`)) out.push(`${id} canonical wrapper`);
    if (source.includes("Category landing — open reports from the hub hover nav")) out.push(`${id} placeholder banned`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["shared authenticated registry fetch", { catalogApi: catalogApi.replace("/api/reports/categories/catalog", "/api/reports/categories/missing") }],
    ["shared page renders canonical cards", { categoryPage: categoryPage.replace("route={report.route}", 'route="/reports"') }],
    ["shared page honest states", { categoryPage: categoryPage.replace("Report category not found", "Unavailable") }],
    ["catalog card routes mounted", { catalog: catalog.replace('/reports/cancellations', '/reports/load-cancellations') }],
    ...wrappers.map(([id, file, source], index) => [
      `${id} canonical wrapper`,
      { wrappers: wrappers.map((entry, entryIndex) => entryIndex === index ? [id, file, source.replace(`categoryId="${id}"`, 'categoryId="missing"')] : entry) },
    ]),
  ];
  for (const [expected, override] of mutations) {
    if (!failures(override).includes(expected)) throw new Error(`planted ${expected} defect escaped`);
  }
  console.log(`verify-reports-hub-connectivity SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-reports-hub-connectivity FAIL\n${missing.join("\n")}`);
  process.exit(1);
}
console.log("verify-reports-hub-connectivity PASS — hub, subnav, and all nine category leaves consume the authenticated canonical registry");
