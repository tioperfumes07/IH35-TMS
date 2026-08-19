#!/usr/bin/env node
/**
 * ACCT-F5577 regression guard — POST /api/v1/factoring/import/faro must require an accounting role.
 *
 * factoring/faro-csv-import.routes.ts had no role gate: currentAuthUser only requires a valid
 * session, so any authenticated company member could commit a Faro factoring statement import --
 * real reserve-balance-affecting transactions -- not just office accounting staff.
 *
 * Fix: canImport() (Owner/Administrator/Accountant, matching factor.routes.ts's own canMutate role
 * set for the same domain minus dispatcher) gates the route before any parsing/commit happens.
 *
 * This static check (no DB connection) asserts:
 *   1. canImport() is defined with at least owner/administrator/accountant.
 *   2. The route handler calls canImport() and 403s before calling importBodySchema.safeParse.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:faro-csv-import-role-gated";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/factoring/faro-csv-import.routes.ts";

const REQUIRED_ROLES = ["owner", "administrator", "accountant"];

function assertAll(src) {
  const problems = [];

  const fnMatch = src.match(/function canImport\(role: string\) \{[\s\S]*?return \[([^\]]+)\]\.includes\(normalized\);/);
  if (!fnMatch) {
    problems.push(`canImport() not found or shape drifted`);
  } else {
    for (const role of REQUIRED_ROLES) {
      if (!fnMatch[1].includes(`"${role}"`)) {
        problems.push(`canImport() missing required role "${role}"`);
      }
    }
  }

  if (!/if \(!canImport\(String\(\(user as \{ role\?: string \}\)\.role \?\? ""\)\)\) \{\s*\n\s*return reply\.code\(403\)\.send\(\{ error: "forbidden" \}\);\s*\n\s*\}\s*\n\s*\n\s*const body = importBodySchema\.safeParse/.test(src)) {
    problems.push(`route handler no longer calls canImport() before parsing the import body`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const planted = src.replace(
    /if \(!canImport\(String\(\(user as \{ role\?: string \}\)\.role \?\? ""\)\)\) \{\s*\n\s*return reply\.code\(403\)\.send\(\{ error: "forbidden" \}\);\s*\n\s*\}\s*\n\n/,
    "",
  );
  if (planted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (role gate dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
