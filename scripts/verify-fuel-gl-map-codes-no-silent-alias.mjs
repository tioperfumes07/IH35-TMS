#!/usr/bin/env node
/**
 * HOLD-FUEL-GL-EXPENSE-MAP-CODES — lock fail-closed fuel GL map vocabulary.
 *
 * Live root cause (Neon 2026-07-21): poster resolves category_code = diesel|def|reefer|oil|misc
 * but prod only had category_code='fuel'. Do NOT allow a silent alias to "fuel" (that would fake-post
 * against owner-undesignated vocabulary). Owner must designate the five codes (may reuse 6100).
 *
 * ACCT-F5024 (2026-08-13): class resolution MUST scope mdata.units / mdata.equipment by
 * owner_company_id / currently_leased_to_company_id — NEVER operating_company_id (column absent →
 * 42703 → silent JE skip on trailer/unit-tagged fuel creates).
 *
 * Rule 17: verify-step only — do not edit package.json / locked-guards / ci.yml.
 *
 * @matrix-built {"modules":["fuel","accounting","fleet"],"cols":["unit","trailer","connectivity"],"leafRe":"^(history|transactions|trailer\\.|unit\\.|expenses\\.|create|gl)","task":"ACCT-F5024-FUEL-CLASS-OWNER-LEASE","pr":"this PR"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const posterRel = "apps/backend/src/accounting/fuel-posting/poster.service.ts";
const maybeRel = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
const coverageRel = "apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx";
const holdRel = "docs/blocks/HOLD-FUEL-GL-EXPENSE-MAP-CODES-2026-07-21.md";

/** ACCT-F5024 — fail if unit/equipment class lookups use the non-existent opco column. */
function assertFuelClassOwnerLeaseScope(posterSource, label = posterRel) {
  const findings = [];
  const unitBlocks = posterSource.match(/FROM\s+mdata\.units[\s\S]{0,280}/gi) ?? [];
  const equipBlocks = posterSource.match(/FROM\s+mdata\.equipment[\s\S]{0,280}/gi) ?? [];
  if (unitBlocks.length === 0 || equipBlocks.length === 0) {
    findings.push(
      `${label}: resolveFuelPostingClassId must SELECT qbo_class_id FROM both mdata.units and mdata.equipment`
    );
  }
  for (const block of [...unitBlocks, ...equipBlocks]) {
    if (/operating_company_id/.test(block)) {
      findings.push(
        `${label}: mdata.units/equipment class lookup must NOT use operating_company_id (column absent on prod)`
      );
    }
    if (!/owner_company_id/.test(block) || !/currently_leased_to_company_id/.test(block)) {
      findings.push(
        `${label}: mdata.units/equipment class lookup must scope by owner_company_id OR currently_leased_to_company_id`
      );
    }
  }
  return findings;
}

function selftest() {
  const bad = `
    SELECT qbo_class_id FROM mdata.units WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1;
    SELECT qbo_class_id FROM mdata.equipment WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1;
  `;
  const badFindings = assertFuelClassOwnerLeaseScope(bad, "selftest-bad");
  if (badFindings.length === 0) {
    console.error("verify-fuel-gl-map-codes-no-silent-alias --selftest FAIL: bad opco scope did not redden");
    process.exit(1);
  }
  const good = `
    SELECT qbo_class_id
    FROM mdata.units
    WHERE id = $1::uuid
      AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
    LIMIT 1;
    SELECT qbo_class_id
    FROM mdata.equipment
    WHERE id = $1::uuid
      AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
    LIMIT 1;
  `;
  const goodFindings = assertFuelClassOwnerLeaseScope(good, "selftest-good");
  if (goodFindings.length > 0) {
    console.error("verify-fuel-gl-map-codes-no-silent-alias --selftest FAIL: good owner/lease scope reddened");
    for (const f of goodFindings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-fuel-gl-map-codes-no-silent-alias --selftest OK (ACCT-F5024 class scope)");
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  selftest();
}

const REQUIRED = ["diesel", "def", "reefer", "oil", "misc"];

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

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
  for (const finding of assertFuelClassOwnerLeaseScope(poster)) {
    errors.push(finding);
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
  "verify-fuel-gl-map-codes-no-silent-alias OK — poster vocabulary diesel|def|reefer|oil|misc locked; ACCT-F5024 owner/lease class scope locked"
);
