#!/usr/bin/env node
// verify:master-data-list-active-company-scope
//
// ITEM 3 = B (owner ruling 2026-07-11): master data (mdata.*) is SHARED across entities by design, but the
// Customers LIST VIEW and Vendors LIST VIEW must show ONLY the ACTIVE company's records. This is enforced at
// the APP LAYER (list query), NOT via RLS. The mechanism is an OPT-IN `active_company_only` flag that ONLY
// the list pages pass; when set, the list query additionally pins rows to the active session company via
// `operating_company_id = current_setting('app.operating_company_id', true)::uuid`, layered ON TOP of the
// existing access check. Shared pickers/autocomplete never pass the flag, so cross-entity booking dropdowns
// keep their per-call operating_company_id scope.
//
// This guard locks that behavior so it can never silently regress:
//   1. customers list endpoint declares `active_company_only` AND applies the active-company pin.
//   2. vendors   list endpoint declares `active_company_only` AND applies the active-company pin.
//   3. UNITS list is NOT filtered by active_company_only (units are intentionally cross-entity — a
//      TRK-owned unit leased to TRANSP must stay visible; pinning units would break the lease model).
//
// Self-test: node scripts/verify-master-data-list-active-company-scope.mjs --selftest
// LINKAGE: mdata.customers / mdata.vendors list read-scoping. Additive only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CUSTOMERS_FILE = "apps/backend/src/mdata/customers.routes.ts";
const VENDORS_FILE = "apps/backend/src/mdata/vendors.routes.ts";
const UNITS_FILE = "apps/backend/src/mdata/units.routes.ts";

// The active-company pin (single-quotes normalized) that the list query must apply when the flag is set.
const PIN_RE = /operating_company_id\s*=\s*current_setting\(\s*['"]app\.operating_company_id['"]\s*,\s*true\s*\)::uuid/;
// The opt-in gate: the pin is applied only inside `if (active_company_only)`.
const GATE_RE = /if\s*\(\s*active_company_only\s*\)/;
const FLAG_DECL_RE = /active_company_only:\s*z\.coerce\.boolean\(\)/;

/**
 * Assert a list-endpoint source both DECLARES the opt-in flag and APPLIES the active-company pin behind it.
 * Pure over the file text so it is unit-testable by --selftest.
 */
export function checkListScoped(text, label) {
  const failures = [];
  if (!FLAG_DECL_RE.test(text)) failures.push(`${label}: missing opt-in flag declaration (active_company_only: z.coerce.boolean())`);
  if (!GATE_RE.test(text)) failures.push(`${label}: missing opt-in gate (if (active_company_only))`);
  if (!PIN_RE.test(text)) failures.push(`${label}: missing active-company pin (operating_company_id = current_setting('app.operating_company_id', true)::uuid)`);
  return failures;
}

/** Assert a file does NOT pin by active_company_only (used for the intentionally cross-entity units list). */
export function checkNotScoped(text, label) {
  if (/active_company_only/.test(text) || PIN_RE.test(text)) {
    return [`${label}: must NOT apply active_company_only / active-company pin (units are intentionally cross-entity — lease model)`];
  }
  return [];
}

function readRepo(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function run() {
  const failures = [];
  for (const [rel, label] of [[CUSTOMERS_FILE, "customers list"], [VENDORS_FILE, "vendors list"]]) {
    const text = readRepo(rel);
    if (text == null) { failures.push(`${label}: file not found (${rel})`); continue; }
    failures.push(...checkListScoped(text, label));
  }
  const unitsText = readRepo(UNITS_FILE);
  if (unitsText == null) failures.push(`units list: file not found (${UNITS_FILE})`);
  else failures.push(...checkNotScoped(unitsText, "units list"));
  return failures;
}

if (process.argv.includes("--selftest")) {
  const goodList = `
    active_company_only: z.coerce.boolean().optional().default(false),
    // ...
    filters.push(\`operating_company_id = $\${values.length}\`);
    if (active_company_only) {
      filters.push(\`operating_company_id = current_setting('app.operating_company_id', true)::uuid\`);
    }
  `;
  const missingPin = `active_company_only: z.coerce.boolean().optional().default(false); if (active_company_only) { /* forgot pin */ }`;
  const missingFlag = `filters.push(\`operating_company_id = current_setting('app.operating_company_id', true)::uuid\`);`;
  const unitsGood = `WHERE c.id IN (SELECT org.user_accessible_company_ids())`;
  const unitsBad = `if (active_company_only) { pin }`;
  const checks = [
    ["good list passes", checkListScoped(goodList, "x").length === 0],
    ["missing pin is flagged", checkListScoped(missingPin, "x").some((m) => /pin/.test(m))],
    ["missing flag is flagged", checkListScoped(missingFlag, "x").some((m) => /flag declaration/.test(m))],
    ["cross-entity units pass checkNotScoped", checkNotScoped(unitsGood, "u").length === 0],
    ["units pinned is flagged by checkNotScoped", checkNotScoped(unitsBad, "u").length === 1],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:master-data-list-active-company-scope --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:master-data-list-active-company-scope --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:master-data-list-active-company-scope — FAILED");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:master-data-list-active-company-scope — OK (customers + vendors list pinned to active company; units left cross-entity)");
}
