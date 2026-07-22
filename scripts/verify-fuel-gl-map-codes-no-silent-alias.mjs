#!/usr/bin/env node
/**
 * HOLD-FUEL-GL-EXPENSE-MAP-CODES — lock fail-closed fuel GL map vocabulary.
 *
 * Live root cause (Neon 2026-07-21): poster resolves category_code = diesel|def|reefer|oil|misc
 * but prod only had category_code='fuel'. Do NOT allow a silent alias to "fuel" (that would fake-post
 * against owner-undesignated vocabulary). Owner must designate the five codes (may reuse 6100).
 *
 * Rule 17: verify-step only — do not edit package.json / locked-guards / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const REQUIRED = ["diesel", "def", "reefer", "oil", "misc"];

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const posterRel = "apps/backend/src/accounting/fuel-posting/poster.service.ts";
const maybeRel = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
const coverageRel = "apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx";
const holdRel = "docs/blocks/HOLD-FUEL-GL-EXPENSE-MAP-CODES-2026-07-21.md";

const poster = read(posterRel);
const maybe = read(maybeRel);
const coverage = read(coverageRel);
const hold = read(holdRel);

if (poster) {
  if (!/FUEL_CATEGORY_CODES\s*=\s*\[\s*"diesel"\s*,\s*"def"\s*,\s*"reefer"\s*,\s*"oil"\s*,\s*"misc"\s*\]/.test(poster)) {
    errors.push(`${posterRel} must keep FUEL_CATEGORY_CODES = diesel|def|reefer|oil|misc (exact order)`);
  }
  if (!/resolveAccountForCategory\(\s*input\.operating_company_id,\s*"fuel",\s*fuelKind\s*\)/.test(poster)) {
    errors.push(`${posterRel} must resolve debit via resolveAccountForCategory(..., "fuel", fuelKind)`);
  }
  // Forbidden: silent alias of missing kind → category_code "fuel" (fake-post / invent mapping).
  if (/resolveAccountForCategory\([^)]*"fuel"\s*,\s*["']fuel["']/.test(poster)) {
    errors.push(`${posterRel} must not fall back to category_code "fuel" — owner designates diesel|def|reefer|oil|misc`);
  }
  if (/category_code\s*===\s*["']fuel["']|category_code\s*=\s*["']fuel["']\s*\|\||\?\?\s*["']fuel["']/.test(poster)) {
    errors.push(`${posterRel} must not alias/default category_code to "fuel"`);
  }
}

if (maybe) {
  if (!/postFuelExpenseFromEvent\(/.test(maybe)) {
    errors.push(`${maybeRel} must call postFuelExpenseFromEvent`);
  }
  if (!/EXPENSE_GL_POSTING_ENABLED/.test(maybe)) {
    errors.push(`${maybeRel} must gate on EXPENSE_GL_POSTING_ENABLED`);
  }
  // Flush must surface errors, never pretend success on map miss.
  if (!/\[FUEL_GL_POST\] post failed/.test(maybe)) {
    errors.push(`${maybeRel} must warn on post failure (fail-honest; no silent swallow without log)`);
  }
  if (/posted_to_gl\s*=\s*true/.test(maybe) && !/markRelayPostedToGl/.test(maybe)) {
    errors.push(`${maybeRel} must only stamp posted_to_gl via markRelayPostedToGl after successful post`);
  }
}

if (coverage) {
  for (const code of REQUIRED) {
    if (!coverage.includes(`"${code}"`)) {
      errors.push(`${coverageRel} must list required code "${code}" (lockstep with poster)`);
    }
  }
  if (/FUEL_GL_CATEGORY_CODES[\s\S]{0,200}"fuel"/.test(coverage)) {
    errors.push(`${coverageRel} must not treat free-text "fuel" as a canonical fuelKind code`);
  }
}

if (hold) {
  if (!/HOLD-FOR-JORGE/.test(hold)) {
    errors.push(`${holdRel} must remain HOLD-FOR-JORGE`);
  }
  if (!/category_code='fuel'/.test(hold) && !/category_code=`fuel`/.test(hold) && !/category_code='fuel'/.test(hold)) {
    // accept either quoting style
    if (!/category_code=.fuel./.test(hold)) {
      errors.push(`${holdRel} must name the live blocker category_code=fuel vs diesel|def|…`);
    }
  }
  if (!/do not invent|Do not invent|never invent/i.test(hold)) {
    errors.push(`${holdRel} must forbid inventing GL accounts`);
  }
}

if (errors.length) {
  console.error("verify-fuel-gl-map-codes-no-silent-alias FAIL:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  "verify-fuel-gl-map-codes-no-silent-alias OK — poster vocabulary diesel|def|reefer|oil|misc locked; no silent fuel alias"
);
