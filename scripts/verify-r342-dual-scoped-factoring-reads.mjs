#!/usr/bin/env node
/**
 * ROUND 342 — dual-scoped factoring read sweep.
 *
 * Dual-scoped tables (tenant_id + operating_company_id): bank_match_suggestion, batch,
 * customer_factor_assignment, factor, letter_of_release, reserve_movement.
 * Reads must scope via COALESCE(operating_company_id, tenant_id) so CC-1's rename cannot
 * blank a company filter.
 *
 * Rename-only: factoring.canonical_factor_agreements — must stay on tenant_id until CC-1
 * ships the column. COALESCE(a.operating_company_id, …) against that table is a SQL error.
 */
export const ALLOW_OFFLINE_SKIP = "static contract only — no Neon required";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-r342-dual-scoped-factoring-reads";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DUAL_SCOPED_FILES = [
  "apps/backend/src/factoring/batch.service.ts",
  "apps/backend/src/factoring/bank-match.service.ts",
  "apps/backend/src/factoring/factor.service.ts",
  "apps/backend/src/factoring/submission-queue.service.ts",
  "apps/backend/src/factoring/company-scope.ts",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(hay, needle, why) {
  if (!hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  missing: ${needle}`);
    process.exit(1);
  }
}

function assertNotIncludes(hay, needle, why) {
  if (hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  forbidden: ${needle}`);
    process.exit(1);
  }
}

function selftest() {
  const helper = read("apps/backend/src/factoring/company-scope.ts");
  assertIncludes(helper, "factoringCompanyScope", "shared dual-scope helper");
  assertIncludes(helper, "COALESCE(${alias}.operating_company_id, ${alias}.tenant_id)", "alias form");
  assertIncludes(helper, "canonical_factor_agreements", "helper documents rename-only exclusion");

  const batch = read("apps/backend/src/factoring/batch.service.ts");
  assertIncludes(batch, "COALESCE(operating_company_id, tenant_id) = $1::uuid", "listBatches dual scope");
  assertIncludes(batch, "COALESCE(b.operating_company_id, b.tenant_id) = $1::uuid", "batch alias dual scope");
  // Bare WHERE/AND tenant_id = $ on factoring.batch must be gone
  if (/\bFROM factoring\.batch\b[\s\S]{0,400}\bWHERE\s+tenant_id\s*=\s*\$/i.test(batch)) {
    console.error(`${LABEL}: FAIL — factoring.batch still filters on bare tenant_id`);
    process.exit(1);
  }

  const bankMatch = read("apps/backend/src/factoring/bank-match.service.ts");
  assertIncludes(bankMatch, "COALESCE(b.operating_company_id, b.tenant_id) = $1::uuid", "bank-match batch scope");
  assertIncludes(bankMatch, "COALESCE(s.operating_company_id, s.tenant_id) = $1::uuid", "suggestion scope");
  assertIncludes(bankMatch, "COALESCE(operating_company_id, tenant_id) = $2::uuid", "applyMatch dual scope");

  const factor = read("apps/backend/src/factoring/factor.service.ts");
  assertIncludes(factor, "COALESCE(f.operating_company_id, f.tenant_id) = $1::uuid", "listFactors dual scope");
  assertIncludes(factor, "COALESCE(a.operating_company_id, a.tenant_id) = $1::uuid", "assignment dual scope");
  assertIncludes(factor, "companyIdFromDualScopedRow", "factor mapper OCI-first");
  // canonical_factor_agreements must NOT use COALESCE(operating_company_id
  const canonBlocks = factor.split("factoring.canonical_factor_agreements");
  for (let i = 1; i < canonBlocks.length; i++) {
    const window = canonBlocks[i].slice(0, 600);
    if (/COALESCE\(\w*\.?operating_company_id/.test(window)) {
      console.error(`${LABEL}: FAIL — canonical_factor_agreements must stay on tenant_id until CC-1 rename\n  near: ${window.slice(0, 200)}`);
      process.exit(1);
    }
  }
  assertIncludes(factor, "AND cfa.tenant_id = $1::uuid", "canonical cfa stays tenant_id");

  const kpi = read("apps/backend/src/factoring/factoring-kpi.service.ts");
  // KPI joins canonical — must use bare a.tenant_id
  assertIncludes(kpi, "FROM factoring.canonical_factor_agreements a", "kpi reads canonical");
  assertNotIncludes(kpi, "COALESCE(a.operating_company_id, a.tenant_id)", "kpi must not COALESCE on canonical");

  const subq = read("apps/backend/src/factoring/submission-queue.service.ts");
  assertIncludes(subq, "COALESCE(cfa.operating_company_id, cfa.tenant_id) = $1::uuid", "submission assignment dual");
  assertIncludes(subq, "COALESCE(b.operating_company_id, b.tenant_id) = $1::uuid", "submission batch dual");

  for (const f of DUAL_SCOPED_FILES) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      console.error(`${LABEL}: FAIL — missing ${f}`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} selftest OK — dual-scoped factoring reads use COALESCE; canonical stays tenant_id`);
}

if (process.argv.includes("--selftest") || !process.env.DATABASE_URL) {
  selftest();
  process.exit(0);
}

selftest();
console.log(`${LABEL}: LIVE INFO — static dual-scope contract holds (no Neon schema change)`);
process.exit(0);
