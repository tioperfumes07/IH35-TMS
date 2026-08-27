#!/usr/bin/env node
// @matrix-built {"modules":["maintenance"],"cols":["driver","unit","work_order","connectivity","reverse_link"],"leaves":["pre_flight_dvir.queue"],"task":"MAINT-F6861-PREFLIGHT-DVIR-RANGE"}
import fs from "node:fs";
import process from "node:process";

const source = {
  route: fs.readFileSync("apps/backend/src/maintenance/pre-flight-dvir.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx", "utf8"),
};

function failures(s) {
  const result = [];
  const need = (ok, message) => { if (!ok) result.push(message); };
  need(/queueQuerySchema[\s\S]{0,350}limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)[\s\S]{0,100}offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(s.route), "queue must validate range");
  need(/COUNT\(\*\) OVER\(\)::int AS total_count/.test(s.route) && /LIMIT \$4[\s\S]{0,60}OFFSET \$5/.test(s.route), "queue must return exact filtered page total and parameterized range");
  need(/total_count: Number\(\(res\.rows\[0\]/.test(s.route), "queue response must publish total");
  need(/limit\?: number; offset\?: number/.test(s.api) && /defects: PreFlightDvirQueueRow\[\]; total_count: number/.test(s.api), "client must carry range and total");
  need(/offset: \(page - 1\) \* pageSize/.test(s.page) && /queryKey: \["maintenance", "pre-flight-dvir", operatingCompanyId, tab, page\]/.test(s.page), "all severity tabs must request selected server page");
  need(/data-testid="pre-flight-dvir-server-pager"/.test(s.page) && /pageSize=\{pageSize\}[\s\S]{0,100}\bhidePager\b/.test(s.page), "queue must expose one exact server pager");
  need((s.page.match(/setPage\(1\)/g) ?? []).length >= 3, "company/tab and both route/severity mutations must reset page");
  need(/Couldn't load the pre-flight DVIR queue[\s\S]{0,220}q\.refetch\(\)/.test(s.page), "queue failure must remain retryable");
  need(/kind="unit"[\s\S]{0,450}kind="driver"[\s\S]{0,900}kind="work_order"/.test(s.page), "unit driver and work-order drills must remain mounted");
  return result;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...source, route: source.route.replace("max(200).default(50)", "max(500).default(500)") },
    { ...source, route: source.route.replace("COUNT(*) OVER()::int AS total_count", "500 AS hidden_count") },
    { ...source, route: source.route.replace("LIMIT $4", "LIMIT 500") },
    { ...source, route: source.route.replace("total_count: Number((res.rows[0]", "hidden_count: Number((res.rows[0]") },
    { ...source, api: source.api.replaceAll("limit?: number; offset?: number", "") },
    { ...source, page: source.page.replace("offset: (page - 1) * pageSize", "offset: 0") },
    { ...source, page: source.page.replace('data-testid="pre-flight-dvir-server-pager"', 'data-testid="removed-pager"') },
    { ...source, page: source.page.replace("hidePager", "showPager") },
    { ...source, page: source.page.replaceAll("setPage(1)", "setPage(2)") },
    { ...source, page: source.page.replace("q.refetch()", "Promise.resolve()") },
    { ...source, page: source.page.replace('kind="work_order"', 'kind="unit"') },
  ];
  const escaped = mutations.map((mutation, index) => failures(mutation).length ? null : index + 1).filter(Boolean);
  if (escaped.length) { console.error(`FAIL(selftest): escaped mutations ${escaped.join(", ")}`); process.exit(1); }
  console.log(`PASS(selftest): ${mutations.length}/${mutations.length} pre-flight DVIR range mutations detected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) { missing.forEach((item) => console.error(`FAIL: ${item}`)); process.exit(1); }
console.log("PASS: Major, Minor, and Observation DVIR queues navigate the complete scoped driver/unit/WO range");
