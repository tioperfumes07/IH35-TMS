#!/usr/bin/env node
/**
 * DISPATCH-MILES-GET — GET /dispatch/loads/:id must project miles_* from mdata.loads.
 *
 * Book POST writes miles_shortest / miles_practical / loaded_miles onto mdata.loads, but
 * views.dispatch_load_with_driver_status has no mile columns, so SELECT l.* never returned them
 * and Edit/detail round-trip showed blank miles after a successful book (Cascade create-depth).
 *
 * Same pattern as trip_type (project via LEFT JOIN mdata.loads ml).
 *
 *   node scripts/verify-dispatch-load-get-projects-miles.mjs [--selftest]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-dispatch-load-get-projects-miles";
const TARGET = "apps/backend/src/dispatch/loads.routes.ts";

function check(src) {
  const problems = [];
  if (!/ml\.miles_shortest\s+AS\s+miles_shortest/.test(src)) {
    problems.push(`${TARGET}: GET detail SQL must project ml.miles_shortest AS miles_shortest`);
  }
  if (!/ml\.miles_practical\s+AS\s+miles_practical/.test(src)) {
    problems.push(`${TARGET}: GET detail SQL must project ml.miles_practical AS miles_practical`);
  }
  if (!/ml\.loaded_miles\s+AS\s+loaded_miles/.test(src)) {
    problems.push(`${TARGET}: GET detail SQL must project ml.loaded_miles AS loaded_miles`);
  }
  // Must be the detail SELECT that joins ml (trip_type pattern), not a random miles mention.
  if (!/ml\.trip_type\s+AS\s+trip_type[\s\S]{0,800}?ml\.miles_shortest\s+AS\s+miles_shortest/.test(src)) {
    problems.push(
      `${TARGET}: miles_* projections must sit next to ml.trip_type on the GET detail SELECT (ml join path)`,
    );
  }
  return problems;
}

function main() {
  const src = readFileSync(path.join(ROOT, TARGET), "utf8");
  if (SELFTEST) {
    const dir = mkdtempSync(path.join(tmpdir(), "miles-get-"));
    try {
      const broken = src
        .replace(/ml\.miles_shortest\s+AS\s+miles_shortest,\s*/g, "")
        .replace(/ml\.miles_practical\s+AS\s+miles_practical,\s*/g, "")
        .replace(/ml\.loaded_miles\s+AS\s+loaded_miles,\s*/g, "");
      const problems = check(broken);
      if (problems.length === 0) {
        console.error(`${LABEL}: --selftest FAIL — mutation not detected`);
        process.exit(1);
      }
      console.log(`${LABEL}: --selftest PASS — mutation detected (${problems.length} problem(s))`);
      process.exit(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const problems = check(src);
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — GET detail projects miles_shortest/practical/loaded_miles via ml`);
  process.exit(0);
}

main();
