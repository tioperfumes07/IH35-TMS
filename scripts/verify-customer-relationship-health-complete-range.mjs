#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = {
  routes: "apps/backend/src/customers/relationship-score/routes.ts",
  service: "apps/backend/src/customers/relationship-score/scorer.service.ts",
  api: "apps/frontend/src/api/mdata.ts",
  view: "apps/frontend/src/pages/customers/CustomersListView.tsx",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function verify(sources = {}) {
  const routes = sources.routes ?? read(REL.routes);
  const service = sources.service ?? read(REL.service);
  const api = sources.api ?? read(REL.api);
  const view = sources.view ?? read(REL.view);
  const atRiskRoute = routes.slice(routes.indexOf('app.get("/api/v1/customers/relationship-scores/at-risk"'));
  const checks = [
    ["route validates bounded offset", /offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(routes)],
    ["route returns exact total not page length", /count: listed\.total/.test(routes) && /total: listed\.total/.test(routes) && !/count: rows\.length/.test(routes)],
    ["route exposes stable range envelope", /has_more: parsedQuery\.data\.offset \+ listed\.rows\.length < listed\.total/.test(routes)],
    ["service counts identical scoped graph", /SELECT COUNT\(\*\)::int AS total[\s\S]*?FROM master_data\.customer_relationship_scores s[\s\S]*?s\.operating_company_id = \$1::uuid[\s\S]*?s\.health_tier = 'at_risk'[\s\S]*?c\.deactivated_at IS NULL/.test(service)],
    ["service uses deterministic paged order", /ORDER BY s\.overall_health_score ASC, c\.customer_name ASC, s\.customer_uuid ASC[\s\S]*?LIMIT \$2::int[\s\S]*?OFFSET \$3::int/.test(service)],
    ["client forwards offset and total", /if \(params\.offset !== undefined\) query\.set\("offset"/.test(api) && /total: number;[\s\S]*?has_more: boolean/.test(api)],
    ["client scans all pages", /export async function listAllAtRiskCustomerRelationshipScores/.test(api) && /for \(;;\)/.test(api) && /offset \+= page\.customers\.length/.test(api)],
    ["client fails on incomplete or duplicate range", /if \(seen\.has\(customer\.customer_uuid\)\) throw new Error\("Customer relationship score pagination returned a duplicate customer\."\)/.test(api) && /pagination stopped before the reported total/.test(api) && /customers\.length !== \(expectedTotal \?\? 0\)/.test(api)],
    ["mounted customer list uses complete helper", /queryFn: \(\) => listAllAtRiskCustomerRelationshipScores\(companyId\)/.test(view)],
    ["mounted customer list removes misleading capped notice", !/CappedListNotice/.test(view) && !/limit:\s*250/.test(view)],
    ["at-risk route fails loud when canonical score table is unavailable", /if \(!\(await relationshipScoresTableExists\(client\)\)\) \{\s*return \{ error: "relationship_scores_unavailable" as const \};\s*\}[\s\S]*?listAtRiskRelationshipScores/.test(atRiskRoute) && /result\.error === "relationship_scores_unavailable"[\s\S]*?reply\.code\(503\)/.test(atRiskRoute)],
    ["service never converts a missing canonical score table to an honest empty range", !/hasRelationshipScores[\s\S]*?return \{ rows: \[\], total: 0 \}/.test(service)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, read(rel)]));
  const mutations = [
    ["page-length count", { ...live, routes: live.routes.replace("count: listed.total", "count: listed.rows.length") }],
    ["unstable order", { ...live, service: live.service.replace(", s.customer_uuid ASC", "") }],
    ["first page only", { ...live, api: live.api.replace("for (;;) {", "for (; offset === 0;) {") }],
    ["no duplicate protection", { ...live, api: live.api.replace("if (seen.has(customer.customer_uuid))", "if (false)") }],
    ["mounted capped reader", { ...live, view: live.view.replace("listAllAtRiskCustomerRelationshipScores(companyId)", "listAtRiskCustomerRelationshipScores({ operating_company_id: companyId, limit: 250 })") }],
    ["missing table becomes empty", { ...live, service: live.service.replace("const totalRes =", 'const hasRelationshipScores = await tableExists(client, "master_data", "customer_relationship_scores");\n  if (!hasRelationshipScores) return { rows: [], total: 0 };\n\n  const totalRes =') }],
    ["route skips canonical table availability", { ...live, routes: live.routes.replaceAll('if (!(await relationshipScoresTableExists(client))) {\n        return { error: "relationship_scores_unavailable" as const };\n      }', 'if (false) {\n        return { error: "relationship_scores_unavailable" as const };\n      }') }],
  ];
  for (const [name, mutated] of mutations) {
    if (verify(mutated).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} customer relationship range regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: customer relationship health scans the complete company-scoped at-risk range");
}
