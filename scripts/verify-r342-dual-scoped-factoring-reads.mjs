#!/usr/bin/env node
/**
 * ROUND 342 — factoring reads scope on operating_company_id, the one company column.
 *
 * The six factoring tables that carried BOTH tenant_id and operating_company_id (bank_match_suggestion, batch,
 * customer_factor_assignment, factor, letter_of_release, reserve_movement) had their reads moved to
 * COALESCE(operating_company_id, tenant_id) while operating_company_id could still be NULL. Phase 2 step 2a
 * (migration 202615310700) backfilled it and made it NOT NULL, and step 2c drops tenant_id — so any surviving
 * COALESCE(…operating_company_id, …tenant_id) is a future SQL error and is now the regression this guard catches.
 *
 * Rename-only: factoring.canonical_factor_agreements — tenant_id RENAMED to operating_company_id by CC-1's 202615330400.
 * its operating_company_id is a SQL error today, and is still refused here.
 *
 * Usage: node scripts/verify-r342-dual-scoped-factoring-reads.mjs [--selftest]
 */
export const ALLOW_OFFLINE_SKIP = "static contract only — no Neon required";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-r342-dual-scoped-factoring-reads";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  helper: "apps/backend/src/factoring/company-scope.ts",
  batch: "apps/backend/src/factoring/batch.service.ts",
  bankMatch: "apps/backend/src/factoring/bank-match.service.ts",
  factor: "apps/backend/src/factoring/factor.service.ts",
  subq: "apps/backend/src/factoring/submission-queue.service.ts",
  kpi: "apps/backend/src/factoring/factoring-kpi.service.ts",
};
const FALLBACK = /COALESCE\(\s*(?:\w+\.)?operating_company_id\s*,\s*(?:\w+\.)?tenant_id\s*\)/;

export function check(src) {
  const f = [];
  for (const key of ["helper", "batch", "bankMatch", "factor", "subq"]) {
    const m = FALLBACK.exec(src[key]);
    if (m) f.push(`${FILES[key]}: tenant_id fallback "${m[0]}" — operating_company_id is NOT NULL and canonical (ROUND 342)`);
  }
  if (!/return alias \? `\$\{alias\}\.operating_company_id` : "operating_company_id";/.test(src.helper)) {
    f.push(`${FILES.helper}: factoringCompanyScope must return the operating_company_id predicate only`);
  }
  if (/\bFROM factoring\.batch\b[\s\S]{0,400}\bWHERE\s+tenant_id\s*=\s*\$/i.test(src.batch)) f.push(`${FILES.batch}: factoring.batch filters on tenant_id`);
  if (!/WHERE b\.operating_company_id = \$1::uuid|AND b\.operating_company_id = \$1::uuid/.test(src.bankMatch)) f.push(`${FILES.bankMatch}: batch read not scoped on operating_company_id`);
  if (!/a\.operating_company_id = \$1::uuid/.test(src.factor)) f.push(`${FILES.factor}: assignment read not scoped on operating_company_id`);
  if (!/cfa\.operating_company_id = \$1::uuid/.test(src.subq)) f.push(`${FILES.subq}: assignment read not scoped on operating_company_id`);
  // canonical_factor_agreements: tenant_id RENAMED to operating_company_id by CC-1's 202615330400 — scope on it, never tenant_id.
  for (const [key, text] of [["factor", src.factor], ["kpi", src.kpi]]) {
    const blocks = text.split("factoring.canonical_factor_agreements");
    for (let i = 1; i < blocks.length; i++) {
      if (/COALESCE\(\w*\.?operating_company_id/.test(blocks[i].slice(0, 600))) {
        f.push(`${FILES[key]}: canonical_factor_agreements has one company column — no COALESCE`);
      }
    }
  }
  if (!src.factor.includes("AND cfa.operating_company_id = $1::uuid") || /\bcfa\.tenant_id\b/.test(src.factor)) f.push(`${FILES.factor}: canonical cfa scope must be operating_company_id (renamed by 202615330400)`);
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = read();
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${check(real).join("\n  ")}`); process.exit(1); }
  const plants = [
    ["fallback back in batch", { ...real, batch: real.batch.replace("b.operating_company_id = $1::uuid", "COALESCE(b.operating_company_id, b.tenant_id) = $1::uuid") }],
    ["helper falls back again", { ...real, helper: real.helper.replace('return alias ? `${alias}.operating_company_id` : "operating_company_id";', 'return alias ? `COALESCE(${alias}.operating_company_id, ${alias}.tenant_id)` : "COALESCE(operating_company_id, tenant_id)";') }],
    ["assignment read on tenant_id", { ...real, factor: real.factor.replaceAll("a.operating_company_id = $1::uuid", "a.tenant_id = $1::uuid") }],
    ["canonical back on tenant_id", { ...real, factor: real.factor.replace("AND cfa.operating_company_id = $1::uuid", "AND cfa.tenant_id = $1::uuid") }],
  ];
  const unchanged = plants.filter(([, s]) => JSON.stringify(s) === JSON.stringify(real)).map(([n]) => n);
  if (unchanged.length) { console.error(`${LABEL} --selftest FAIL: plant did not change the source: ${unchanged.join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const failures = check(read());
if (failures.length) { console.error(`${LABEL}: FAIL\n  ${failures.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — factoring reads scope on operating_company_id (no tenant_id fallback); canonical_factor_agreements scopes on operating_company_id (renamed by 202615330400)`);
