#!/usr/bin/env node
/** Codex QA 11-02 — moneyListKpiCard must not always pass unavailable (that blanks every tile). */
import fs from "node:fs";
const LABEL = "verify-money-list-kpi-card-shows-value";
const FILE = "apps/frontend/src/pages/accounting/moneyListKpiCard.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];
if (/unavailable="Totals for the current filter/.test(src)) {
  fails.push("must not hard-code unavailable=Totals... (blanks every KPI value)");
}
if (!/unavailable\s*=\s*unavailable/.test(src) && !/unavailable=\{unavailable\}/.test(src)) {
  fails.push("must only pass unavailable when value is honestly unavailable");
}
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL live red", fails); process.exit(1); }
  const plant = src.replace('unavailable={unavailable}', 'unavailable="Totals for the current filter (no separate drill list)"');
  if (!/unavailable="Totals for the current filter/.test(plant)) { console.error(LABEL, "SELFTEST plant escaped"); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — moneyListKpiCard only marks unavailable on honest error/empty");
