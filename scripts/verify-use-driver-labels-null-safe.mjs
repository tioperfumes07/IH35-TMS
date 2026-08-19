#!/usr/bin/env node
/**
 * verify-use-driver-labels-null-safe
 * SAF-DRIVER-LABELS-NULL-ROW — useDriverLabels must filter null/undefined label rows before row.id.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-use-driver-labels-null-safe";
const TARGET = "apps/frontend/src/hooks/useDriverLabels.ts";

function assertSrc(src) {
  const errors = [];
  if (!src.includes("useDriverLabels")) errors.push("must export useDriverLabels");
  if (!/\.filter\(\(row\).*row\?\.id/.test(src) && !/filter\(\(row\): row is[\s\S]*row\?\.id/.test(src)) {
    errors.push("must filter label rows with row?.id before Map");
  }
  if (/new Map\(\(query\.data\?\.labels \?\? \[\]\)\.map\(\(row\) => \[row\.id/.test(src)) {
    errors.push("must not map row.id without null filter");
  }
  return errors;
}

function selftest() {
  const bad = `export function useDriverLabels() {
  const byId = useMemo(() => new Map((query.data?.labels ?? []).map((row) => [row.id, row.label])), [query.data?.labels]);
}`;
  const good = `export function useDriverLabels() {
  const byId = useMemo(
    () => new Map((query.data?.labels ?? []).filter((row) => Boolean(row?.id)).map((row) => [row.id, row.label])),
    [query.data?.labels],
  );
}`;
  if (assertSrc(bad).length === 0 || assertSrc(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertSrc(bad), good: assertSrc(good) });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertSrc(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — useDriverLabels null-safe`);
