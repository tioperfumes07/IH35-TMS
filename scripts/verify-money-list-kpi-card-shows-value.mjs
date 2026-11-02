#!/usr/bin/env node
/**
 * Codex QA 11-02 — moneyListKpiCard must show live totals.
 * Standing `unavailable="Totals for the current filter..."` is forbidden (old blank-all path).
 * unavailable={unavailable} is OK: error/empty uses the sublabel; live rows use a summary reason.
 * BoardKpiTile must not blank a supplied value when unavailable is set (DrillKpiCard.tsx).
 */
import fs from "node:fs";
const LABEL = "verify-money-list-kpi-card-shows-value";
const FILE = "apps/frontend/src/pages/accounting/moneyListKpiCard.tsx";
const PRIMITIVE = "apps/frontend/src/components/layout/DrillKpiCard.tsx";
const src = fs.readFileSync(FILE, "utf8");
const primitive = fs.readFileSync(PRIMITIVE, "utf8");
const fails = [];
if (/unavailable="Totals for the current filter/.test(src)) {
  fails.push("must not hard-code unavailable=Totals... (old blank-all path)");
}
if (!/unavailable=\{unavailable\}/.test(src)) {
  fails.push("must pass unavailable={unavailable} (typed non-navigable reason)");
}
if (!/honestlyEmpty/.test(src)) {
  fails.push("must distinguish honestlyEmpty (— / Error loading) from live totals");
}
// Board path must format the supplied value even when unavailable is set.
if (/props\.unavailable\s*\?\s*KPI_NO_VALUE/.test(primitive)) {
  fails.push(`${PRIMITIVE}: BoardKpiTile must not blank value when unavailable is set`);
}
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL live red", fails); process.exit(1); }
  const plant = src.replace('unavailable={unavailable}', 'unavailable="Totals for the current filter (no separate drill list)"');
  if (!/unavailable="Totals for the current filter/.test(plant)) { console.error(LABEL, "SELFTEST plant escaped"); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — moneyListKpiCard shows live totals; unavailable does not blank");
