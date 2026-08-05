#!/usr/bin/env node
/**
 * SAF-B29 (wave 2) — remaining Safety limit:200 entity pickers must search server-side.
 *
 * Wave 1 locked the SHARED DriverPickerWithCreate (verify-step 1679). Wave 2 locks the
 * highest-risk surfaces that still fetched a capped page with no `search` term and/or used
 * native <select> elements that could not type-ahead at all:
 *   - SafetyIncidentsClusterSurface (damage + trailer interchange cluster)
 *   - InternalFinesPage related-load picker
 *   - CargoClaimIntakeSurface Carmack intake pickers
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-picker-server-search";
const SELFTEST = process.argv.includes("--selftest");

/** Each check is a regex that MUST match the live file (post-fix shape). */
const CHECKS = [
  {
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    describe: "incidents cluster fleet query sends unitSearch",
    test: (s) =>
      /queryKey:\s*\["safety",\s*"incidents-fleet",\s*operatingCompanyId,\s*unitSearch\]/.test(s) &&
      /listUnits\([\s\S]*?search:\s*unitSearch\s*\|\|\s*undefined/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    // Wave-6: drawer load uses EntityPicker kind=load (server search in registry) — supersedes listLoads+loadSearch.
    describe: "incidents cluster drawer load uses EntityPicker kind=load",
    test: (s) =>
      /field-load_id[\s\S]*?EntityPicker[\s\S]*?kind=["']load["']/.test(s) ||
      (/EntityPicker[\s\S]*?kind=["']load["']/.test(s) && /field-load_id/.test(s)),
  },
  {
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    // Trailer stays Combobox+onSearch; unit/load are EntityPicker (internal server search).
    describe: "incidents cluster drawer unit EntityPicker + trailer onSearch",
    test: (s) =>
      (/field-unit_id[\s\S]*?EntityPicker[\s\S]*?kind=["']unit["']/.test(s) || /kind=["']unit["']/.test(s)) &&
      /onSearch=\{setUnitSearch\}/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    describe: "incidents cluster filters use EntityPicker (not capped roster select)",
    test: (s) => /EntityPicker[\s\S]*?kind="driver"/.test(s) && /EntityPicker[\s\S]*?kind="unit"/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx",
    describe: "incidents cluster has no native select pickers",
    test: (s) => !/<select\s/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
    // Wave-5: EntityPicker kind=load (server search) supersedes Combobox+listDispatchLoads+loadSearch.
    describe: "internal fines related-load uses EntityPicker kind=load",
    test: (s) =>
      /EntityPicker[\s\S]*?kind=["']load["']/.test(s) &&
      /related_load_uuid/.test(s) &&
      !/<select[\s\S]*?related_load/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    describe: "cargo intake driver uses EntityPicker kind=driver (server search)",
    test: (s) =>
      /EntityPicker[\s\S]*?kind=["']driver["']/.test(s) &&
      !/listDrivers\s*\(/.test(s) &&
      !/onSearch=\{setDriverSearch\}/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    describe: "cargo intake unit uses EntityPicker kind=unit (server search)",
    test: (s) =>
      /EntityPicker[\s\S]*?kind=["']unit["']/.test(s) &&
      !/listUnits\s*\(/.test(s) &&
      !/onSearch=\{setUnitSearch\}/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    describe: "cargo intake load uses EntityPicker kind=load (server search)",
    test: (s) =>
      /EntityPicker[\s\S]*?kind=["']load["']/.test(s) &&
      !/onSearch=\{setLoadSearch\}/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    describe: "cargo intake trailer uses EntityPicker kind=trailer (mdata.equipment)",
    test: (s) => /EntityPicker[\s\S]*?kind=["']trailer["']/.test(s),
  },
  {
    file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
    describe: "cargo intake has no native select pickers",
    test: (s) => !/<select\s/.test(s),
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertSafetyPickerServerSearch(sources) {
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
    const before = assertSafetyPickerServerSearch(live);
    const after = assertSafetyPickerServerSearch(mutated);
    if (before.length === 0 && after.length === 0) {
      failures.push(`${name}: mutation did not create a failure`);
      return;
    }
    if (!after.some((p) => p.includes(describe))) {
      failures.push(`${name}: expected failure mentioning "${describe}", got: ${after.join(" | ") || "none"}`);
    }
  };

  expectFail(
    "incidents-fleet-no-search",
    CHECKS[0].file,
    (s) => s.replace("search: unitSearch || undefined", "limit: 200"),
    "fleet query sends unitSearch"
  );
  expectFail(
    "internal-fines-no-entitypicker-load",
    CHECKS[5].file,
    (s) => s.replace(/kind=["']load["']/g, 'kind="driver"'),
    "related-load uses EntityPicker kind=load"
  );
  expectFail(
    "cargo-native-select",
    CHECKS[10].file,
    (s) => `${s}\n<select data-evil />`,
    "no native select pickers"
  );

  const liveProblems = assertSafetyPickerServerSearch(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertSafetyPickerServerSearch();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — SAF-B29 wave-2 pickers search server-side (incidents cluster, internal fines load, cargo intake)`);
