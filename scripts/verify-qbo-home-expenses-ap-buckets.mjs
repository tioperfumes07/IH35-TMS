#!/usr/bin/env node
/** QboStyleHome Expenses card must render live A/P aging buckets — not "Category breakdown not yet available". */
import fs from "node:fs";
const LABEL = "verify-qbo-home-expenses-ap-buckets";
const FILE = "apps/frontend/src/pages/home/QboStyleHomePage.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];
if (/Category breakdown not yet available/.test(src)) fails.push("must not say Category breakdown not yet available");
if (!/data-testid="qbo-expenses-ap-aging-buckets"/.test(src)) fails.push("must mount qbo-expenses-ap-aging-buckets");
if (!/ap_aging\.current_cents/.test(src) || !/ap_aging\.d90_plus_cents/.test(src)) {
  fails.push("must read ap_aging bucket cents");
}
if (/title="Not yet available"/.test(src)) fails.push("Customize Not yet available stub must be gone");
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL", fails); process.exit(1); }
  const plant = src.replace('data-testid="qbo-expenses-ap-aging-buckets"', 'data-testid="x"');
  if (/data-testid="qbo-expenses-ap-aging-buckets"/.test(plant)) { console.error(LABEL, "plant escaped"); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — Qbo home Expenses shows A/P aging buckets");
