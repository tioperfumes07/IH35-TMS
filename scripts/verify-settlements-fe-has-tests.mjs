#!/usr/bin/env node
/**
 * GUARD: driver-finance / settlements FE must have at least one vitest file.
 *
 * FINDING: FE-SETTLEMENTS-ZERO-TEST-COVERAGE
 * A green suite said nothing about settlements because the module had 0 tests.
 *
 * Run: node scripts/verify-settlements-fe-has-tests.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlements-fe-has-tests";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "apps/frontend/src/pages/driver-finance");

function listTests(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listTests(p));
    else if (/\.test\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function assertHasTests(dir) {
  const tests = listTests(dir);
  return tests.length === 0
    ? [`no *.test.ts(x) under ${path.relative(ROOT, dir)} — settlements suite is invisible`]
    : [];
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-settlements-fe-"));
  try {
    fs.mkdirSync(path.join(tmp, "empty"));
    fs.mkdirSync(path.join(tmp, "ok"));
    fs.writeFileSync(path.join(tmp, "ok", "SettlementsPage.test.tsx"), "export {};\n");
    const cases = [
      ["empty fails", path.join(tmp, "empty"), 1],
      ["ok passes", path.join(tmp, "ok"), 0],
    ];
    let failed = 0;
    for (const [name, d, expectN] of cases) {
      const n = assertHasTests(d).length;
      if ((expectN === 0 && n !== 0) || (expectN > 0 && n < expectN)) {
        console.error(`  FAIL selftest: ${name} (problems=${n})`);
        failed++;
      }
    }
    if (failed) {
      console.error(`${LABEL} SELFTEST FAILED`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST OK`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = assertHasTests(DIR);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const tests = listTests(DIR);
console.log(`${LABEL}: OK — ${tests.length} settlements FE test file(s)`);
