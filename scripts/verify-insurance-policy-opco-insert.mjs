#!/usr/bin/env node
/**
 * LV-TXN-014 — insurance.policy carries BOTH tenant_id (NOT NULL) and operating_company_id (nullable,
 * no default). Its RLS policy `insurance_policy_opco_scope` WITH CHECKs on operating_company_id, so an
 * INSERT that populates only tenant_id writes a row whose operating_company_id is NULL — WITH CHECK
 * fails and the insert aborts. Reproduced live: HTTP 500 42501 on every entity, 5 aborted insert
 * attempts, 0 live rows, before the fix.
 *
 * FIX (already shipped): apps/backend/src/insurance/policy.routes.ts's INSERT into insurance.policy
 * now lists both tenant_id and operating_company_id, both bound to the same value.
 *
 * INVARIANT (static — no database): the INSERT INTO insurance.policy column list must include both
 * tenant_id and operating_company_id — dropping either reproduces the exact 500 this guard exists to
 * prevent recurring.
 *
 * Self-test: node scripts/verify-insurance-policy-opco-insert.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-insurance-policy-opco-insert";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/insurance/policy.routes.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function checkInsurancePolicyInsert(src) {
  const code = stripComments(src);
  const match = /INSERT INTO insurance\.policy\s*\(([^)]*)\)/i.exec(code);
  if (!match) return { ok: false, reason: "INSERT INTO insurance.policy (...) not found" };
  const columns = match[1];
  const hasTenantId = /\btenant_id\b/i.test(columns);
  const hasOpcoId = /\boperating_company_id\b/i.test(columns);
  if (!hasTenantId) return { ok: false, reason: "INSERT INTO insurance.policy column list is missing tenant_id" };
  if (!hasOpcoId) {
    return {
      ok: false,
      reason:
        "INSERT INTO insurance.policy column list is missing operating_company_id — the RLS policy WITH CHECKs on this column; omitting it means every insert aborts with 42501 (LV-TXN-014)",
    };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const result = await client.query(\`
      INSERT INTO insurance.policy (
        tenant_id,
        operating_company_id,
        insurer_name
      )
      VALUES ($1::uuid, $1::uuid, $2)
    \`);
  `;
  const goodResult = checkInsurancePolicyInsert(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedNoOpco = `
    const result = await client.query(\`
      INSERT INTO insurance.policy (
        tenant_id,
        insurer_name
      )
      VALUES ($1::uuid, $2)
    \`);
  `;
  const regressedResult = checkInsurancePolicyInsert(regressedNoOpco);
  if (regressedResult.ok) fail("selftest: regressed fixture (missing operating_company_id) should FAIL but passed");

  const commentTrap = `
    // INSERT INTO insurance.policy (tenant_id, operating_company_id, insurer_name)
    const result = await client.query(\`
      INSERT INTO insurance.policy (
        tenant_id,
        insurer_name
      )
      VALUES ($1::uuid, $2)
    \`);
  `;
  const commentTrapResult = checkInsurancePolicyInsert(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkInsurancePolicyInsert(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — INSERT INTO insurance.policy carries both tenant_id and operating_company_id`);
}
