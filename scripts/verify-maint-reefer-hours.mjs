#!/usr/bin/env node
/**
 * Block A19: Reefer hours separate tracking.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0366_maint_reefer_hours.sql"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/reefer-hours.routes.ts"),
  routesTest: path.join(ROOT, "apps/backend/src/maintenance/__tests__/reefer-hours.routes.test.ts"),
  section: path.join(ROOT, "apps/frontend/src/components/trailer-profile/TrailerReeferSection.tsx"),
  sectionTest: path.join(ROOT, "apps/frontend/src/components/trailer-profile/__tests__/TrailerReeferSection.test.tsx"),
  maintenanceApi: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  trailerPage: path.join(ROOT, "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-reefer-hours FAIL: ${msg}`);
  process.exit(1);
}

function reeferWriteFailureProblems(section) {
  const failures = [];
  if (!/manualError[\s\S]{0,220}?userFacingApiError\(manualError,\s*["']Could not record reefer hours["']\)/.test(section)) {
    failures.push("manual reefer-hours rejection must preserve backend detail");
  }
  if (!/serviceError[\s\S]{0,220}?userFacingApiError\(serviceError,\s*["']Could not mark reefer service["']\)/.test(section)) {
    failures.push("mark-service rejection must preserve backend detail");
  }
  if ((section.match(/role=["']alert["']/g) ?? []).length < 2) {
    failures.push("both reefer writes must expose accessible failure alerts");
  }
  return failures;
}

function reeferWriteLifecycleProblems(section) {
  const failures = [];
  if (!/mutationFn:\s*\(input:\s*\{ companyId: string; trailerId: string; generation: number; hoursReading: number; notes: string \}\)[\s\S]{0,260}operating_company_id: input\.companyId,[\s\S]{0,100}equipment_id: input\.trailerId,[\s\S]{0,100}hours_reading: input\.hoursReading,[\s\S]{0,80}notes: input\.notes/.test(section)) failures.push("manual entry snapshots company trailer generation hours and notes");
  if (!/mutationFn:\s*\(input:\s*\{ companyId: string; trailerId: string; generation: number; lastServiceHours: number; lastServiceDate: string \}\)[\s\S]{0,260}operating_company_id: input\.companyId,[\s\S]{0,100}equipment_id: input\.trailerId,[\s\S]{0,100}last_service_hours: input\.lastServiceHours,[\s\S]{0,80}last_service_date: input\.lastServiceDate/.test(section)) failures.push("mark service snapshots company trailer generation hours and date");
  if ((section.match(/queryKey:\s*\["reefer-hours-snapshot", input\.trailerId, input\.companyId\]/g) ?? []).length !== 2) failures.push("both writes invalidate submitted trailer company cache");
  if (!/actionGenerationRef\.current \+= 1;[\s\S]{0,180}setHoursInput\(""\);[\s\S]{0,100}setNotesInput\(""\);[\s\S]{0,160}manualMut\.reset\(\);[\s\S]{0,80}serviceMut\.reset\(\);[\s\S]{0,80}\[companyId, trailerId\]/.test(section)) failures.push("scope change retires actions and resets complete draft state");
  if ((section.match(/input\.generation === actionGenerationRef\.current/g) ?? []).length !== 3) failures.push("manual success and both errors reject stale completion state");
  if (!/manualMut\.mutate\(\{\s*companyId,\s*trailerId,\s*generation: actionGenerationRef\.current,\s*hoursReading: Number\(hoursInput\),\s*notes: notesInput/.test(section)) failures.push("manual click snapshots visible intent");
  if (!/serviceMut\.mutate\(\{\s*companyId,\s*trailerId,\s*generation: actionGenerationRef\.current,\s*lastServiceHours: specs\.current_hours,\s*lastServiceDate:/.test(section)) failures.push("mark-service click snapshots visible intent");
  return failures;
}

function main() {
  const failures = [];
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const routesTest = read(paths.routesTest);
  const section = read(paths.section);
  const sectionTest = read(paths.sectionTest);
  const maintenanceApi = read(paths.maintenanceApi);
  const trailerPage = read(paths.trailerPage);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);

  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.reefer_hours_log")) {
    failures.push("migration must create maintenance.reefer_hours_log");
  }
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.reefer_specs")) {
    failures.push("migration must create maintenance.reefer_specs");
  }
  if (!migration.includes("0364 reserved for B35")) {
    failures.push("migration must document 0366 slot after 0364 B35 reservation");
  }
  if (!migration.includes("ENABLE ROW LEVEL SECURITY")) {
    failures.push("migration must enable RLS");
  }

  if (!routes.includes("ARCHIVE-not-DELETE")) failures.push("routes must document ARCHIVE-not-DELETE");
  if (!routes.includes("ingestReeferHoursFromSamsaraForCompany")) {
    failures.push("routes must export Samsara ingest helper");
  }
  if (!routes.includes("evaluateReeferHoursPmSchedulesForCompany")) {
    failures.push("routes must evaluate hours-based PM due for B28 integration");
  }
  if (!routes.includes('app.get("/api/v1/maintenance/reefer-hours/snapshot"')) {
    failures.push("routes must expose snapshot endpoint");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/reefer-hours/log"')) {
    failures.push("routes must expose manual log create");
  }
  if (!routes.includes('app.post("/api/v1/maintenance/reefer-hours/ingest-samsara"')) {
    failures.push("routes must expose Samsara ingest endpoint");
  }
  if ((routesTest.match(/\bit\(/g) ?? []).length < 5) {
    failures.push("reefer-hours.routes.test must include at least 5 vitest cases");
  }

  if (section.includes("Coming with A19")) failures.push("TrailerReeferSection stub must be replaced");
  if (!section.includes("Reefer hours tracking")) failures.push("TrailerReeferSection must show live heading");
  if (!section.includes("reefer-hours-history")) failures.push("TrailerReeferSection must show history table");
  if (!section.includes("Record hours")) failures.push("TrailerReeferSection must support manual entry");
  failures.push(...reeferWriteFailureProblems(section));
  failures.push(...reeferWriteLifecycleProblems(section));
  if ((sectionTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("TrailerReeferSection.test must include at least 3 vitest cases");
  }

  if (!maintenanceApi.includes("fetchMaintenanceReeferHoursSnapshot")) {
    failures.push("maintenance API must expose fetchMaintenanceReeferHoursSnapshot");
  }
  if (!maintenanceApi.includes("createMaintenanceReeferHoursLogEntry")) {
    failures.push("maintenance API must expose createMaintenanceReeferHoursLogEntry");
  }
  if (!trailerPage.includes("companyId={companyId}")) {
    failures.push("TrailerProfilePage must pass companyId to TrailerReeferSection");
  }
  if (!index.includes("registerMaintenanceReeferHoursRoutes")) {
    failures.push("backend index must register reefer hours routes");
  }
  if (!archDesign.includes("verify:maint-reefer-hours")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-reefer-hours");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-reefer-hours PASS");
}

if (process.argv.includes("--selftest")) {
  const section = read(paths.section);
  const mutations = [
    section.replace(/\{manualError \?/, "{false ?"),
    section.replace(/\{serviceError \?/, "{false ?"),
    section.replace(/role="alert"/, 'role="status"'),
    section.replace(/userFacingApiError\(manualError,\s*"Could not record reefer hours"\)/, '"Could not record reefer hours"'),
    section.replace(/userFacingApiError\(serviceError,\s*"Could not mark reefer service"\)/, '"Could not mark reefer service"'),
    section.replace("operating_company_id: input.companyId", "operating_company_id: companyId"),
    section.replace("last_service_hours: input.lastServiceHours", "last_service_hours: specs.current_hours"),
    section.replace('["reefer-hours-snapshot", input.trailerId, input.companyId]', '["reefer-hours-snapshot", trailerId, companyId]'),
    section.replace("actionGenerationRef.current += 1;", "void actionGenerationRef.current;"),
    section.replace("input.generation === actionGenerationRef.current", "true"),
    section.replace("hoursReading: Number(hoursInput),", "hoursReading: 0,"),
  ];
  const escaped = mutations.filter((mutation) => [...reeferWriteFailureProblems(mutation), ...reeferWriteLifecycleProblems(mutation)].length === 0);
  if (escaped.length) fail(`--selftest: ${escaped.length}/${mutations.length} reefer write-failure mutations escaped`);
  console.log(`verify:maint-reefer-hours SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

main();
