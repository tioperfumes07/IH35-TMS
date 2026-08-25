#!/usr/bin/env node
/**
 * @matrix-built maintenance,safety,fleet
 * @matrix-cols unit,connectivity,reverse_link,picker_law
 * Block B30: inspection CRUD + unit/DVIR create path + labelled forward and server-filtered reverse.
 * Existing claimed verify-step: 62.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const REL = {
  migration: "db/migrations/0362_maint_inspections.sql",
  routes: "apps/backend/src/maintenance/inspections.routes.ts",
  routesTest: "apps/backend/src/maintenance/__tests__/inspections.routes.test.ts",
  page: "apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx",
  pageTest: "apps/frontend/src/pages/maintenance/__tests__/InspectionsPage.test.tsx",
  maintenanceApi: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/components/maintenance/DvirMaintenanceInspectionsReverseSection.tsx",
  dvirDetail: "apps/frontend/src/pages/safety/IdvrDetailPage.tsx",
  assetReverse: "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
  archDesign: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
};

function read(root, rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

export function collectProblems(root = ROOT) {
  const failures = [];
  const sources = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, read(root, rel)]));
  for (const [key, source] of Object.entries(sources)) if (source === null) failures.push(`missing ${REL[key]}`);
  if (failures.length) return failures;

  const { migration, routes, routesTest, page, pageTest, maintenanceApi, reverse, dvirDetail, assetReverse, entityLink, archDesign } = sources;
  if (!migration.includes("CREATE TABLE IF NOT EXISTS maintenance.inspections") || !migration.includes("dvir_submission_id")) {
    failures.push("migration must create maintenance.inspections with its DVIR FK");
  }
  if (routes.includes("maintenance.dot_inspection_events") || !routes.includes("ARCHIVE-not-DELETE")) {
    failures.push("routes must use the canonical archive-not-delete maintenance.inspections table");
  }
  for (const route of [
    'app.patch("/api/v1/maintenance/inspections/:id"',
    'app.post("/api/v1/maintenance/inspections/:id/archive"',
    'app.post("/api/v1/maintenance/inspections/:id/photos"',
  ]) if (!routes.includes(route)) failures.push(`missing route ${route}`);
  if ((routesTest.match(/\bit\(/g) ?? []).length < 4 || (pageTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("focused inspection route/page test coverage regressed");
  }

  if (!/dvir_submission_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    failures.push("inspection list/create contracts must accept the canonical DVIR FK");
  }
  if (!/LEFT JOIN safety\.dvir_submissions ds ON ds\.id = i\.dvir_submission_id\s+AND ds\.operating_company_id = i\.operating_company_id/.test(routes)) {
    failures.push("DVIR label join must be explicitly entity-scoped to the inspection company");
  }
  if (!/filters\.push\(`i\.dvir_submission_id = \$\$\{values\.length\}::uuid`\)/.test(routes)) {
    failures.push("inspection reverse route must filter server-side by dvir_submission_id");
  }
  if (!/JOIN docs\.files f ON f\.id = ip\.docs_file_id\s+AND f\.operating_company_id = \$2::uuid/.test(routes)) {
    failures.push("inspection photo label join must be scoped to the requested company");
  }
  if (!/INSERT INTO maintenance\.inspections[\s\S]*dvir_submission_id/.test(routes) || !/FROM safety\.dvir_submissions[\s\S]*operating_company_id/.test(routes)) {
    failures.push("create writer must validate and persist dvir_submission_id");
  }

  if (!page.includes("maint-inspections-page") || !page.includes("+ Create Inspection") || !page.includes("requestUploadUrl")) {
    failures.push("inspection create/photo surface regressed");
  }
  if (!/<Combobox[\s\S]*?id="maintenance-inspection-dvir-picker"/.test(page) || /<select[\s\S]*?value=\{draft\.dvir_submission_id\}/.test(page)) {
    failures.push("inspection creator must use the searchable DVIR picker, never a UUID select");
  }
  if (!/<EntityLink[\s\S]*?kind="dvir"[\s\S]*?id=\{row\.dvir_submission_id\}/.test(page)) {
    failures.push("inspection list must drill to the linked DVIR with its resolved label");
  }
  if (!/inspection_id/.test(page) || !/rowClassName/.test(page)) {
    failures.push("inspection list must honor maintenance_inspection deep links");
  }
  if (!/dvir_submission_id\?: string/.test(maintenanceApi) || !/q\.set\("dvir_submission_id", params\.dvir_submission_id\)/.test(maintenanceApi)) {
    failures.push("maintenance API client must forward the server-side DVIR reverse filter");
  }
  if (!/listMaintenanceInspections\(operatingCompanyId, \{ dvir_submission_id: dvirSubmissionId \}\)/.test(reverse)) {
    failures.push("DVIR reverse section must query inspections by the exact FK");
  }
  if (!/<EntityLink[\s\S]*?kind="maintenance_inspection"/.test(reverse)) {
    failures.push("DVIR reverse rows must drill to the exact inspection");
  }
  if (!/<ListErrorState[\s\S]*?Could not load linked maintenance inspections\.[\s\S]*?onRetry=\{\(\) => void query\.refetch\(\)\}/.test(reverse)) {
    failures.push("DVIR reverse read failure must expose an exact-query retry");
  }
  if (!/<DvirMaintenanceInspectionsReverseSection[\s\S]*?dvirSubmissionId=\{id\}/.test(dvirDetail)) {
    failures.push("DVIR detail must mount maintenance inspection reverse history");
  }
  if (!/<EntityLink[\s\S]*?kind="dvir"[\s\S]*?id=\{s\(dvir\.id\)/.test(assetReverse)) {
    failures.push("asset safety reverse DVIR rows must use the real detail route");
  }
  if (!/case "dvir":\s+return `\/safety\/idvr\/\$\{id\}`/.test(entityLink) ||
      !/case "maintenance_inspection":\s+return `\/maintenance\/inspections\?inspection_id=\$\{id\}`/.test(entityLink)) {
    failures.push("shared EntityLink must resolve both sides of inspection↔DVIR");
  }
  if (!archDesign.includes("verify:maint-inspections-crud")) failures.push("architecture must retain the claimed guard");
  return failures;
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) return baseline;
  const temp = fs.mkdtempSync(path.join(ROOT, ".tmp-maint-dvir-link-"));
  try {
    for (const rel of Object.values(REL)) {
      const target = path.join(temp, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), target);
    }
    const mutations = [
      [REL.routes, "AND ds.operating_company_id = i.operating_company_id", "AND TRUE"],
      [REL.routes, 'filters.push(`i.dvir_submission_id = $${values.length}::uuid`)', 'filters.push("TRUE")'],
      [REL.routes, "AND f.operating_company_id = $2::uuid", "AND TRUE"],
      [REL.page, 'kind="dvir"', 'kind="unit"'],
      [REL.maintenanceApi, 'q.set("dvir_submission_id", params.dvir_submission_id)', 'q.set("ignored", params.dvir_submission_id)'],
      [REL.reverse, "dvir_submission_id: dvirSubmissionId", "unit_id: dvirSubmissionId"],
      [REL.reverse, "onRetry={() => void query.refetch()}", "onRetry={() => undefined}"],
      [REL.dvirDetail, "<DvirMaintenanceInspectionsReverseSection", "<MissingReverseSection"],
      [REL.entityLink, 'case "dvir":', 'case "disabled_dvir":'],
    ];
    for (const [rel, before, after] of mutations) {
      const target = path.join(temp, rel);
      const original = fs.readFileSync(target, "utf8");
      if (!original.includes(before)) return [`selftest fixture drift: ${rel} missing ${before}`];
      fs.writeFileSync(target, original.replace(before, after));
      if (!collectProblems(temp).length) return [`mutation survived: ${rel} ${before}`];
      fs.writeFileSync(target, original);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return [];
}

const failures = process.argv.includes("--selftest") ? selftest() : collectProblems();
if (failures.length) {
  console.error("verify:maint-inspections-crud FAIL:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`verify:maint-inspections-crud PASS${process.argv.includes("--selftest") ? " — 9/9 mutations killed" : ""}`);
