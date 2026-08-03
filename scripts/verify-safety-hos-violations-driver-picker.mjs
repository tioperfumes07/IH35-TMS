#!/usr/bin/env node
/**
 * GUARD: HOS Violations creators use DriverPickerWithCreate — never raw driver_id UUID text (SAF-F14 / S-A07).
 *
 * Root cause locked: operators were expected to hand-type a driver uuid into placeholder="driver_id".
 * Fix already on main (#3340, #4057); this guard prevents regression on both intake surfaces:
 *   - HOSViolationsTab inline creator
 *   - HosViolationCreateModal (HoursOfServicePage drawer)
 *
 * Picker law: operatingCompanyId scopes roster; DriverPickerWithCreate inherits server search (SAF-B29).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-hos-violations-driver-picker";
const SELFTEST = process.argv.includes("--selftest");

const SURFACES = [
  {
    rel: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
    pickerTestId: "hos-violation-driver-picker",
  },
  {
    rel: "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx",
    pickerTestId: "hos-violation-create-modal",
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function collectProblems(sources) {
  const problems = [];
  for (const { rel, pickerTestId } of SURFACES) {
    const code = stripComments(sources?.[rel] ?? read(rel));

    if (new RegExp(`placeholder=["']driver_id["']`).test(code)) {
      problems.push(`${rel}: raw placeholder="driver_id" text input — use DriverPickerWithCreate.`);
    }

    if (!code.includes("DriverPickerWithCreate")) {
      problems.push(`${rel}: must use DriverPickerWithCreate for the driver reference field.`);
    }

    const pickerBlock = code.match(/<DriverPickerWithCreate[\s\S]*?\/>/)?.[0] ?? "";
    if (!pickerBlock.includes("operatingCompanyId=")) {
      problems.push(`${rel}: DriverPickerWithCreate must pass operatingCompanyId for entity scope.`);
    }

    if (!code.includes(`data-testid="${pickerTestId}"`)) {
      problems.push(`${rel}: missing data-testid="${pickerTestId}" on the picker surface.`);
    }

    // Block a bare text input wired to driver_id in the create form (not table column keys).
    if (
      /<input\b[^>]*\bvalue=\{form\.driver_id\b/.test(code) ||
      /<input\b[^>]*\bonChange=\{[^}]*driver_id/.test(code)
    ) {
      problems.push(`${rel}: driver_id is still bound to a raw <input> — use DriverPickerWithCreate.`);
    }
  }

  // Shared picker must keep server search so rosters >200 remain reachable (SAF-B29).
  const sharedRel = "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx";
  const shared = stripComments(sources?.[sharedRel] ?? read(sharedRel));
  if (!/driverSearch/.test(shared) || !/search:\s*driverSearch/.test(shared)) {
    problems.push(`${sharedRel}: must pass search: driverSearch to listDrivers (server search).`);
  }
  if (!/onSearch=\{setDriverSearch\}/.test(shared)) {
    problems.push(`${sharedRel}: Combobox must wire onSearch={setDriverSearch}.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(SURFACES.map((s) => [s.rel, read(s.rel)]));
  live["apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx"] = read(
    "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx"
  );
  const failures = [];

  const expectCaught = (name, mutated, needle) => {
    const problems = collectProblems(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  const tab = SURFACES[0].rel;
  expectCaught(
    "raw-placeholder",
    { ...live, [tab]: live[tab].replace("<DriverPickerWithCreate", '<input placeholder="driver_id" /><DriverPickerWithCreate') },
    'placeholder="driver_id"'
  );
  expectCaught(
    "picker-removed",
    { ...live, [tab]: live[tab].replace(/DriverPickerWithCreate/g, "PlainSelect") },
    "must use DriverPickerWithCreate"
  );
  expectCaught(
    "scope-removed",
    {
      ...live,
      [tab]: live[tab].replace(
        /<DriverPickerWithCreate[\s\S]*?\/>/,
        "<DriverPickerWithCreate value={form.driver_id || null} onChange={() => {}} />"
      ),
    },
    "operatingCompanyId for entity scope"
  );
  expectCaught(
    "server-search-removed",
    {
      ...live,
      "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx": live[
        "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx"
      ].replace(/search:\s*driverSearch \|\| undefined/g, "limit: 200"),
    },
    "search: driverSearch"
  );

  const liveProblems = collectProblems(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources green`);
  process.exit(0);
}

const problems = collectProblems();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — HOS Violations creators use scoped DriverPickerWithCreate (server search)`);
