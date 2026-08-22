#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["load","connectivity","picker_law"],"leafRe":"^queues\\.in_transit(\\.create)?$|^load\\.detail$","task":"THEATER-INTRANSIT-LOAD-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-intransit-issue-load-linkage";
const files = {
  create: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  api: "apps/frontend/src/api/dispatch.ts",
  route: "apps/backend/src/dispatch/arch-tabs.routes.ts",
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  reverse: "apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/kind="load"[\s\S]{0,180}value=\{loadId \|\| null\}/.test(s.create) || !/load_id:\s*loadId\.trim\(\)/.test(s.create)) failures.push("load picker-to-payload create path missing");
  if (!/EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/.test(s.create)) failures.push("queue load must drill only when its identity resolves");
  if (!/EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/.test(s.create)) failures.push("queue driver must drill only when its identity resolves");
  if (!/EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/.test(s.create)) failures.push("queue unit must drill only when its identity resolves");
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/load_id:\s*query\.data\.load_id/.test(s.route)) failures.push("exact load filter route contract missing");
  if (!/filters:\s*\{[^}]*load_id\?: string[^}]*\}\s*=\s*\{\}/.test(s.service) || !/i\.load_id = \$\$\{values\.length\}::uuid/.test(s.service)) failures.push("exact server-side load filter missing");
  if (!/i\.operating_company_id = \$1::uuid/.test(s.service) || !/operating_company_id, load_id, driver_id, unit_id/.test(s.service)) failures.push("writer/list explicit company scope missing");
  if (!/WHERE id = \$1 AND operating_company_id = \$2::uuid AND soft_deleted_at IS NULL/.test(s.service)) failures.push("writer must validate active tenant load FK");
  if (!/filters\.load_id[\s\S]{0,100}q\.set\("load_id", filters\.load_id\)/.test(s.api)) failures.push("frontend exact load query parameter missing");
  if (!/listDispatchIntransitIssues\(operatingCompanyId, \{ load_id: loadId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No in-transit issues linked to this load/.test(s.reverse)) failures.push("honest load reverse section missing");
  if (!/LoadInTransitIssuesReverseSection[\s\S]{0,180}loadId=\{load\.id\}/.test(s.drawer)) failures.push("load drawer reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "create", /kind="load"([\s\S]{0,180}value=\{loadId \|\| null\})/, 'kind="driver"$1'],
    ["payload", "create", /load_id:\s*loadId\.trim\(\)/, "load_id: ''"],
    ["queue-load", "create", /EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/, 'EntityLink kind="load" id={issue.load_id}'],
    ["queue-driver", "create", /EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/, 'EntityLink kind="driver" id={issue.driver_id}'],
    ["queue-unit", "create", /EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/, 'EntityLink kind="unit" id={issue.unit_id}'],
    ["route", "route", /load_id:\s*query\.data\.load_id/, "load_id: undefined"],
    ["filter-contract", "service", /filters:\s*\{ status\?: string; issue_id\?: string; load_id\?: string; driver_id\?: string; unit_id\?: string \}/, "filters: { status?: string; issue_id?: string; driver_id?: string; unit_id?: string }"],
    ["filter", "service", /i\.load_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["scope", "service", /i\.operating_company_id = \$1::uuid/, "TRUE"],
    ["writer", "service", /operating_company_id, load_id, driver_id, unit_id/, "load_id, driver_id, unit_id"],
    ["api", "api", /q\.set\("load_id", filters\.load_id\)/, 'q.set("status", filters.load_id)'],
    ["reverse", "reverse", /load_id: loadId/, "load_id: operatingCompanyId"],
    ["mount", "drawer", /LoadInTransitIssuesReverseSection/g, "MissingIssueReverse"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — load picker→tenant writer→exact reverse route→load drawer`);
