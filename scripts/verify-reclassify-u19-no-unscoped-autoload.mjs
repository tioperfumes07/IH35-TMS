#!/usr/bin/env node
/** U19 — Reclassify register must not auto-load unscoped all-accounts fiscal-year lines (stuck Loading). */
import fs from "node:fs";
const LABEL = "verify-reclassify-u19-no-unscoped-autoload";
const PAGE = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";
const src = fs.readFileSync(PAGE, "utf8");
const fails = [];
if (!/appliedHasScope/.test(src)) fails.push("missing appliedHasScope");
if (!/enabled: !!companyId && !!applied && appliedHasScope/.test(src)) fails.push("lines query must gate on appliedHasScope");
if (!/urlAccountIds\.length/.test(src)) fails.push("applied init must key off urlAccountIds.length");
if (/useState<\(\{ from: string; to: string \} & Filters\) \| null>\(\(\) => \(\{ from: urlFrom/.test(src)) {
  fails.push("must not always seed applied on open (old hung Loading path)");
}
if (!/data-testid="reclassify-empty"/.test(src)) fails.push("idle empty state required");
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL", fails); process.exit(1); }
  const plant = src.replace("enabled: !!companyId && !!applied && appliedHasScope", "enabled: !!companyId && !!applied");
  if (/appliedHasScope/.test(plant) && /enabled: !!companyId && !!applied && appliedHasScope/.test(plant)) {
    console.error(LABEL, "SELFTEST plant escaped"); process.exit(1);
  }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — U19 no unscoped reclassify autoload");
