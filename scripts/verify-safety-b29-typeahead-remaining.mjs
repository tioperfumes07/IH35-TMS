#!/usr/bin/env node
/**
 * SAF-B29 (wave 3) — remaining Safety limit:200 driver surfaces must search server-side
 * or stop bulk-fetching capped rosters.
 *
 * Wave 1 locked DriverPickerWithCreate (verify-step 1679). Wave 2 (unmerged sibling branch)
 * targets incidents cluster / cargo / internal fines — intentionally OUT OF SCOPE here so #4065
 * can land without conflict. Wave 3 locks the highest-leverage roster surfaces still calling
 * listDrivers with limit:200 and no search term:
 *   - ComplaintsTab (table labels → EntityLink; create already uses DriverPickerWithCreate)
 *   - TrainingProgramsPage + SafetyMeetingsPage assign/create rosters
 *   - TrainingRecordsPage table labels (create uses DriverPickerWithCreate)
 *   - HoursOfServicePage fleet dashboard
 *   - EldAuditTrailViewer (native select → DriverPickerWithCreate)
 *   - DrugAlcoholTab bulk roster (count-only query, no 200-cap page fetch)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-b29-typeahead-remaining";
const SELFTEST = process.argv.includes("--selftest");

const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    describe: "complaints tab does not bulk-fetch capped driver roster",
    test: (s) => !/listDrivers\(/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    describe: "complaints respondent column uses EntityLink",
    test: (s) => /<EntityLink\s+kind=["']driver["']/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    describe: "training programs driver roster sends driverSearch",
    test: (s) =>
      (/EntityPicker/.test(s) && /kind=["']driver["']/.test(s)) ||
      (/queryKey:\s*\["mdata",\s*"drivers",\s*operatingCompanyId,\s*driverSearch\]/.test(s) &&
        /listDrivers\([\s\S]*?search:\s*driverSearch\s*\|\|\s*undefined/.test(s)),
  },
  {
    file: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    describe: "training programs assign modal exposes driver search input",
    test: (s) => /data-testid="training-program-driver-search"/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    describe: "safety meetings driver roster sends driverSearch",
    test: (s) =>
      (/EntityPicker/.test(s) && /kind=["']driver["']/.test(s)) ||
      (/queryKey:\s*\["mdata",\s*"drivers",\s*operatingCompanyId,\s*driverSearch\]/.test(s) &&
        /listDrivers\([\s\S]*?search:\s*driverSearch\s*\|\|\s*undefined/.test(s)),
  },
  {
    file: "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
    describe: "safety meetings create modal exposes driver search input",
    test: (s) => /data-testid="safety-meeting-driver-search"/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
    describe: "training records table does not bulk-fetch capped driver roster",
    test: (s) => !/listDrivers\(/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx",
    describe: "training records driver column uses EntityLink",
    test: (s) => /<EntityLink\s+kind=["']driver["']/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    describe: "HOS fleet loader sends fleetSearch to listDrivers",
    test: (s) =>
      /loadFleetHosRows\([\s\S]*?fleetSearch/.test(s) &&
      /listAllDrivers\([\s\S]*?search:\s*fleetSearch\s*\|\|\s*undefined/.test(s) &&
      /queryKey:\s*\["safety",\s*"hos-dashboard",\s*operatingCompanyId,\s*fleetSearch\]/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
    describe: "HOS fleet table exposes search input",
    test: (s) => /data-testid="safety-hos-fleet-search"/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx",
    describe: "ELD audit driver control uses DriverPickerWithCreate",
    test: (s) => /<DriverPickerWithCreate/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx",
    describe: "ELD audit has no native select driver picker",
    test: (s) => !/<select\s/.test(s) && !/listDrivers\([\s\S]*?limit:\s*200/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    describe: "drug/alcohol tab does not bulk-fetch limit:200 driver page",
    test: (s) => !/limit:\s*200/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    describe: "drug/alcohol selected driver uses EntityLink",
    test: (s) => /<EntityLink\s+kind=["']driver["']/.test(s),
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertSafetyB29TypeaheadRemaining(sources) {
  const problems = [];
  const byFile = new Map();
  for (const check of CHECKS) {
    if (!byFile.has(check.file)) {
      byFile.set(check.file, stripComments(sources?.[check.file] ?? read(check.file)));
    }
    const src = byFile.get(check.file);
    if (!check.test(src)) problems.push(`${check.file}: ${check.describe}`);
  }
  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries([...new Set(CHECKS.map((c) => c.file))].map((f) => [f, read(f)]));
  const failures = [];
  const expectFail = (name, file, mutate, describe) => {
    const mutated = { ...live, [file]: mutate(live[file]) };
    if (mutated[file] === live[file]) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const after = assertSafetyB29TypeaheadRemaining(mutated);
    if (!after.some((p) => p.includes(describe))) {
      failures.push(`${name}: expected failure mentioning "${describe}", got: ${after.join(" | ") || "none"}`);
    }
  };

  expectFail(
    "training-programs-no-search",
    "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
    (s) =>
      s
        .replace(/kind=["']driver["']/g, 'kind="unit"')
        .replace("search: driverSearch || undefined", ""),
    "driver roster sends driverSearch"
  );
  expectFail(
    "complaints-bulk-roster",
    "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    (s) => `${s}\nlistDrivers({ limit: 200 })`,
    "does not bulk-fetch capped driver roster"
  );
  expectFail(
    "eld-native-select",
    "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx",
    (s) => `${s}\n<select />`,
    "no native select driver picker"
  );

  const liveProblems = assertSafetyB29TypeaheadRemaining(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyB29TypeaheadRemaining();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — SAF-B29 wave-3 remaining Safety driver rosters search server-side or use EntityLink/DriverPickerWithCreate`);
