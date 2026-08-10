#!/usr/bin/env node
/** FACT-S02 — /factoring/submit submission queue entity-scoped + honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s02-submit-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const src = read(PAGE);
  const manifest = read(MANIFEST);
  if (!/path="\/factoring\/submit"/.test(manifest)) problems.push("submit route missing");
  if (!manifest.includes("SubmissionQueue")) problems.push("SubmissionQueue not mounted");
  if (!src.includes('data-testid="factoring-submit-need-company"')) problems.push("need-company missing");
  if (!src.includes('data-testid="factoring-submit-honest-empty"')) problems.push("honest empty missing");
  if (!src.includes("ListErrorBanner")) problems.push("ListErrorBanner missing");
  if (!src.includes("enabled: Boolean(companyId)")) problems.push("query not company-gated");
  if (!src.includes("listSubmissionQueue")) problems.push("listSubmissionQueue missing");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace(/data-testid="factoring-submit-honest-empty"/, 'data-testid="x"'));
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
