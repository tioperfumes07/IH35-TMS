#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["driver_reports.queue"],"task":"MAINT-F5884-DRIVER-REPORT-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-driver-report-driver-reverse";
const GUARD = "scripts/verify-driver-report-driver-reverse.mjs";
const HEADER = '/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["driver_reports.queue"],"task":"MAINT-F5884-DRIVER-REPORT-REVERSE-EXACT","vertical":"class-sweep"} */';
const FILES = {
  creator: "apps/frontend/src/pages/driver/ReportIssueModal.tsx",
  writer: "apps/backend/src/driver/reports.routes.ts",
  routes: "apps/backend/src/maintenance/driver-reports.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/components/maintenance/DriverReportsReverseSection.tsx",
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  queue: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
  home: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  matrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: GUARD,
};
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s = source) {
  const failures = [];
  if (!/await submitDriverReport\(\{[\s\S]{0,180}?load_id: loadId \?\? null/.test(s.creator)) failures.push("driver creator payload");
  if (!/INSERT INTO maintenance\.driver_reports \([\s\S]{0,300}?driver_id, load_id[\s\S]{0,300}?operatingCompanyId,[\s\S]{0,60}?driver\.id,[\s\S]{0,60}?parsed\.data\.load_id \?\? null/.test(s.writer)) failures.push("session-derived driver writer");
  if (!/driver_id: z\.string\(\)\.uuid\(\)\.optional/.test(s.routes) || !/r\.driver_id = \$\$\{values\.length\}::uuid/.test(s.routes)) failures.push("exact scoped reverse");
  if (!/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(s.routes) || !/count\(\*\)::int AS total_count/.test(s.routes) || !/LIMIT \$\$\{values\.length - 1\} OFFSET \$\$\{values\.length\}/.test(s.routes) || /LIMIT 500/.test(s.routes)) failures.push("honest server pagination");
  if (!/listDriverReports\(params: \{ operating_company_id: string; status\?: string; driver_id\?: string; load_id\?: string; limit\?: number; offset\?: number \}\)[\s\S]{0,300}?if \(params\.driver_id\) qs\.set\("driver_id", params\.driver_id\)/.test(s.api)) failures.push("typed API filter");
  if (!/limit\?: number; offset\?: number/.test(s.api) || !/total_count: number/.test(s.api)) failures.push("typed pagination response");
  if (!/listDriverReports\(\{ operating_company_id: operatingCompanyId, driver_id: driverId, limit: 5 \}\)/.test(s.reverse)) failures.push("driver reverse");
  if (!/<DriverReportsReverseSection operatingCompanyId=\{String\(driver\.operating_company_id\)\} driverId=\{id\}/.test(s.detail) || !/<DriverReportsReverseSection operatingCompanyId=\{companyId\} driverId=\{id\}/.test(s.profile)) failures.push("both profile mounts");
  if (!/kind=["']driver_report["']/.test(s.reverse) || !/highlightedReportId/.test(s.queue) || !/rowClassName/.test(s.queue) || !/driverReportId/.test(s.home)) failures.push("canonical drill");
  if (!/kind=["']driver_reports_driver["']/.test(s.reverse) || !/Open report queue/.test(s.reverse)) failures.push("queue EntityLink");
  if (!/const effectiveDriverId = driverPickerId\.trim\(\) \|\| filterDriverId \|\| undefined/.test(s.queue) || !/driver_id: effectiveDriverId/.test(s.queue) || !/driverReportsDriverId/.test(s.home) || !/searchParams\.get\(["']driver_id["']\)/.test(s.home) || !/dataTestId="driver-reports-filter-driver"/.test(s.queue) || !/allowCreate=\{false\}/.test(s.queue)) failures.push("queue driver filter honor");
  if (!/query\.isError/.test(s.reverse) || !/No reports submitted by this driver/.test(s.reverse)) failures.push("honest states");
  if (!/limit: 5/.test(s.reverse) || !/total_count/.test(s.reverse) || !/Showing \{rows\.length\} of \{totalCount\}/.test(s.reverse)) failures.push("honest reverse preview range");
  if (!/limit: pageSize/.test(s.queue) || !/offset: \(page - 1\) \* pageSize/.test(s.queue) || !/driver-reports-server-pager/.test(s.queue) || !/q\.data\.total_count/.test(s.queue)) failures.push("queue server pager");
  const matrix = JSON.parse(s.matrix);
  if (!matrix.leaves.find((leaf) => leaf.id === "driver_reports.queue")?.required?.includes("reverse_link")) failures.push("Maintenance Required reverse cell missing");
  if (!s.self.split("\n").includes(HEADER)) failures.push("exact Maintenance Built header missing");
  if ((JSON.parse(s.feed).entries ?? []).some((entry) => entry.guard === GUARD && entry.cols?.includes("reverse_link"))) failures.push("broad manual driver-report feed remains");
  return failures;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  if (audit().length) throw new Error(`baseline failed: ${audit().join("; ")}`);
  const mutations = [
    ["creator", "await submitDriverReport({", "await missingSubmit({"],
    ["writer", "driver.id,\n            parsed.data.load_id ?? null", "missingDriver,\n            parsed.data.load_id ?? null"],
    ["routes", "driver_id: z.string().uuid().optional()", "wrong_id: z.string()"],
    ["routes", "r.driver_id = $${values.length}::uuid", "TRUE"],
    ["routes", "count(*)::int AS total_count", "count(*)::int AS hidden_count"],
    ["api", "status?: string; driver_id?: string; load_id?: string", "status?: string; wrong_id?: string; load_id?: string"],
    ["reverse", "driver_id: driverId", "driver_id: ''"],
    ["detail", "<DriverReportsReverseSection operatingCompanyId={String(driver.operating_company_id)} driverId={id}", "<MissingSection operatingCompanyId={String(driver.operating_company_id)} driverId={id}"],
    ["profile", "<DriverReportsReverseSection operatingCompanyId={companyId} driverId={id}", "<MissingSection operatingCompanyId={companyId} driverId={id}"],
    ["reverse", 'kind="driver_report"', 'kind="unit"'],
    ["reverse", "No reports submitted by this driver", "No rows"],
    ["reverse", "limit: 5", "limit: 500"],
    ["reverse", 'kind="driver_reports_driver"', 'kind="driver_report"'],
    ["queue", "driver_id: effectiveDriverId", "driver_id: undefined"],
    ["queue", "offset: (page - 1) * pageSize", "offset: 0"],
    ["matrix", '"id": "driver_reports.queue"', '"id": "driver_reports.queue.broken"'],
    ["self", HEADER, `${HEADER}.broken`],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`fixture missing: ${key}`);
    if (!audit({ ...source, [key]: source[key].replace(before, after) }).length) throw new Error(`mutation survived: ${key}`);
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ task: "BROKEN", guard: GUARD, modules: ["maintenance"], cols: ["reverse_link"], leafRe: "^maintenance" });
  if (!audit({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + 1}/${mutations.length + 1} mutations detected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver-session report FK reaches exact Maintenance queue reverse route`);
