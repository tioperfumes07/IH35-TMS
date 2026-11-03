#!/usr/bin/env node
/**
 * Rows 79-84 (11-03 register, 443.281 boards docs/design/v3/V3-Reports-*.dc.html) — the five report boards are wired:
 *   1. the catalog (pages/reports/boards/reportBoardCatalog.ts) lists exactly the 5 report routes;
 *   2. each route is mounted in routes/manifest.tsx on its board page;
 *   3. each board page calls the EXISTING endpoint the catalog names (through its api helper) — never a second engine;
 *   4. the Reports home board and the Reports sub-nav read the catalog;
 *   5. the replaced duplicate pages/reports/LoadsReportPage.tsx is gone and nothing imports it.
 * `--selftest` plants each failure and requires the check to catch it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reports-five-pages-wired";
const FE = "apps/frontend/src";

export const BOARDS = [
  { id: "loads-report", href: "/reports/loads", page: "LoadsReportBoard", endpoint: "/api/v1/reports/loads", call: "getLoadsReport(" },
  {
    id: "driver-settlements-report",
    href: "/reports/driver-settlements",
    page: "DriverSettlementsReportBoard",
    endpoint: "/api/v1/reports/driver-settlements",
    call: "getDriverSettlementsReport(",
  },
  {
    id: "company-settlements-report",
    href: "/reports/company-settlements",
    page: "CompanySettlementsReportBoard",
    endpoint: "/api/v1/driver-finance/tours",
    call: 'listTours(companyId, "closed")',
  },
  { id: "customer-report", href: "/reports/customers", page: "CustomerReportBoard", endpoint: "/api/v1/mdata/boards/customers", call: "getCustomerBoardReport(" },
  { id: "vendor-report", href: "/reports/vendors", page: "VendorReportBoard", endpoint: "/api/v1/mdata/boards/vendors", call: "getVendorBoardReport(" },
];

const API_FILES = { "/api/v1/driver-finance/tours": `${FE}/api/tourReadout.ts` };
const DUPLICATES = [`${FE}/pages/reports/LoadsReportPage.tsx`];

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function loadSources() {
  const pages = {};
  for (const b of BOARDS) pages[b.id] = read(`${FE}/pages/reports/boards/${b.page}.tsx`);
  const dupImporters = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(rel);
      else if (/\.(tsx?|mjs)$/.test(ent.name) && /pages\/reports\/LoadsReportPage["']/.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) dupImporters.push(rel);
    }
  };
  walk(FE);
  return {
    catalog: read(`${FE}/pages/reports/boards/reportBoardCatalog.ts`) ?? "",
    manifest: read(`${FE}/routes/manifest.tsx`) ?? "",
    home: read(`${FE}/pages/reports/components/ReportsHomeBoard.tsx`) ?? "",
    subnav: read(`${FE}/pages/reports/ReportsSubNav.tsx`) ?? "",
    links: read(`${FE}/components/reports/phase6ReportLinks.ts`) ?? "",
    apiReports: read(`${FE}/api/reports.ts`) ?? "",
    apiTours: read(API_FILES["/api/v1/driver-finance/tours"]) ?? "",
    pages,
    duplicatesPresent: DUPLICATES.filter((d) => read(d) != null),
    dupImporters,
  };
}

export function check(src) {
  const fails = [];
  const catalogHrefs = [...src.catalog.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (catalogHrefs.length !== 5) fails.push(`catalog lists ${catalogHrefs.length} report routes, expected 5`);
  for (const b of BOARDS) {
    if (!catalogHrefs.includes(b.href)) fails.push(`catalog missing ${b.href}`);
    if (!src.catalog.includes(`endpoint: "${b.endpoint}"`)) fails.push(`catalog entry ${b.id} must name endpoint ${b.endpoint}`);
    const routeRe = new RegExp(`path="${b.href.replace(/\//g, "\\/")}"\\s*\\n\\s*element=\\{\\s*\\n\\s*<ProtectedRoute>\\s*\\n\\s*<${b.page} />`);
    if (!routeRe.test(src.manifest)) fails.push(`manifest must mount ${b.href} on <${b.page} />`);
    if (!src.manifest.includes(`import("../pages/reports/boards/${b.page}")`)) fails.push(`manifest must lazy-import boards/${b.page}`);
    const page = src.pages[b.id];
    if (page == null) {
      fails.push(`board page ${b.page}.tsx missing`);
      continue;
    }
    if (!page.includes(b.call)) fails.push(`${b.page} must call its endpoint via ${b.call}`);
    if (!page.includes(`id="${b.id}"`)) fails.push(`${b.page} must render ReportBoardShell id="${b.id}"`);
    if (/\bfetch\(|apiRequest[<(]/.test(page)) fails.push(`${b.page} must read through the api helper, not a raw request`);
    const apiSrc = b.endpoint === "/api/v1/driver-finance/tours" ? src.apiTours : src.apiReports;
    if (!apiSrc.includes(b.endpoint)) fails.push(`api helper for ${b.id} must request ${b.endpoint}`);
    if (!src.links.includes(`"${b.id}": "${b.href}"`)) fails.push(`phase6ReportLinks must map ${b.id} → ${b.href}`);
  }
  if (!/REPORT_BOARDS/.test(src.home)) fails.push("Reports home board must list the catalog (REPORT_BOARDS)");
  if (!/REPORT_BOARDS/.test(src.subnav)) fails.push("Reports sub-nav must list the catalog (REPORT_BOARDS)");
  for (const d of src.duplicatesPresent) fails.push(`replaced duplicate still present: ${d}`);
  for (const f of src.dupImporters) fails.push(`${f} still imports the removed LoadsReportPage`);
  return fails;
}

function selftest(src) {
  const plants = [
    ["catalog drops a route", { ...src, catalog: src.catalog.replace('href: "/reports/vendors"', 'href: "/reports/vendorz"') }, "catalog missing /reports/vendors"],
    ["route unmounted", { ...src, manifest: src.manifest.replace("<CustomerReportBoard />", "<div />") }, "manifest must mount /reports/customers"],
    [
      "page stops calling its endpoint",
      { ...src, pages: { ...src.pages, "driver-settlements-report": src.pages["driver-settlements-report"].replaceAll("getDriverSettlementsReport(", "otherEngine(") } },
      "must call its endpoint",
    ],
    [
      "page reads a raw request",
      { ...src, pages: { ...src.pages, "vendor-report": `${src.pages["vendor-report"]}\nfetch("/api/v1/x")` } },
      "must read through the api helper",
    ],
    ["duplicate restored", { ...src, duplicatesPresent: [DUPLICATES[0]] }, "replaced duplicate still present"],
    ["duplicate re-imported", { ...src, dupImporters: [`${FE}/routes/manifest.tsx`] }, "still imports the removed LoadsReportPage"],
    ["home drops catalog", { ...src, home: src.home.replaceAll("REPORT_BOARDS", "X") }, "Reports home board must list the catalog"],
  ];
  let ok = 0;
  for (const [name, planted, needle] of plants) {
    const fails = check(planted);
    if (!fails.some((f) => f.includes(needle))) {
      console.error(`${LABEL} SELFTEST FAILED: plant "${name}" escaped`);
      process.exit(1);
    }
    ok += 1;
  }
  return `${ok + 1}/${plants.length + 1}`;
}

const src = loadSources();
const fails = check(src);
if (fails.length) {
  console.error(`${LABEL} FAIL:\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  console.log(`${LABEL} selftest ${selftest(src)} OK`);
} else {
  console.log(`${LABEL} OK — 5 report boards routed, each on its endpoint; LoadsReportPage removed`);
}
