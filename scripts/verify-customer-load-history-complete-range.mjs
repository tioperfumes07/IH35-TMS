#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  api: "apps/frontend/src/api/loads.ts",
  detail: "apps/frontend/src/pages/CustomerDetail.tsx",
  route: "apps/backend/src/mdata/loads.routes.ts",
};
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function verify(sources = {}) {
  const api = sources.api ?? read(FILES.api);
  const detail = sources.detail ?? read(FILES.detail);
  const route = sources.route ?? read(FILES.route);
  const checks = [
    ["backend returns exact total and has_more", /total_count: listResult\.totalCount/.test(route) && /has_more: offset \+ limit < listResult\.totalCount/.test(route)],
    ["backend customer range order is stable", /sortField === "created_at"[\s\S]*?`\$\{sortColumn\} \$\{sortDirection\}, l\.id ASC`/.test(route)],
    ["client exposes complete load scanner", /export async function listAllLoads\(filters: Omit<LoadsListFilters, "limit" \| "offset">\)/.test(api)],
    ["scanner advances exact pages", /for \(;;\)/.test(api) && /limit: pageSize, offset/.test(api) && /offset \+= page\.loads\.length/.test(api)],
    ["scanner rejects drift duplicates and incomplete ranges", /page\.total_count !== expectedTotal/.test(api) && /seen\.has\(load\.id\)/.test(api) && /pagination stopped before the reported total/.test(api) && /loads\.length !== \(expectedTotal \?\? 0\)/.test(api)],
    ["customer load tab and related-load picker use complete range", /queryFn: \(\) =>\s*listAllLoads\(\{[\s\S]*?customer_id: id,[\s\S]*?sort: "created_at:desc"/.test(detail)],
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
    ["unstable created order", { ...live, route: live.route.replace("`${sortColumn} ${sortDirection}, l.id ASC`", "`${sortColumn} ${sortDirection}`") }],
  ];
  for (const [name, mutated] of mutations) {
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
