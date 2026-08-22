#!/usr/bin/env node
/** Ratchet: settlements.panel.open_driver_bills connectivity + reverse_link. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlements-open-driver-bills";
const paths = {
  backend: "apps/backend/src/driver-finance/driver-bills.routes.ts",
  api: "apps/frontend/src/api/driverFinance.ts",
  list: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  detail: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const source = Object.fromEntries(Object.entries(paths).map(([key, rel]) => [key, read(rel)]));

function sliceBetween(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) return "";
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? text.length : to);
}

export function collectFailures(src = source) {
  const errors = [];
  const route = sliceBetween(src.backend, 'app.get("/api/v1/driver-finance/driver-bills/open"', "\n  });");
  const listPanel = sliceBetween(src.list, "function OpenDriverBillsPanel(", "\nfunction setFilter(");
  const detailSection = sliceBetween(src.detail, "function OpenDriverBillsSection(", "\nfunction ");
  const requireText = (text, token, message) => { if (!text.includes(token)) errors.push(message); };

  requireText(route, "openBillsQuerySchema.safeParse(req.query ?? {})", "Open-bills route must parse the company-scoped query schema");
  requireText(route, "withCompanyScope(user.uuid, parsed.data.operating_company_id", "Open-bills route must execute inside the selected company scope");
  requireText(route, "FROM driver_finance.driver_bills db", "Open-bills route must read canonical driver_finance.driver_bills");
  requireText(route, "db.operating_company_id = $1::uuid AND db.status = 'open'", "Open-bills route must filter selected company and open status");
  requireText(route, 'parsed.data.driver_id ? "AND db.driver_id = $2" : ""', "Open-bills route must scope the optional driver filter");
  requireText(route, "d.id = db.driver_id AND d.operating_company_id = db.operating_company_id", "Driver label join must be company-scoped and bind the canonical driver id");
  requireText(route, "items: payload.bills", "Open-bills response must return canonical bill rows");
  requireText(route, "total_count: payload.total_count", "Open-bills response must return the row total");
  requireText(route, "total_gross_cents: payload.total_gross_cents", "Open-bills response must return the gross total");

  requireText(src.api, "export function getOpenDriverBills(companyId: string, driverId?: string)", "Frontend API must expose the typed company/driver reader");
  requireText(src.api, "new URLSearchParams({ operating_company_id: companyId })", "Frontend API must send the selected company id");
  requireText(src.api, 'if (driverId) params.set("driver_id", driverId)', "Frontend API must send the selected driver id when present");
  requireText(src.api, "apiRequest<OpenDriverBillsResponse>", "Frontend API must retain the canonical response type");

  requireText(src.list, "queryFn: () => getOpenDriverBills(companyId)", "Settlements list must query open bills for the selected company");
  requireText(listPanel, 'kind="driver"\n                  id={bill.driver_id}', "Settlements list driver drill must bind bill.driver_id");
  requireText(listPanel, 'label={entityLabel(bill.driver_name, bill.driver_id, "Driver")}', "Settlements list driver drill must use the human driver label");
  requireText(listPanel, 'kind="load"\n                  id={bill.load_id ?? ""}', "Settlements list load drill must bind bill.load_id");
  requireText(listPanel, 'label={entityLabel(bill.load_number, bill.load_id, "Load")}', "Settlements list load drill must use the human load label");
  requireText(listPanel, "Open Driver Bills · ${totalCount} · ${formatUsdCents(totalGrossCents)}", "Settlements list must surface count and gross totals");
  const listCode = listPanel.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  if (/<EntityLink\s+kind\s*=\s*["']bill["']/.test(listCode)) errors.push("Settlements list must not route driver-finance rows to accounting bills");

  requireText(src.detail, "queryFn: () => getOpenDriverBills(companyId, driverId ?? undefined)", "Settlement detail must query by selected company and canonical driver");
  requireText(detailSection, 'kind="load" id={bill.load_id ?? ""}', "Settlement detail load drill must bind bill.load_id");
  requireText(detailSection, 'label={entityLabel(bill.load_number, bill.load_id, "Load")}', "Settlement detail load drill must use the human load label");
  requireText(detailSection, "Open Driver Bills · {totalCount} · {formatUsdCents(totalGrossCents)}", "Settlement detail must surface count and gross totals");
  const detailCode = detailSection.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  if (/<EntityLink\s+kind\s*=\s*["']bill["']/.test(detailCode)) errors.push("Settlement detail must not route driver-finance rows to accounting bills");
  return errors;
}

function run() {
  const errors = collectFailures();
  if (errors.length) {
    for (const error of errors) console.error(`[${LABEL}] FAIL: ${error}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS: company-scoped open driver bills and both reverse consumers are exact`);
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`[${LABEL}] --selftest FAIL: clean baseline is already red: ${baseline.join("; ")}`);
    process.exit(1);
  }
  const mutations = [
    ["backend", "openBillsQuerySchema.safeParse(req.query ?? {})", "openBillsQuerySchema.safeParse({})"],
    ["backend", "withCompanyScope(user.uuid, parsed.data.operating_company_id", "withCompanyScope(user.uuid, crypto.randomUUID()"],
    ["backend", "FROM driver_finance.driver_bills db", "FROM accounting.bills db"],
    ["backend", "db.operating_company_id = $1::uuid AND db.status = 'open'", "db.status = 'open'"],
    ["backend", 'parsed.data.driver_id ? "AND db.driver_id = $2" : ""', 'parsed.data.driver_id ? "" : ""'],
    ["backend", "d.id = db.driver_id AND d.operating_company_id = db.operating_company_id", "d.id = db.driver_id"],
    ["backend", "items: payload.bills", "items: []"],
    ["api", "new URLSearchParams({ operating_company_id: companyId })", "new URLSearchParams()"],
    ["api", 'if (driverId) params.set("driver_id", driverId)', "void driverId"],
    ["list", 'id={bill.driver_id}', 'id={bill.id}'],
    ["list", 'entityLabel(bill.driver_name, bill.driver_id, "Driver")', 'entityLabel(null, bill.id, "Driver")'],
    ["list", 'id={bill.load_id ?? ""}', 'id={bill.id}'],
    ["list", 'entityLabel(bill.load_number, bill.load_id, "Load")', 'entityLabel(null, bill.id, "Load")'],
    ["list", '<EntityLink\n                  kind="driver"', '<EntityLink kind="bill"\n                  data-bad="true"'],
    ["detail", "getOpenDriverBills(companyId, driverId ?? undefined)", "getOpenDriverBills(companyId)"],
    ["detail", 'id={bill.load_id ?? ""}', 'id={bill.id}'],
    ["detail", 'entityLabel(bill.load_number, bill.load_id, "Load")', 'entityLabel(null, bill.id, "Load")'],
  ];
  let rejected = 0;
  for (const [file, needle, replacement] of mutations) {
    if (!source[file].includes(needle)) {
      console.error(`[${LABEL}] --selftest FAIL: plant target missing in ${file}: ${needle}`);
      process.exit(1);
    }
    const planted = { ...source, [file]: source[file].split(needle).join(replacement) };
    if (collectFailures(planted).length > 0) rejected += 1;
    else console.error(`[${LABEL}] --selftest plant escaped ${file}: ${needle}`);
  }
  if (rejected !== mutations.length) {
    console.error(`[${LABEL}] --selftest FAIL: rejected ${rejected}/${mutations.length} plants`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} independent plants without editing runtime files`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
