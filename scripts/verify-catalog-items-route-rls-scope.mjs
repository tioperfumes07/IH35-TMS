#!/usr/bin/env node
/**
 * GUARD: the /api/v1/catalogs/items route scopes to the active entity under the RLS GUC (LST).
 *
 * WHY THIS EXISTS (verified on the prod branch 2026-07-24)
 * catalogs.items is FORCE RLS with a NOT NULL operating_company_id (migration af2, applied on prod:
 * 189 rows, 2 policies). The policy is `is_lucia_bypass() OR operating_company_id = current_setting(
 * 'app.operating_company_id')`, and is_lucia_bypass() returns true ONLY when app.bypass_rls='lucia'
 * (verified: prod function source). This route ran every query under `withCurrentUser`, which sets the
 * app role + current_user_id but NEVER app.operating_company_id — so the SELECT policy filtered ALL
 * 189 rows and GET returned an EMPTY list on every screen that reads it (item autocomplete via
 * searchQboMasterData → QboCombobox), while POST omitted the NOT NULL opco and 500'd. This guard keeps
 * the route on the canonical scope: resolve the entity, SET the GUC, include opco in the INSERT.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/catalogs/items.routes.ts";
const LABEL = "verify-catalog-items-route-rls-scope";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertItemsRouteScoped(sources) {
  const src = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const problems = [];

  // The RLS GUC must be set (directly or via the withScopedCompany helper that sets it).
  if (!/set_config\('app\.operating_company_id'/.test(src)) {
    problems.push(`${ROUTE}: never sets app.operating_company_id — under catalogs.items FORCE RLS every SELECT returns 0 rows (the empty item picker).`);
  }
  if (!/withScopedCompany/.test(src)) {
    problems.push(`${ROUTE}: does not use a company-scoped wrapper — a bare withCurrentUser read leaves the RLS GUC unset.`);
  }
  // Membership must be asserted so a foreign entity id cannot be scoped to.
  if (!/assertCompanyMembership/.test(src)) {
    problems.push(`${ROUTE}: does not assertCompanyMembership before setting the entity GUC.`);
  }
  // The INSERT must write operating_company_id (NOT NULL on the table).
  const insertBlock = src.slice(src.indexOf("INSERT INTO catalogs.items"), src.indexOf(") VALUES", src.indexOf("INSERT INTO catalogs.items")));
  if (insertBlock && !/operating_company_id/.test(insertBlock)) {
    problems.push(`${ROUTE}: the INSERT omits operating_company_id, which is NOT NULL on catalogs.items — create would 500.`);
  }
  // A bare withCurrentUser wrapping a catalogs.items query is the exact defect — none should remain.
  if (/withCurrentUser\(authUser\.uuid, async \(client\) => \{\s*const (res|oldRes) = await client\.query\(\s*`\s*\n\s*(SELECT|INSERT|UPDATE)[\s\S]{0,120}catalogs\.items/.test(src)) {
    problems.push(`${ROUTE}: a catalogs.items query still runs under a bare withCurrentUser (RLS GUC unset).`);
  }

  return problems;
}

if (SELFTEST) {
  const live = { [ROUTE]: read(ROUTE) };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) { failures.push(`${name}: inert`); return; }
    const p = assertItemsRouteScoped(mutated);
    if (!p.some((x) => x.includes(needle))) failures.push(`${name}: NOT caught (got: ${p.join(" | ") || "none"})`);
  };
  expectCaught("guc-set-removed",
    { [ROUTE]: live[ROUTE].replace(/set_config\('app\.operating_company_id'/g, "set_config('app.some_other'") },
    "never sets app.operating_company_id");
  expectCaught("opco-dropped-from-insert",
    { [ROUTE]: live[ROUTE].replace("operating_company_id,\n              item_name, item_code", "item_name, item_code") },
    "INSERT omits operating_company_id");
  expectCaught("scoped-wrapper-removed",
    { [ROUTE]: live[ROUTE].replace(/withScopedCompany/g, "withCurrentUser") },
    "does not use a company-scoped wrapper");
  const liveProblems = assertItemsRouteScoped(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);
  if (failures.length) { console.error(`${LABEL} SELFTEST FAILED:`); for (const f of failures) console.error(`  ${f}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertItemsRouteScoped();
if (problems.length) { console.error(`${LABEL} FAILED:`); for (const p of problems) console.error(`  ${p}`); process.exit(1); }
console.log(`${LABEL} OK — the catalogs.items route resolves the entity, sets the RLS GUC, asserts membership, and writes operating_company_id.`);
