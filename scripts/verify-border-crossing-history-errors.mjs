#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leafRe":"^queues\\.border_history$","task":"CLS-DISPATCH-BORDER-HISTORY-FK-LINKS"} */
/**
 * C-07 — BorderCrossingHistoryPage must not swallow fetch failures into an empty table
 * (looks like "no crossings" when the API is red).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx";
const ROUTE_FILE = "apps/backend/src/border-crossing/border-crossing-history.routes.ts";
const LABEL = "verify-border-crossing-history-errors";
const SELFTEST = process.argv.includes("--selftest");

function assert(src, routeSrc) {
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
  if (!/const submittedGeneration = \+\+scopeGenerationRef\.current/.test(src)) {
    problems.push(`${FILE}: history read must snapshot a scope generation`);
  }
  if (!/const submittedCompanyId = selectedCompanyId/.test(src) || !/encodeURIComponent\(submittedCompanyId\)/.test(src)) {
    problems.push(`${FILE}: history read must snapshot the submitted company`);
  }
  if ((src.match(/scopeGenerationRef\.current !== submittedGeneration/g) ?? []).length < 2) {
    problems.push(`${FILE}: stale history success and error completions must be suppressed`);
  }
  if (!/scopeGenerationRef\.current === submittedGeneration\) setLoading\(false\)/.test(src)) {
    problems.push(`${FILE}: stale completion must not clear current loading state`);
  }
  if (!/setRows\(\[\]\);\s*setSelected\(null\);\s*setLoadError\(null\)/.test(src)) {
    problems.push(`${FILE}: company/read identity transition must clear prior rows, detail, and error`);
  }
  if (!/onClick=\{retryHistory\}/.test(src) || !/>\s*Retry\s*</.test(src)) {
    problems.push(`${FILE}: failed canonical history read must expose exact Retry recovery`);
  }
  for (const id of ["unit_id", "driver_id", "load_id"]) {
    if (!new RegExp(`ubc\\.${id}::text`).test(routeSrc)) problems.push(`${ROUTE_FILE}: history payload must expose ${id}`);
  }
  for (const [kind, id] of [["unit", "row.unit_id"], ["driver", "selected.driver_id"], ["load", "selected.load_id"]]) {
    if (!src.includes(`<EntityLink kind="${kind}" id={${id}}`)) problems.push(`${FILE}: missing canonical ${kind} EntityLink`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const routeLive = fs.readFileSync(path.join(ROOT, ROUTE_FILE), "utf8");
  const planted = live
    .replace(/loadError/g, "ignored")
    .replace(/border-crossing-history-error/g, "x")
    .replace(/!res\.ok/, "false")
    .replace(/const submittedGeneration = \+\+scopeGenerationRef\.current/, "const submittedGeneration = 0")
    .replace(/const submittedCompanyId = selectedCompanyId/, "const submittedCompanyId = operatingCompanyId")
    .replace(/onClick=\{retryHistory\}/, "onClick={() => undefined}")
    .replace(
      /\.catch\(\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\)/,
      ".catch(() => setRows([]))"
    );
  const caught = assert(planted, routeLive.replace("ubc.unit_id::text", "NULL AS unit_id"));
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAILED: planted silent-empty not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live, routeLive);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED: live sources red: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(path.join(ROOT, FILE), "utf8"), fs.readFileSync(path.join(ROOT, ROUTE_FILE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
