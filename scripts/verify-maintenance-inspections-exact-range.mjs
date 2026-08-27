#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["unit","picker_law","qbo_chrome","connectivity"],"leaves":["inspections.create"],"task":"MAINT-F6876-INSPECTIONS-LIST-SILENT-200-CAP","vertical":"class-sweep"} */
import fs from "node:fs";

const files = {
  route: fs.readFileSync("apps/backend/src/maintenance/inspections.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/maintenance/inspections/InspectionsPage.tsx", "utf8"),
  test: fs.readFileSync("apps/backend/src/maintenance/__tests__/inspections.routes.test.ts", "utf8"),
};

const checks = [
  ["route", /limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\).*default\(50\)/, "bounded range schema"],
  ["route", /search: z\.string\(\)\.trim\(\)\.max\(120\)\.optional\(\)/, "bounded search schema"],
  ["route", /u\.unit_number ILIKE \$\$\{values\.length\}[\s\S]*i\.inspection_type::text ILIKE \$\$\{values\.length\}/, "canonical server search"],
  ["route", /SELECT count\(\*\)::int AS total_count[\s\S]*FROM maintenance\.inspections i[\s\S]*WHERE \$\{filters\.join\(" AND "\)\}/, "exact filtered total"],
  ["route", /LIMIT \$\$\{values\.length \+ 1\} OFFSET \$\$\{values\.length \+ 2\}/, "parameterized range"],
  ["route", /total_count: Number\(countRes\.rows\[0\]\?\.total_count \?\? 0\)/, "total response"],
  ["api", /params: \{ include_archived\?: boolean; unit_id\?: string; dvir_submission_id\?: string; search\?: string; limit\?: number; offset\?: number \}/, "typed range request"],
  ["api", /rows: MaintenanceInspectionRow\[\]; total_count: number/, "typed total response"],
  ["page", /queryKey: \["maintenance", "inspections", companyId, search, page\]/, "page-keyed query"],
  ["page", /offset: \(page - 1\) \* INSPECTIONS_PAGE_SIZE/, "server offset"],
  ["page", /aria-label="Search inspections"/, "mounted server search"],
  ["page", /suppressToolbarSearch/, "single search owner"],
  ["page", /data-testid="maintenance-inspections-server-pager"/, "mounted server pager"],
  ["page", /setPhotoFile\(null\);\s*setPage\(1\);\s*setSearch\(""\);/, "company reset"],
  ["test", /if \(sql\.includes\("count\(\*\)::int AS total_count"\)\) return \{ rows: \[\{ total_count: 251 \}\] \};/, "exact-total route test"],
];

function failures(source) {
  return checks.filter(([key, re]) => !re.test(source[key])).map(([, , label]) => label);
}

const failed = failures(files);
if (failed.length) {
  console.error(`FAIL verify-maintenance-inspections-exact-range: ${failed.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [key, re, label] of checks) {
    const mutant = { ...files, [key]: files[key].replace(re, "PLANTED_DEFECT") };
    if (!failures(mutant).includes(label)) {
      console.error(`FAIL selftest: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-maintenance-inspections-exact-range --selftest (${checks.length}/${checks.length} mutations killed)`);
} else {
  console.log(`PASS verify-maintenance-inspections-exact-range (${checks.length}/${checks.length} checks)`);
}
