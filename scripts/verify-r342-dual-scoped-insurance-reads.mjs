#!/usr/bin/env node
/**
 * ROUND 342 — insurance reads scope on operating_company_id, the one company column.
 *
 * The seven insurance tables that carried BOTH tenant_id and operating_company_id (claim, coi_request, lawsuit,
 * payment_schedule, policy, policy_unit, refund_obligation) had their reads moved to
 * COALESCE(operating_company_id, tenant_id) (#24298) while operating_company_id could still be NULL. Phase 2 step 2a
 * (migration 202615310700) backfilled it and made it NOT NULL, and step 2c drops tenant_id — so any surviving
 * COALESCE(…operating_company_id, …tenant_id) is a future SQL error and is now the regression this guard catches.
 *
 * Rename-only (unchanged from #24298): insurance.type_catalog and mdata.assets stay on tenant_id until CC-1's rename —
 * a COALESCE on their operating_company_id is a SQL error today.
 *
 * Usage: node scripts/verify-r342-dual-scoped-insurance-reads.mjs [--selftest]
 */
export const ALLOW_OFFLINE_SKIP = "static contract only — no Neon required";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-r342-dual-scoped-insurance-reads";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  helper: "apps/backend/src/insurance/company-scope.ts",
  policy: "apps/backend/src/insurance/policy.routes.ts",
  claim: "apps/backend/src/insurance/claim.routes.ts",
  summary: "apps/backend/src/insurance/summary.routes.ts",
  refund: "apps/backend/src/insurance/refund-obligation.service.ts",
  lawsuit: "apps/backend/src/insurance/lawsuit.routes.ts",
  coi: "apps/backend/src/insurance/coi.service.ts",
  schedule: "apps/backend/src/insurance/payment-schedule.routes.ts",
  typeCat: "apps/backend/src/insurance/type-catalog.routes.ts",
  createAtomic: "apps/backend/src/insurance/policy-create-atomic.service.ts",
  resolveAsset: "apps/backend/src/insurance/resolve-asset-id.shared.ts",
};
const FALLBACK = /COALESCE\(\s*(?:\w+\.)?operating_company_id\s*,\s*(?:\w+\.)?tenant_id\s*\)/;

export function check(src) {
  const f = [];
  for (const key of ["helper", "policy", "claim", "summary", "refund", "lawsuit", "coi", "schedule"]) {
    const m = FALLBACK.exec(src[key]);
    if (m) f.push(`${FILES[key]}: tenant_id fallback "${m[0]}" — operating_company_id is NOT NULL and canonical (ROUND 342)`);
  }
  if (!/return alias \? `\$\{alias\}\.operating_company_id` : "operating_company_id";/.test(src.helper)) {
    f.push(`${FILES.helper}: insuranceCompanyScope must return the operating_company_id predicate only`);
  }
  // The scoped reads themselves, on the canonical column.
  if (!/p\.operating_company_id = \$1::uuid/.test(src.policy)) f.push(`${FILES.policy}: policy list not scoped on operating_company_id`);
  if (!/const scope = `c\.operating_company_id`/.test(src.claim)) f.push(`${FILES.claim}: claim scope not on operating_company_id`);
  if (!/FROM insurance\.policy\s+WHERE operating_company_id = \$1::uuid/.test(src.summary)) f.push(`${FILES.summary}: summary policy count not scoped on operating_company_id`);
  if (!/FROM insurance\.claim\s+WHERE operating_company_id = \$1::uuid/.test(src.summary)) f.push(`${FILES.summary}: summary claim count not scoped on operating_company_id`);
  if (!/lawsuit\.operating_company_id = \$1/.test(src.lawsuit)) f.push(`${FILES.lawsuit}: lawsuit list not scoped on operating_company_id`);
  // Rename-only tables stay on tenant_id (CC-1 renames them).
  if (FALLBACK.test(src.typeCat) || !src.typeCat.includes('filters = ["tenant_id = $1::uuid"]')) f.push(`${FILES.typeCat}: type_catalog must stay on tenant_id until CC-1's rename`);
  if (!/FROM insurance\.type_catalog\s+WHERE tenant_id = \$1::uuid/.test(src.createAtomic)) f.push(`${FILES.createAtomic}: type_catalog read must stay on tenant_id until CC-1's rename`);
  if (!src.resolveAsset.includes("WHERE a.tenant_id = $1::uuid") || /COALESCE\(a\.operating_company_id/.test(src.resolveAsset)) {
    f.push(`${FILES.resolveAsset}: mdata.assets has no operating_company_id — stays on tenant_id`);
  }
  return f;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = read();
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: tree not clean:\n  ${check(real).join("\n  ")}`); process.exit(1); }
  const plants = [
    ["fallback back in policy", { ...real, policy: real.policy.replace("p.operating_company_id = $1::uuid", "COALESCE(p.operating_company_id, p.tenant_id) = $1::uuid") }],
    ["helper falls back again", { ...real, helper: real.helper.replace('return alias ? `${alias}.operating_company_id` : "operating_company_id";', 'return alias ? `COALESCE(${alias}.operating_company_id, ${alias}.tenant_id)` : "COALESCE(operating_company_id, tenant_id)";') }],
    ["claim scope on tenant_id", { ...real, claim: real.claim.replace("const scope = `c.operating_company_id`", "const scope = `c.tenant_id`") }],
    ["type_catalog moved early", { ...real, typeCat: real.typeCat.replace('filters = ["tenant_id = $1::uuid"]', 'filters = ["operating_company_id = $1::uuid"]') }],
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
console.log(`${LABEL}: PASS — insurance reads scope on operating_company_id (no tenant_id fallback); type_catalog + mdata.assets stay on tenant_id until CC-1's rename`);
