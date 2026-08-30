#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["load","connectivity","picker_law"],"leafRe":"^queues\\.in_transit(\\.create)?$|^load\\.detail$","task":"THEATER-INTRANSIT-LOAD-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-intransit-issue-load-linkage";
const files = {
  create: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  api: "apps/frontend/src/api/dispatch.ts",
  route: "apps/backend/src/dispatch/arch-tabs.routes.ts",
  driverRoute: "apps/backend/src/dispatch/intransit-issues.routes.ts",
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  reverse: "apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/kind="load"[\s\S]{0,180}value=\{loadId \|\| null\}/.test(s.create) || !/load_id:\s*input\.loadId/.test(s.create)) failures.push("load picker-to-immutable-payload create path missing");
  if (!/EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/.test(s.create)) failures.push("queue load must drill only when its identity resolves");
  if (!/EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/.test(s.create)) failures.push("queue driver must drill only when its identity resolves");
  if (!/EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/.test(s.create)) failures.push("queue unit must drill only when its identity resolves");
  if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/load_id:\s*query\.data\.load_id/.test(s.route)) failures.push("exact load filter route contract missing");
  if (!/filters:\s*\{[^}]*load_id\?: string[^}]*\}\s*=\s*\{\}/.test(s.service) || !/i\.load_id = \$\$\{values\.length\}::uuid/.test(s.service)) failures.push("exact server-side load filter missing");
  if (!/i\.operating_company_id = \$1::uuid/.test(s.service) || !/operating_company_id, load_id, driver_id, unit_id/.test(s.service)) failures.push("writer/list explicit company scope missing");
  if (!/WHERE id = \$1 AND operating_company_id = \$2::uuid AND soft_deleted_at IS NULL/.test(s.service)) failures.push("writer must validate active tenant load FK");
  if (!/FROM mdata\.loads l[\s\S]*d\.identity_user_id = \$1::uuid[\s\S]*d\.id IN \(l\.assigned_primary_driver_id, l\.assigned_secondary_driver_id\)[\s\S]*WHERE l\.id = \$2::uuid/.test(s.driverRoute)) failures.push("driver issue writer must derive company and driver from the assigned load");
  if (!/l\.operating_company_id = d\.operating_company_id[\s\S]{0,220}FROM mdata\.driver_company_authorizations issue_driver_dca[\s\S]{0,180}issue_driver_dca\.driver_id = d\.id[\s\S]{0,140}issue_driver_dca\.company_id = l\.operating_company_id[\s\S]{0,140}issue_driver_dca\.is_authorized = true[\s\S]{0,140}issue_driver_dca\.deactivated_at IS NULL/.test(s.driverRoute)) failures.push("driver issue writer must prove the caller's driver is authorized for the load company");
  if (!/set_config\('app\.operating_company_id', \$1::text, true\)[\s\S]*assignment\.operating_company_id/.test(s.driverRoute)) failures.push("driver issue writer must set exact load-company RLS scope");
  if (!/\[\["operating_company_id"\], assignment\.operating_company_id\]/.test(s.driverRoute)) failures.push("driver issue insert must stamp explicit canonical company");
  if (!/const inserted = insertedRes\.rows\[0\];[\s\S]{0,180}if \(!inserted\)[\s\S]{0,180}error: "intransit_issue_create_failed"[\s\S]{0,180}appendCrudAudit/.test(s.driverRoute)) failures.push("driver issue writer must reject a zero-row insert before audit/outbox success");
  if (!/filters\.load_id[\s\S]{0,100}q\.set\("load_id", filters\.load_id\)/.test(s.api)) failures.push("frontend exact load query parameter missing");
  if (!/listDispatchIntransitIssues\(operatingCompanyId, \{ load_id: loadId \}\)/.test(s.reverse) || !/query\.isError/.test(s.reverse) || !/No in-transit issues linked to this load/.test(s.reverse)) failures.push("honest load reverse section missing");
  if (!/<ListErrorState[\s\S]*?Could not load in-transit issues for this load\.[\s\S]*?onRetry=\{\(\) => void query\.refetch\(\)\}/.test(s.reverse)) failures.push("load reverse failure must retry the exact scoped query");
  if (!/const rows = query\.isError \? \[\] : \(query\.data\?\.issues \?\? \[\]\)/.test(s.reverse)) failures.push("failed reverse read must suppress stale issue rows and heading count");
  if (!/!query\.isError && rows\.length \? \(/.test(s.reverse)) failures.push("failed reverse read must not render stale issue rows");
  if (!/LoadInTransitIssuesReverseSection[\s\S]{0,180}loadId=\{load\.id\}/.test(s.drawer)) failures.push("load drawer reverse mount missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "create", /kind="load"([\s\S]{0,180}value=\{loadId \|\| null\})/, 'kind="driver"$1'],
    ["payload", "create", /load_id:\s*input\.loadId/, "load_id: ''"],
    ["queue-load", "create", /EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/, 'EntityLink kind="load" id={issue.load_id}'],
    ["queue-driver", "create", /EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/, 'EntityLink kind="driver" id={issue.driver_id}'],
    ["queue-unit", "create", /EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/, 'EntityLink kind="unit" id={issue.unit_id}'],
    ["route", "route", /load_id:\s*query\.data\.load_id/, "load_id: undefined"],
    ["filter-contract", "service", /filters:\s*\{ status\?: string; issue_id\?: string; load_id\?: string; driver_id\?: string; unit_id\?: string \}/, "filters: { status?: string; issue_id?: string; driver_id?: string; unit_id?: string }"],
    ["filter", "service", /i\.load_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["scope", "service", /i\.operating_company_id = \$1::uuid/g, "TRUE"],
    ["writer", "service", /operating_company_id, load_id, driver_id, unit_id/, "load_id, driver_id, unit_id"],
    ["driver-assignment", "driverRoute", /d\.id IN \(l\.assigned_primary_driver_id, l\.assigned_secondary_driver_id\)/, "d.id = l.assigned_primary_driver_id"],
    ["driver-company-authorization", "driverRoute", /issue_driver_dca\.company_id = l\.operating_company_id/, "issue_driver_dca.company_id = d.operating_company_id"],
    ["driver-rls-scope", "driverRoute", /set_config\('app\.operating_company_id', \$1::text, true\)/, "set_config('app.unscoped', $1::text, true)"],
    ["driver-company-stamp", "driverRoute", /\[\["operating_company_id"\], assignment\.operating_company_id\]/, '[["operating_company_id"], null]'],
    ["driver-create-identity", "driverRoute", /error: "intransit_issue_create_failed"/, 'error: "removed"'],
    ["api", "api", /q\.set\("load_id", filters\.load_id\)/, 'q.set("status", filters.load_id)'],
    ["reverse", "reverse", /load_id: loadId/, "load_id: operatingCompanyId"],
    ["reverse-retry", "reverse", /onRetry=\{\(\) => void query\.refetch\(\)\}/, "onRetry={() => undefined}"],
    ["reverse-error-count", "reverse", /query\.isError \? \[\] :/, "false ? [] :"],
    ["reverse-error-rows", "reverse", /!query\.isError && rows\.length \? \(/, "rows.length ? ("],
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
