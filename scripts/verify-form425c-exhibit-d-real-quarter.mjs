#!/usr/bin/env node
/**
 * F425C-EXHIBIT-D-NOT-A-REAL-QUARTER — Exhibit D (U.S. Trustee quarterly fee, 28 U.S.C. § 1930(a)(6))
 * summed disbursements over whatever period_start/period_end the shared "Build all exhibits" picker
 * had — normally one calendar MONTH, the same range used for the five other monthly exhibits. That
 * one-month total was labeled "quarterly_disbursements_cents" and fed straight into the statutory
 * fee-tier lookup, silently understating the U.S. Trustee fee on a real court filing whenever the
 * filer used the default (or any non-quarter-aligned) period.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibit-d-real-quarter";
const FILE = "apps/backend/src/reports/form-425c/exhibits/exhibit-d-quarterly-fees.ts";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("export function calendarQuarterContaining")) {
    problems.push(`${FILE}: must export a calendarQuarterContaining helper — the fee base must never trust a raw caller-supplied range`);
  }
  if (!src.includes("const quarter = calendarQuarterContaining(input.period_end)")) {
    problems.push(`${FILE}: buildExhibitD must snap to the real calendar quarter containing period_end, not trust input.period_start/period_end directly`);
  }
  if (/\[input\.operating_company_id,\s*input\.period_start,\s*input\.period_end\]/.test(src)) {
    problems.push(`${FILE}: the disbursements query must use the resolved quarter bounds, not the raw input period (the exact regression this guard exists to catch)`);
  }
  if (!/\[input\.operating_company_id,\s*quarter\.period_start,\s*quarter\.period_end\]/.test(src)) {
    problems.push(`${FILE}: the disbursements query must pass quarter.period_start/quarter.period_end`);
  }
  if (!src.includes("period_start: quarter.period_start") || !src.includes("period_end: quarter.period_end")) {
    problems.push(`${FILE}: the returned exhibit must echo the resolved quarter dates, not the raw input period, so the filer sees what was actually computed`);
  }
  return problems;
}

const good = `
export function calendarQuarterContaining(dateIso) { return {}; }
  const quarter = calendarQuarterContaining(input.period_end);
    [input.operating_company_id, quarter.period_start, quarter.period_end]
  return {
    period_start: quarter.period_start,
    period_end: quarter.period_end,
`;
const bad = `
export async function buildExhibitD(client, input) {
  const res = await client.query(sql,
    [input.operating_company_id, input.period_start, input.period_end]
  );
  return {
    period_start: input.period_start,
    period_end: input.period_end,
  };
}
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 4) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Exhibit D always computes the U.S. Trustee fee over a real calendar quarter`);
process.exit(0);
