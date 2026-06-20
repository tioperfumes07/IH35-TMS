#!/usr/bin/env node
/**
 * AUTO-02 recurrence guard: `driverAssignments` is NOT a valid /fleet/vehicles/stats type — including it
 * 400s the whole request (the bug that blanked city/state and the driver feed). Driver login lives on the
 * separate /fleet/vehicles/driver-assignments endpoint. Fail CI if any code passes `driverAssignments`
 * inside a `/fleet/vehicles/stats?types=...` query string.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "apps/backend/src/integrations/samsara");
const failures = [];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(fp);
  }
  return acc;
}

// Match a /fleet/vehicles/stats?types=... query that lists driverAssignments as a type.
const BAD = /\/fleet\/vehicles\/stats\?types=[^"'`\s]*driverAssignments/;

for (const fp of walk(DIR)) {
  const src = fs.readFileSync(fp, "utf8");
  const rel = path.relative(ROOT, fp).split(path.sep).join("/");
  src.split(/\r?\n/).forEach((line, i) => {
    if (BAD.test(line)) failures.push(`${rel}:${i + 1}: passes driverAssignments to /fleet/vehicles/stats?types= (invalid stats type → 400)`);
  });
}

if (failures.length) {
  console.error("verify:samsara-stats-types FAIL:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("verify:samsara-stats-types OK");
