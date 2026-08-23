#!/usr/bin/env node
/**
 * Integrity Reports outlier table must EntityLink driver/unit/vendor — never raw UUID text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx";
const ROUTE = "apps/backend/src/routes/safety/integrity.ts";
const API = "apps/frontend/src/api/safetyV64.ts";

function assert(src, route, api) {
  const problems = [];
  if (!/EntityLink/.test(src)) problems.push(`${PAGE}: must import/use EntityLink`);
  if (!/kind=\"driver\"/.test(src) || !/kind=\"unit\"/.test(src) || !/kind=\"vendor\"/.test(src)) {
    problems.push(`${PAGE}: Entity column must link driver, unit, and vendor kinds`);
  }
  if (/String\(row\.unit_id\s*\?\?\s*row\.driver_id/.test(src)) {
    problems.push(`${PAGE}: must not stringify raw unit_id/driver_id as the Entity cell`);
  }
  if (/entityLabel\(null,\s*row\.subject_id/.test(src)) {
    problems.push(`${PAGE}: must not render an unproven polymorphic subject_id as entity identity`);
  }
  if (!/entityLabel\(row\.driver_name, driverId, "Driver"\)/.test(src) || !/entityLabel\(row\.unit_number, unitId, "Unit"\)/.test(src)) {
    problems.push(`${PAGE}: mounted entity links must consume typed driver/unit labels`);
  }
  if (!/export type IntegrityReportRow/.test(api) || !/driver_name\?: string \| null/.test(api) || !/unit_number\?: string \| null/.test(api)) {
    problems.push(`${API}: four integrity payloads must share a typed human-label contract`);
  }
  const driverJoins = route.match(/driver_company_authorizations integrity_report_driver_dca[\s\S]{0,320}integrity_report_driver_dca\.driver_id = d\.id[\s\S]{0,180}integrity_report_driver_dca\.company_id = o\.operating_company_id[\s\S]{0,180}integrity_report_driver_dca\.is_authorized = true[\s\S]{0,180}integrity_report_driver_dca\.deactivated_at IS NULL/g) ?? [];
  const unitJoins = route.match(/LEFT JOIN mdata\.units u ON u\.id = o\.unit_id\s+AND COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = o\.operating_company_id/g) ?? [];
  if (driverJoins.length !== 3 || unitJoins.length !== 2) {
    problems.push(`${ROUTE}: every applicable outlier view must resolve driver labels through home-company or active canonical authorization and units through owner/lease scope`);
  }
  if ((route.match(/AS driver_name/g) ?? []).length !== 3 || (route.match(/u\.unit_number/g) ?? []).length < 2) {
    problems.push(`${ROUTE}: applicable view projections must expose driver_name/unit_number`);
  }
  return problems;
}

const live = readFileSync(path.join(ROOT, PAGE), "utf8");
const liveRoute = readFileSync(path.join(ROOT, ROUTE), "utf8");
const liveApi = readFileSync(path.join(ROOT, API), "utf8");
if (SELFTEST) {
  const planted = live.replace(/IntegrityEntityCell[\s\S]*?function IntegrityReportsTab/, "function IntegrityReportsTab")
    .replace(/render: \(row\) => <IntegrityEntityCell row=\{row\} \/>/, 'render: (row) => String(row.unit_id ?? row.driver_id ?? row.vendor_id ?? row.subject_id ?? "—")')
    .replace(/import \{ EntityLink \}[^\n]+\n/, "");
  const mutations = [
    [planted, liveRoute, liveApi],
    [live, liveRoute.replace("integrity_report_driver_dca.is_authorized = true", "integrity_report_driver_dca.is_authorized = false"), liveApi],
    [live, liveRoute.replace("AS driver_name", "AS unresolved_driver"), liveApi],
    [live, liveRoute, liveApi.replace("driver_name?: string | null", "driver_name?: unknown")],
    [live.replace("row.unit_number, unitId", "null, unitId"), liveRoute, liveApi],
    [live.replace("return <>—</>;", 'return <>{entityLabel(null, row.subject_id, "Record") ?? "—"}</>;'), liveRoute, liveApi],
  ];
  const escaped = mutations.find(([page, route, api]) => !assert(page, route, api).length);
  const caught = escaped ? [] : ["caught"];
  if (!caught.length) {
    console.error("SELFTEST FAIL — planted raw-UUID cell not caught");
    process.exit(1);
  }
  const ok = assert(live, liveRoute, liveApi);
  if (ok.length) {
    console.error("SELFTEST FAIL — live unclean:\n" + ok.join("\n"));
    process.exit(1);
  }
  console.log("verify-saf-integrity-reports-entitylink SELFTEST PASS");
  process.exit(0);
}

const problems = assert(live, liveRoute, liveApi);
if (problems.length) {
  console.error("verify-saf-integrity-reports-entitylink FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-integrity-reports-entitylink OK");
