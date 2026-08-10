#!/usr/bin/env node
/** PROG-S06 — program board + tracker API errors surface ListErrorBanner with retry. */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-program-api-error-banner";
const BOARD = "apps/frontend/src/pages/program/ProgramBoardPage.tsx";
const TRACKER = "apps/frontend/src/pages/program/ProgramTrackerPage.tsx";

function assertWiring(read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")) {
  const problems = [];
  for (const [file, needles] of [
    [BOARD, ["ListErrorBanner", "refetch()", "getProgramBoard"]],
    [TRACKER, ["ListErrorBanner", "query.refetch()", "getProgramTracker"]],
  ]) {
    const src = read(file);
    for (const n of needles) {
      if (!src.includes(n)) problems.push(`${file} missing ${JSON.stringify(n)}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const orig = { [BOARD]: fs.readFileSync(path.join(ROOT, BOARD), "utf8"), [TRACKER]: fs.readFileSync(path.join(ROOT, TRACKER), "utf8") };
  const mutatedBoard = orig[BOARD].replaceAll("ListErrorBanner", "X");
  if (!assertWiring((f) => (f === BOARD ? mutatedBoard : orig[f])).length) {
    console.error(`${LABEL}: selftest failed`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
  process.exit(0);
}

const problems = assertWiring();
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS`);
