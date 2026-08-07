#!/usr/bin/env node
/**
 * GUARD 2190 — Form 2290 Permits banner per-unit exceptions must EntityLink units.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-permits-unit-entitylink";
const FE = "apps/frontend/src/pages/safety/Permits.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  if (!/EntityLink/.test(src) || !/kind=["']unit["']/.test(src)) {
    problems.push(`${FE}: per-unit deadlines must EntityLink kind="unit"`);
  }
  if (/\$\{u\.unit_number\} due \$\{u\.deadline\}/.test(src)) {
    problems.push(`${FE}: plain unit_number string in per-unit banner is forbidden`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    [FE]: live[FE] + "\n${u.unit_number} due ${u.deadline}\n",
  });
  if (!planted.some((p) => p.includes("plain unit_number"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted string not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Permits Form 2290 per-unit banner EntityLinks units`);
