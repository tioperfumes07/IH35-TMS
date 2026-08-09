#!/usr/bin/env node
/**
 * C-07 — BorderCrossingHistoryPage must not swallow fetch failures into an empty table
 * (looks like "no crossings" when the API is red).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx";
const LABEL = "verify-border-crossing-history-errors";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (!/loadError/.test(src) || !/border-crossing-history-error/.test(src)) {
    problems.push(`${FILE}: must surface loadError (testid border-crossing-history-error)`);
  }
  if (/\.catch\(\s*\(\)\s*=>\s*setRows\(\[\]\)\s*\)/.test(src)) {
    problems.push(`${FILE}: forbidden silent .catch(() => setRows([]))`);
  }
  if (!/!res\.ok/.test(src)) {
    problems.push(`${FILE}: must fail closed on !res.ok`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live
    .replace(/loadError/g, "ignored")
    .replace(/border-crossing-history-error/g, "x")
    .replace(/!res\.ok/, "false")
    .replace(
      /\.catch\(\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\)/,
      ".catch(() => setRows([]))"
    );
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAILED: planted silent-empty not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED: live sources red: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
