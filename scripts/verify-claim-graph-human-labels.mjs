#!/usr/bin/env node
/** LST-F108 — ClaimsTab claim-graph chrome must not use bare UUID fragments for accidents/expenses. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";
const LABEL = "verify-claim-graph-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assert(src) {
  const problems = [];
  if (/Accident \$\{[^}]*\.id\.slice\(0,\s*8\)\}/.test(src) || /Accident \$\{a\.id\.slice/.test(src)) {
    problems.push(`${FILE}: accident link still uses UUID slice label`);
  }
  if (/Expense \$\{[^}]*\.id\.slice\(0,\s*8\)\}/.test(src) || /Expense \$\{e\.id\.slice/.test(src)) {
    problems.push(`${FILE}: expense link still uses UUID slice label`);
  }
  if (/highlightedClaimId\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FILE}: claim graph header still uses highlightedClaimId.slice`);
  }
  if (!/entityLabel\(/.test(src) || !/formatDateUS\(/.test(src)) {
    problems.push(`${FILE}: must use entityLabel + formatDateUS for graph chrome`);
  }
  return problems;
}

if (SELFTEST) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const planted = live
    .replace(/label=\{entityLabel\(\s*a\.accident_at[\s\S]*?\)\}/, 'label={`Accident ${a.id.slice(0, 8)}`}')
    .replace(/entityLabel\(highlightedClaim\?\.claim_number[\s\S]*?\)/, "highlightedClaimId.slice(0, 8)");
  if (!assert(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
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
