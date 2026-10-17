#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  // 443.182-A (52699c6c2f, #26871) moved listLoads / listAllLoads verbatim out of loads.ts into the one-source
  // load catalog (loads.ts only re-exports them). The scanner rules follow the code; none is relaxed.
  api: "apps/frontend/src/api/catalog-loads.ts",
  detail: "apps/frontend/src/pages/CustomerDetail.tsx",
  route: "apps/backend/src/mdata/loads.routes.ts",
};
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function verify(sources = {}) {
  const apiFile = sources.api ?? read(FILES.api);
  // Scope scanner rules to listAllLoads itself: the catalog also holds listAllDispatchLoads, whose own
  // seen/total checks must not satisfy (or mask) this scanner's.
  const scanStart = apiFile.indexOf("export async function listAllLoads(");
  const scanEnd = scanStart < 0 ? -1 : apiFile.indexOf("\nexport ", scanStart + 1);
  const api = scanStart < 0 ? "" : apiFile.slice(scanStart, scanEnd < 0 ? undefined : scanEnd);
  const detail = sources.detail ?? read(FILES.detail);
  const route = sources.route ?? read(FILES.route);
  const checks = [
    ["backend returns exact total and has_more", /total_count: listResult\.totalCount/.test(route) && /has_more: offset \+ limit < listResult\.totalCount/.test(route)],
    ["backend customer range order is stable", /sortField === "created_at"[\s\S]*?`\$\{sortColumn\} \$\{sortDirection\}, l\.id ASC`/.test(route)],
    ["client exposes complete load scanner", /export async function listAllLoads\(filters: Omit<LoadsListFilters, "limit" \| "offset">\)/.test(api)],
    ["scanner advances exact pages", /for \(;;\)/.test(api) && /limit: pageSize, offset/.test(api) && /offset \+= page\.loads\.length/.test(api)],
    ["scanner rejects drift duplicates and incomplete ranges", /page\.total_count !== expectedTotal/.test(api) && /seen\.has\(load\.id\)/.test(api) && /pagination stopped before the reported total/.test(api) && /loads\.length !== \(expectedTotal \?\? 0\)/.test(api)],
    // LEAD 443.99 class B (2026-10-12).
    //   old rule: queryFn: () => listAllLoads({ customer_id: id, ..., sort: "created_at:desc" }) — one scan.
    //   new rule: the customer-loads queryFn scans BOTH board scopes with listAllLoads (live + history, each
    //             customer_id: id, sort "created_at:desc") and merges them de-duplicated by load id.
    //   why: ROUND 283.2 (#23212, 8915dd1d81) made listLoads fail closed without a board_scope, so a complete
    //        customer history is now live + history merged. Dropping either scope still fails.
    ["customer load tab and related-load picker use complete range", ["live", "history"].every((scope) =>
      new RegExp(`listAllLoads\\(\\{\\s*customer_id: id,[^}]*board_scope: "${scope}",\\s*sort: "created_at:desc"`).test(detail)) &&
      /queryKey: \["customer-loads", id, operatingCompanyId\][\s\S]{0,1600}if \(seen\.has\(row\.id\)\) continue;/.test(detail)],
    ["customer detail no longer hard-caps shared load source", !/queryFn: \(\) =>\s*listLoads\(\{[\s\S]*?customer_id: id,[\s\S]*?limit: 200/.test(detail)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
  const mutations = [
    ["first page only", { ...live, api: live.api.replace("for (;;) {", "for (; offset === 0;) {") }],
    ["duplicate protection removed", { ...live, api: live.api.replace("if (seen.has(load.id))", "if (false)") }],
    ["incomplete range accepted", { ...live, api: live.api.replace("if (loads.length !== (expectedTotal ?? 0))", "if (false)") }],
    ["customer remounted on capped reader", { ...live, detail: live.detail.replace("listAllLoads({", "listLoads({\n        limit: 200,") }],
    ["customer history scope dropped", { ...live, detail: live.detail.replace('board_scope: "history",', 'board_scope: "live",') }],
    ["customer live+history merge not de-duplicated", { ...live, detail: live.detail.replace("if (seen.has(row.id)) continue;", "") }],
    ["unstable created order", { ...live, route: live.route.replace("`${sortColumn} ${sortDirection}, l.id ASC`", "`${sortColumn} ${sortDirection}`") }],
  ];
  if (verify(live).length) throw new Error(`selftest: real tree not green: ${verify(live).join("; ")}`);
  for (const [name, mutated] of mutations) {
    if (Object.keys(live).every((key) => mutated[key] === live[key])) throw new Error(`selftest setup: ${name} anchor not found (source drifted)`);
    if (verify(mutated).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} customer load range regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: customer load history and related-load picker scan the complete scoped range");
}
