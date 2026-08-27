#!/usr/bin/env node
import fs from "node:fs";

const ROUTE = "apps/backend/src/safety/dvir.routes.ts";
const API = "apps/frontend/src/api/safety.ts";
const PAGE = "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

export function verify(sources = {}) {
  const route = sources.route ?? read(ROUTE);
  const api = sources.api ?? read(API);
  const page = sources.page ?? read(PAGE);
  const checks = [
    ["route validates search", /search: z\.string\(\)\.trim\(\)\.max\(120\)\.optional\(\)/.test(route)],
    ["route searches picker label fields", /ds\.type::text ILIKE/.test(route) && /ds\.submitted_at::text ILIKE/.test(route)],
    ["count and rows share search filter", /filters\.push\(`\(ds\.type::text ILIKE/.test(route) && /WHERE \$\{filters\.join\(" AND "\)\}/.test(route)],
    ["stable DVIR page", /ORDER BY ds\.submitted_at DESC, ds\.id DESC/.test(route)],
    ["API forwards search", /if \(filters\.search\) qs\.set\("search", filters\.search\)/.test(api)],
    ["picker search is query state", /const \[dvirSearch, setDvirSearch\] = useState/.test(page) && /draft\.unit_id, dvirSearch\]/.test(page)],
    ["picker sends search", /search: dvirSearch \|\| undefined/.test(page) && /onSearch=\{setDvirSearch\}/.test(page)],
    ["selected historical DVIR hydrates exactly", /getSafetyDvirDetail\(draft\.dvir_submission_id, companyId\)/.test(page) && /rows\.unshift\(selected\)/.test(page)],
    ["editing search clears stale FK", /clearCommittedOnEdit/.test(page)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { route: read(ROUTE), api: read(API), page: read(PAGE) };
  const mutations = [
    ["no server search", { ...live, page: live.page.replace("onSearch={setDvirSearch}", "") }],
    ["search omitted from query key", { ...live, page: live.page.replace(", dvirSearch]", "]") }],
    ["historical selection dropped", { ...live, page: live.page.replace("rows.unshift(selected)", "void selected") }],
    ["unstable page", { ...live, route: live.route.replace("ORDER BY ds.submitted_at DESC, ds.id DESC", "ORDER BY ds.submitted_at DESC") }],
  ];
  for (const [name, sources] of mutations) {
    if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} DVIR picker regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: maintenance inspection DVIR picker server-searches and preserves selected history");
}
