#!/usr/bin/env node
/**
 * GUARD 2172 — Accident Report drawer must not display a fabricated "Auto class" string.
 * Class is not persisted yet; honest empty state only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-accident-class-honesty";
const TARGET = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");

function assert(srcText) {
  const problems = [];
  if (/value=["']Auto class["']/.test(srcText)) {
    problems.push(`${TARGET}: fabricated value="Auto class" is forbidden`);
  }
  if (!/Not classified/.test(srcText) || !/data-testid=["']accident-class["']/.test(srcText)) {
    problems.push(`${TARGET}: must show honest "Not classified" via data-testid=accident-class`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = assert(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, live);
    process.exit(1);
  }
  const planted = assert(src.replace(/Not classified/, "Auto class").replace(/accident-class/, "accident-class-x"));
  if (!planted.length) {
    console.error(`${LABEL} SELFTEST FAIL: planted Auto class not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Accident Class field is honest (Not classified), not Auto class`);
