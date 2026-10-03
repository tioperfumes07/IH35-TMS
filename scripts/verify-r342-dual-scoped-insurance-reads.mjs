#!/usr/bin/env node
/**
 * ROUND 342 — dual-scoped insurance read sweep.
 *
 * Dual-scoped: claim, coi_request, lawsuit, payment_schedule, policy, policy_unit, refund_obligation.
 * Rename-only (must stay on tenant_id): type_catalog; mdata.assets joins from insurance readers.
 */
export const ALLOW_OFFLINE_SKIP = "static contract only — no Neon required";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-r342-dual-scoped-insurance-reads";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assertIncludes(read("apps/backend/src/insurance/company-scope.ts"), "insuranceCompanyScope", "helper");

  const policy = read("apps/backend/src/insurance/policy.routes.ts");
  assertIncludes(policy, "COALESCE(p.operating_company_id, p.tenant_id) = $1::uuid", "policy list dual scope");
  assertIncludes(policy, "COALESCE(operating_company_id, tenant_id) = $1::uuid", "policy bare dual scope");

  const claim = read("apps/backend/src/insurance/claim.routes.ts");
  assertIncludes(claim, "COALESCE(c.operating_company_id, c.tenant_id)", "claim dual scope");
  assertIncludes(
    claim,
    '.replace(/^COALESCE\\(operating_company_id, tenant_id\\)/, "COALESCE(c.operating_company_id, c.tenant_id)")',
    "claim list filter aliases COALESCE"
  );

  const summary = read("apps/backend/src/insurance/summary.routes.ts");
  assertIncludes(summary, "FROM insurance.policy\n           WHERE COALESCE(operating_company_id, tenant_id) = $1::uuid", "summary policy");
  assertIncludes(summary, "FROM insurance.claim\n           WHERE COALESCE(operating_company_id, tenant_id) = $1::uuid", "summary claim");

  const refund = read("apps/backend/src/insurance/refund-obligation.service.ts");
  assertIncludes(refund, "COALESCE(operating_company_id, tenant_id) = $1::uuid", "refund dual scope");

  const lawsuit = read("apps/backend/src/insurance/lawsuit.routes.ts");
  assertIncludes(lawsuit, "COALESCE(lawsuit.operating_company_id, lawsuit.tenant_id) = $1::uuid", "lawsuit dual");

  // Rename-only must stay bare
  const typeCat = read("apps/backend/src/insurance/type-catalog.routes.ts");
  assertNotIncludes(typeCat, "COALESCE(operating_company_id, tenant_id)", "type_catalog rename-only");
  assertIncludes(typeCat, 'filters = ["tenant_id = $1::uuid"]', "type_catalog stays tenant_id");

  const createAtomic = read("apps/backend/src/insurance/policy-create-atomic.service.ts");
  assertIncludes(createAtomic, "FROM insurance.type_catalog\n       WHERE tenant_id = $1::uuid", "createAtomic type_catalog bare");

  // assets joins must not become COALESCE(a.operating_company_id — assets has no OCI
  const resolveAsset = read("apps/backend/src/insurance/resolve-asset-id.shared.ts");
  assertIncludes(resolveAsset, "WHERE a.tenant_id = $1::uuid", "assets rename-only");
  assertNotIncludes(resolveAsset, "COALESCE(a.operating_company_id", "assets must not COALESCE OCI");

  console.log(`${LABEL} selftest OK — dual-scoped insurance reads use COALESCE; type_catalog+assets stay tenant_id`);
}

if (process.argv.includes("--selftest") || !process.env.DATABASE_URL) {
  selftest();
  process.exit(0);
}

selftest();
console.log(`${LABEL}: LIVE INFO — static dual-scope contract holds`);
process.exit(0);
