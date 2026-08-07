#!/usr/bin/env node
/**
 * verify-factoring-home-canonical-factor-profile — guard against dual-path regression.
 *
 * FactoringHome KPI uses getFactoringSummary (canonical factoring.factor / linkage identity).
 * The profile panel MUST use the same factoring.factor source (listFactors + updateFactor),
 * not mdata.vendors vendor-notes lookup — otherwise live shows "ACTIVE FACTOR Faro" plus
 * "No factor configured" on the same page.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-home-canonical-factor-profile";
const PAGE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

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

if (src.includes("activeFactorVendor")) {
  fail(`${PAGE} must not resolve profile via activeFactorVendor (mdata.vendors dual-path)`);
}
pass("no activeFactorVendor vendor-notes gate");

if (!src.includes("listFactors")) {
  fail(`${PAGE} must load active factor profile via listFactors`);
}
pass("listFactors wired for canonical factor profile");

if (!src.includes("updateFactor")) {
  fail(`${PAGE} must persist profile edits via updateFactor (factoring.factor)`);
}
pass("updateFactor wired for profile save");

if (/updateVendor\s*\(/.test(src)) {
  fail(`${PAGE} must not save factoring profile via updateVendor`);
}
pass("no updateVendor profile save");

// Gate on the loaded factoring.factor row (activeFactor), not a summary-only boolean that
// rendered an empty notes-based panel while KPI already showed Faro (#4211 / FACT-kpi-vs-profile).
if (!/\{activeFactor \?/.test(src) && !/activeFactor \? \(/.test(src)) {
  fail(`${PAGE} must gate profile panel on activeFactor (canonical factoring.factor row)`);
}
pass("profile visibility follows loaded factoring.factor row");

if (/parseVendorNotes|serializeVendorNotes/.test(src)) {
  fail(`${PAGE} must not parse/serialize vendor notes for factor profile`);
}
pass("no vendor-notes profile path");

if (!src.includes("No factor configured")) {
  fail(`${PAGE} must retain empty-state copy for companies with no active factor`);
}
pass("empty-state copy present");

console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
