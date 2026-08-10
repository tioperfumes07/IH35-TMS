#!/usr/bin/env node
/**
 * PM-SCHEDULE-CREATE-FORM (0441-mod2-pm-schedule-hardcoded-create)
 *
 * Guards against the regression where PmSchedulePage "+ Create" posted a
 * hardcoded all-zero UUID unit_id with a fixed oil-change body and no form.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const paths = {
  page: path.join(ROOT, "apps/frontend/src/pages/maintenance/pm-schedule/PmSchedulePage.tsx"),
  routes: path.join(ROOT, "apps/backend/src/maintenance/pm-schedule.routes.ts"),
  api: path.join(ROOT, "apps/frontend/src/api/maintenance.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:pm-schedule-create-form FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const failures = [];
  const page = read(paths.page);
  const routes = read(paths.routes);
  const api = read(paths.api);
  const archDesign = read(paths.archDesign);

  // Exact regression: hardcoded create body with literal all-zero unit_id
  if (/unit_id:\s*["']00000000-0000-0000-0000-000000000000["']/.test(page)) {
    failures.push("PmSchedulePage must not hardcode unit_id to the all-zero UUID in the create payload");
  }
  // Hardcoded create body regression: mutate() with no form fields collected
  if (/createM\.mutate\(\s*\)/.test(page) || /createMutation\.mutate\(\s*\)/.test(page)) {
    failures.push("PmSchedulePage must not call create mutate() without a collected form body");
  }
  if (!page.includes("pm-schedule-create-form")) {
    failures.push("PmSchedulePage must expose create form (data-testid=pm-schedule-create-form)");
  }
  if (!page.includes("pm-schedule-unit")) {
    failures.push("PmSchedulePage create form must collect unit_id");
  }
  if (!page.includes("pm-schedule-pm-type")) {
    failures.push("PmSchedulePage create form must collect pm_type");
  }
  if (!page.includes("pm-schedule-interval-kind") || !page.includes("pm-schedule-interval-value")) {
    failures.push("PmSchedulePage create form must collect interval kind + value");
  }
  if (!page.includes("+ Create")) {
    failures.push("PmSchedulePage primary CTA must remain + Create");
  }
  if (/>\s*\+\s*New\s*</.test(page) || />\s*\+\s*Add\s*</.test(page)) {
    failures.push("PmSchedulePage must not use + New or + Add vocabulary");
  }
  if (!page.includes("EntityPicker") || !/kind=["']unit["']/.test(page)) {
    failures.push("PmSchedulePage create form must use EntityPicker kind=\"unit\" for unit_id");
  }
  if (!page.includes("createMaintenancePmSchedule")) {
    failures.push("PmSchedulePage must call createMaintenancePmSchedule");
  }
  if (!/listQ\.isError[\s\S]*?<ListErrorState[\s\S]*?listQ\.refetch\(\)/.test(page)) {
    failures.push("PmSchedulePage must expose a retryable list failure before empty copy");
  }
  if (!/setFormError\(userFacingApiError\(err,\s*"Failed to create PM schedule"\)\)/.test(page)) {
    failures.push("PmSchedulePage create failures must use userFacingApiError instead of raw error.message");
  }

  if (!api.includes("export function createMaintenancePmSchedule")) {
    failures.push("maintenance API must export createMaintenancePmSchedule");
  }

  if (!routes.includes("nil_uuid_not_allowed") && !routes.includes("NIL_UUID")) {
    failures.push("pm-schedule.routes create schema must reject the nil UUID");
  }
  if (!/unit_id:\s*realUuid/.test(routes) && !/refine\(\(id\)\s*=>\s*id\s*!==\s*NIL_UUID/.test(routes)) {
    failures.push("pm-schedule.routes createSchema.unit_id must refine away the nil UUID");
  }

  if (!archDesign.includes("verify:pm-schedule-create-form")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:pm-schedule-create-form");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:pm-schedule-create-form PASS");
}

main();
