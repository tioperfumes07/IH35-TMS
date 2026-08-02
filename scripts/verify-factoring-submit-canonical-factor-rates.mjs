#!/usr/bin/env node
/**
 * verify-factoring-submit-canonical-factor-rates — guard against dual-path regression.
 *
 * SubmitFactoringModal batch submit rates MUST come from canonical factoring.factor
 * (listFactors advance_rate / reserve_rate / fee_rate — same source as FactoringHome KPI),
 * not mdata.vendors vendor-notes parseVendorNotes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-submit-canonical-factor-rates";
const PAGE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(full, "utf8");
}

function pass(msg) {
  console.log(`[${LABEL}] PASS: ${msg}`);
}

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

const src = read(PAGE);

if (src.includes("parseVendorNotes")) {
  fail(`${PAGE} must not derive submit rates via parseVendorNotes (mdata.vendors dual-path)`);
}
pass("no parseVendorNotes vendor-notes rate path");

if (!src.includes("listFactors")) {
  fail(`${PAGE} must load canonical factor rates via listFactors`);
}
pass("listFactors wired for canonical factor rates");

if (!/activeFactor\.advance_rate/.test(src)) {
  fail(`${PAGE} must default advance rate from activeFactor.advance_rate`);
}
pass("advance_rate sourced from factoring.factor");

if (!/activeFactor\.reserve_rate/.test(src)) {
  fail(`${PAGE} must default reserve rate from activeFactor.reserve_rate`);
}
pass("reserve_rate sourced from factoring.factor");

if (!/activeFactor\.fee_rate/.test(src)) {
  fail(`${PAGE} must default factor fee from activeFactor.fee_rate`);
}
pass("fee_rate sourced from factoring.factor");

console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
