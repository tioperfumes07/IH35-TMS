#!/usr/bin/env node
// @matrix-built {"modules":["driver-hub"],"cols":["connectivity"],"leaves":["reporting"],"task":"CLASS-F5973-TRUE-REMAINDER-CODEX"}
/**
 * verify-driver-hub-surfaces-pack.mjs — DHUB-S01..S05 + LINK-01 ratchet.
 * Covers every Driver Hub tab surface: overview inbox, scheduler, leave requests, reporting, cascade linkage.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-surfaces-pack";

const FILES = {
  hubPage: "apps/frontend/src/pages/home/DriverHubPage.tsx",
  reporting: "apps/frontend/src/pages/home/DriverHubReportingPage.tsx",
  reportingApi: "apps/frontend/src/api/driverInboxReporting.ts",
  reportingBackend: "apps/backend/src/driver-finance/inbox-reporting.routes.ts",
  inbox: "apps/frontend/src/components/driver-inbox/DriverInbox.tsx",
  scheduler: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx",
  leaveRequests: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestInboxPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  required: "docs/specs/scoreboard/modules/driver-hub.required.json",
  guard: "scripts/verify-driver-hub-surfaces-pack.mjs",
};

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function assertWiring(readSourceFn = readSource) {
  const problems = [];
  const hub = readSourceFn(FILES.hubPage);
  const reporting = readSourceFn(FILES.reporting);
  const reportingApi = readSourceFn(FILES.reportingApi);
  const reportingBackend = readSourceFn(FILES.reportingBackend);
  const inbox = readSourceFn(FILES.inbox);
  const scheduler = readSourceFn(FILES.scheduler);
  const leave = readSourceFn(FILES.leaveRequests);
  const manifest = readSourceFn(FILES.manifest);
  const required = JSON.parse(readSourceFn(FILES.required));
  const guardHeader = readSourceFn(FILES.guard).split("\n").slice(0, 4).join("\n");

  if (!manifest.includes('path="/driver-hub"')) problems.push("manifest missing /driver-hub");
  if (!manifest.includes('path="/driver-hub/reporting"')) problems.push("manifest missing /driver-hub/reporting");
  const reportingLeaf = required.leaves?.find((leaf) => leaf.id === "reporting");
  if (!reportingLeaf?.required?.includes("connectivity")) problems.push("driver-hub reporting must require connectivity");
  if (!guardHeader.includes('// @matrix-built {"modules":["driver-hub"],"cols":["connectivity"],"leaves":["reporting"]')) {
    problems.push("guard missing exact reporting connectivity ownership");
  }

  for (const [name, src, needles] of [
    [FILES.hubPage, hub, ['useSearchParams', "leave_requests", "DriverSchedulerGridPage", "DriverSchedulerRequestInboxPage", "DriverInbox"]],
    [FILES.reporting, reporting, ["useCompanyContext", 'queryKey: ["driver-inbox-reporting", companyId, range.from, range.to]', "ListErrorBanner", "EntityLink", "getInboxReporting", 'data-testid="driver-hub-reporting-need-company"']],
    [FILES.reportingApi, reportingApi, ["operating_company_id: string", "/api/v1/driver-finance/inbox-reporting?${q}"]],
    [FILES.reportingBackend, reportingBackend, ['app.get("/api/v1/driver-finance/inbox-reporting"', "reportingQuerySchema.safeParse", "withCompanyScope(user.uuid, parsed.data.operating_company_id", "getInboxReportingData(client, parsed.data.operating_company_id"]],
    [FILES.inbox, inbox, ['<EntityLink kind="driver"', "cascadePreview", "Linkage — what posts on approve", "ListErrorBanner", "cashAdvanceRequestsOfficeApi.listPending", 'data-testid="driver-inbox-list-error"', '<SelectCombobox', 'aria-label="Pay from account"']],
    [FILES.scheduler, scheduler, ['<EntityLink kind="driver"', "No drivers are available for this operating company.", "Select an operating company"]],
    [FILES.leaveRequests, leave, ['<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"', "Select an operating company to view leave requests."]],
  ]) {
    for (const needle of needles) {
      if (!src.includes(needle)) problems.push(`${name} missing ${JSON.stringify(needle)}`);
    }
  }

  if (/<select[^>]*>[\s\S]*?Company default cash account/.test(inbox)) {
    problems.push(`${FILES.inbox} pay-from account regressed to a native select`);
  }

  return problems;
}

function run() {
  const problems = assertWiring();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

function selftest() {
  const originals = Object.fromEntries(Object.values(FILES).map((f) => [f, readSource(f)]));
  const cases = [
    [FILES.guard, '// @matrix-built {"modules":["driver-hub"],"cols":["connectivity"],"leaves":["reporting"]', "exact reporting connectivity owner"],
    [FILES.manifest, 'path="/driver-hub/reporting"', "reporting route"],
    [FILES.reporting, 'queryKey: ["driver-inbox-reporting", companyId, range.from, range.to]', "company/date keyed reporting read"],
    [FILES.reporting, "getInboxReporting", "reporting API consumer"],
    [FILES.reportingApi, "operating_company_id: string", "required company API parameter"],
    [FILES.reportingBackend, "withCompanyScope(user.uuid, parsed.data.operating_company_id", "backend selected-company scope"],
    [FILES.inbox, 'data-testid="driver-inbox-list-error"', "inbox ListErrorBanner testid"],
    [FILES.inbox, "Linkage — what posts on approve", "cascade linkage panel"],
    [FILES.inbox, '<SelectCombobox', "searchable pay-from account adapter"],
    [FILES.scheduler, "No drivers are available for this operating company.", "scheduler honest empty"],
    [FILES.leaveRequests, '<EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver"', "leave-request driver reverse link"],
  ];
  const requiredWithoutReportingConnectivity = JSON.parse(originals[FILES.required]);
  const reportingLeaf = requiredWithoutReportingConnectivity.leaves.find((leaf) => leaf.id === "reporting");
  reportingLeaf.required = reportingLeaf.required.filter((column) => column !== "connectivity");
  const requiredMutationProblems = assertWiring((rel) =>
    rel === FILES.required ? JSON.stringify(requiredWithoutReportingConnectivity) : originals[rel]
  );
  if (!requiredMutationProblems.length) {
    throw new Error(`${LABEL}: selftest did not reject missing reporting Required connectivity`);
  }
  for (const [file, needle, label] of cases) {
    const mutated = originals[file].replaceAll(needle, "");
    if (mutated === originals[file]) throw new Error(`${LABEL}: inert selftest mutation for ${file}`);
    const problems = assertWiring((rel) => (rel === file ? mutated : originals[rel]));
    if (!problems.length) throw new Error(`${LABEL}: selftest did not reject missing ${label}`);
  }
  assertWiring((rel) => originals[rel]);
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
