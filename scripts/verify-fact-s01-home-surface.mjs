#!/usr/bin/env node
/** FACT-S01 — Factoring home KPI + need-company + summary ListErrorBanner. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s01-home-surface";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function read() {
  return fs.readFileSync(path.join(ROOT, PAGE), "utf8");
}

function assertLive(src) {
  const problems = [];
  if (!src.includes('data-testid="factoring-home-need-company"')) problems.push("need-company missing");
  if (!src.includes('data-testid="factoring-home-kpi-row"')) problems.push("kpi-row missing");
  if (!src.includes("ListErrorBanner")) problems.push("ListErrorBanner missing");
  if (!src.includes("summaryQuery.isError")) problems.push("summary error gate missing");
  if (!src.includes("getFactoringSummary")) problems.push("KPI must use getFactoringSummary");
  if (!src.includes("enabled: Boolean(companyId)")) problems.push("summary not company-gated");
  if (src.includes("activeFactorVendor")) problems.push("dual-path activeFactorVendor present");
  if (/parseVendorNotes|serializeVendorNotes/.test(src)) problems.push("vendor-notes profile path present");
  if (!src.includes("listFactors") || !src.includes("updateFactor")) problems.push("canonical factor profile writers missing");
  if (!src.includes("No factor configured")) problems.push("honest empty copy missing");
  return problems;
}

if (SELFTEST) {
  const live = assertLive(read());
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, PAGE);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(pagePath, orig.replace(/data-testid="factoring-home-kpi-row"/, 'data-testid="x"'));
  try {
    if (!assertLive(read()).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
