#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  route: "apps/backend/src/catalogs/fmcsa.routes.ts",
  api: "apps/frontend/src/api/fmcsa.ts",
  detail: "apps/frontend/src/pages/CustomerDetail.tsx",
};
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

export function verify(sources = {}) {
  const route = sources.route ?? read(FILES.route);
  const api = sources.api ?? read(FILES.api);
  const detail = sources.detail ?? read(FILES.detail);
  const checks = [
    ["route counts the identical company scope", /SELECT COUNT\(\*\)::int AS total FROM catalogs\.fmcsa_lookups WHERE operating_company_id = \$1::uuid/.test(route)],
    ["route uses stable offset order", /ORDER BY created_at DESC, id ASC[\s\S]*?LIMIT \$2[\s\S]*?OFFSET \$3/.test(route)],
    ["route returns exact range envelope", /total: listed\.total/.test(route) && /has_more: parsedQuery\.data\.offset \+ listed\.rows\.length < listed\.total/.test(route)],
    ["client scans every page", /export async function listAllFmcsaLookups/.test(api) && /for \(;;\)/.test(api) && /offset \+= page\.lookups\.length/.test(api)],
    ["client rejects drift duplicates and incomplete ranges", /page\.total !== expectedTotal/.test(api) && /seen\.has\(lookup\.lookup_id\)/.test(api) && /pagination stopped before the reported total/.test(api) && /lookups\.length !== \(expectedTotal \?\? 0\)/.test(api)],
    ["customer verification modal mounts complete history", /queryFn: \(\) => listAllFmcsaLookups\(operatingCompanyId!\)/.test(detail)],
    ["customer verification modal has no 25-row reader", !/listFmcsaLookups\(operatingCompanyId!, \{ limit: 25 \}\)/.test(detail)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
  const mutations = [
    ["page count", { ...live, route: live.route.replace("total: listed.total", "total: listed.rows.length") }],
    ["unstable order", { ...live, route: live.route.replace("ORDER BY created_at DESC, id ASC", "ORDER BY created_at DESC") }],
    ["first page only", { ...live, api: live.api.replace("for (;;) {", "for (; offset === 0;) {") }],
    ["duplicate protection removed", { ...live, api: live.api.replace("if (seen.has(lookup.lookup_id))", "if (false)") }],
    ["capped modal remounted", { ...live, detail: live.detail.replace("listAllFmcsaLookups(operatingCompanyId!)", "listFmcsaLookups(operatingCompanyId!, { limit: 25 })") }],
  ];
  for (const [name, mutated] of mutations) {
    if (verify(mutated).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} customer FMCSA history regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: customer FMCSA verification history scans the complete company range");
}
