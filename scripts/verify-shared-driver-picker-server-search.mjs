#!/usr/bin/env node
/**
 * SAF-B29 — the SHARED driver picker must search server-side.
 *
 * DriverPickerWithCreate hardcoded `search: ""` with `limit: 200`. Because it is the shared picker,
 * that silent truncation was reproduced on all 23 surfaces that use it: past 200 active drivers the
 * rest were unselectable and nothing on screen said so. A dispatcher would simply not find a driver
 * and conclude the driver did not exist.
 *
 * This guard locks the shared component specifically, because that is where the leverage is — one
 * regression here silently re-breaks 23 surfaces at once. It asserts three things that must all hold
 * together: the typed term is state, it reaches the server, and it is part of the react-query key
 * (without the key, the term changes and the cached first page is served forever — the bug would
 * look fixed in code and still be broken at runtime).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const PICKER = join(ROOT, "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx");

const CHECKS = [
  {
    id: "term-is-state",
    describe: "the typed term must be component state",
    test: (s) => /const \[driverSearch, setDriverSearch\] = useState/.test(s),
  },
  {
    id: "term-reaches-server",
    describe: "the term must be sent to listDrivers as `search`, not hardcoded empty",
    test: (s) => /search:\s*driverSearch \|\| undefined/.test(s) && !/search:\s*""/.test(s),
  },
  {
    id: "term-in-query-key",
    describe:
      "the term must be part of the react-query key — otherwise the cached first page is served " +
      "forever and the fix is real in source but dead at runtime",
    test: (s) => /queryKey:\s*\["driver-picker-with-create",\s*operatingCompanyId,\s*driverSearch\]/.test(s),
  },
  {
    id: "combobox-reports-typing",
    describe: "the Combobox must report typing back via onSearch",
    test: (s) => /onSearch=\{setDriverSearch\}/.test(s),
  },
];

/** Strip comments first: a guard that reads prose flags its own explanatory comment as the defect. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

export function run() {
  const src = stripComments(readFileSync(PICKER, "utf8"));
  const failed = CHECKS.filter((c) => !c.test(src));
  const ok = failed.length === 0;
  return {
    ok,
    total: CHECKS.length,
    failed: failed.map((f) => f.id),
    message: ok
      ? `PASS: all ${CHECKS.length} of ${CHECKS.length} server-search requirements hold on the shared driver picker.`
      : `FAIL (${failed.length} of ${CHECKS.length}):\n  - ${failed.map((f) => `${f.describe} (${f.id})`).join("\n  - ")}`,
  };
}

function selftest() {
  const { writeFileSync } = fs;
  const original = readFileSync(PICKER, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.message}`);
    process.exit(1);
  }
  const cases = [
    { name: "term dropped from the query key (cache serves page 1 forever)", find: ", driverSearch]", replace: "]", expect: "term-in-query-key" },
    { name: "search hardcoded empty again", find: "search: driverSearch || undefined", replace: 'search: ""', expect: "term-reaches-server" },
    { name: "Combobox stops reporting typing", find: "onSearch={setDriverSearch}", replace: "", expect: "combobox-reports-typing" },
  ];
  for (const c of cases) {
    if (!original.includes(c.find)) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found — mutation would be a no-op.`);
      process.exit(1);
    }
    let caught;
    try {
      writeFileSync(PICKER, original.replace(c.find, c.replace), "utf8");
      caught = run();
    } finally {
      writeFileSync(PICKER, original, "utf8");
    }
    if (caught.ok || !caught.failed.includes(c.expect)) {
      console.error(`SELFTEST FAIL: "${c.name}" not caught.\n${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }
  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: all ${cases.length} planted defects caught, restore green.`);
}

import * as fs from "node:fs";

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
