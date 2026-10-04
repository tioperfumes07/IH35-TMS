#!/usr/bin/env node
/**
 * SAF-B29 — the SHARED driver picker must search server-side.
 *
 * EP-DRIVER-KIND-SWEEP §9.0 item 17: DriverPickerWithCreate is a thin EntityPicker kind=driver
 * wrapper — server search is enforced on EntityPicker + entityPickerRegistry (verify-step 1683).
 * This guard locks the wrapper delegates to EntityPicker (one regression re-breaks all call sites).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PICKER = join(ROOT, "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx");
const REGISTRY = join(ROOT, "apps/frontend/src/components/parity/entityPickerRegistry.ts");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const WRAPPER_CHECKS = [
  {
    id: "delegates-entity-picker",
    describe: "DriverPickerWithCreate must delegate to EntityPicker kind=driver",
    test: (s) => /EntityPicker[\s\S]{0,200}kind=["']driver["']/.test(s),
  },
  {
    id: "no-local-listDrivers",
    describe: "wrapper must not host its own listDrivers roster (silent truncation class)",
    test: (s) => !/\blistDrivers\s*\(/.test(s),
  },
];

const REGISTRY_CHECKS = [
  {
    id: "driver-server-search-flag",
    describe: "driver kind must declare serverSearch: true in registry",
    test: (s) => /driver:[\s\S]{0,800}serverSearch:\s*true/.test(s),
  },
  {
    id: "driver-search-param",
    describe: "driver list must pass search opt to listDrivers",
    test: (s) => /search:\s*opts\?\.search/.test(s),
  },
];

// overrides: {picker, registry} planted text for --selftest (no file is written).
export function run(overrides = {}) {
  const pickerSrc = stripComments(overrides.picker ?? readFileSync(PICKER, "utf8"));
  const registrySrc = stripComments(overrides.registry ?? readFileSync(REGISTRY, "utf8"));
  const failed = [
    ...WRAPPER_CHECKS.filter((c) => !c.test(pickerSrc)),
    ...REGISTRY_CHECKS.filter((c) => !c.test(registrySrc)),
  ];
  const ok = failed.length === 0;
  return {
    ok,
    total: WRAPPER_CHECKS.length + REGISTRY_CHECKS.length,
    failed: failed.map((f) => f.id),
    message: ok
      ? `PASS: shared driver picker delegates to EntityPicker with server-side search (${WRAPPER_CHECKS.length + REGISTRY_CHECKS.length} checks).`
      : `FAIL (${failed.length}):\n  - ${failed.map((f) => `${f.describe} (${f.id})`).join("\n  - ")}`,
  };
}

function selftest() {
  const originalPicker = readFileSync(PICKER, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  const cases = [
    {
      name: "wrapper stops delegating to EntityPicker",
      planted: `export function DriverPickerWithCreate() { return null; }`,
      expect: "delegates-entity-picker",
    },
    {
      name: "wrapper reintroduces local listDrivers",
      planted: originalPicker.replace(
        "kind=\"driver\"",
        'kind="driver"\nlistDrivers({ operating_company_id: operatingCompanyId, limit: 200 })'
      ),
      expect: "no-local-listDrivers",
    },
  ];
  for (const c of cases) {
    // Plants go into the in-memory string passed to run(); no tracked file is written.
    const caught = run({ picker: c.planted });
    if (caught.ok || !caught.failed.includes(c.expect)) {
      console.error(`SELFTEST FAIL: "${c.name}" not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }
  console.log(`SELFTEST PASS: all ${cases.length} planted defects caught.`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
