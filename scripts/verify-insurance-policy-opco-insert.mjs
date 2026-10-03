#!/usr/bin/env node
/**
 * LV-TXN-014 — insurance.policy carries BOTH tenant_id (NOT NULL) and operating_company_id (nullable,
 * no default). Its RLS policy `insurance_policy_opco_scope` WITH CHECKs on operating_company_id, so an
 * INSERT that populates only tenant_id writes a row whose operating_company_id is NULL — WITH CHECK
 * fails and the insert aborts. Reproduced live: HTTP 500 42501 on every entity, 5 aborted insert
 * attempts, 0 live rows, before the fix.
 *
 * FIX (already shipped): apps/backend/src/insurance/policy.routes.ts's INSERTs into insurance.policy
 * write operating_company_id.
 *
 * ROUND 342 step 2c: operating_company_id is the ONE company column (NOT NULL since 202615310700);
 * phase A stops every write of the legacy tenant_id, phase B drops it.
 *
 * INVARIANT (static — no database): EVERY INSERT INTO insurance.policy column list (create AND renew)
 * includes operating_company_id and does NOT include tenant_id.
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
  const matches = [...code.matchAll(/INSERT INTO insurance\.policy\s*\(([^)]*)\)/gi)];
  if (!matches.length) return { ok: false, reason: "INSERT INTO insurance.policy (...) not found" };
  for (const match of matches) {
    const columns = match[1];
    if (!/\boperating_company_id\b/i.test(columns)) {
      return {
        ok: false,
        reason:
          "INSERT INTO insurance.policy column list is missing operating_company_id — the RLS policy WITH CHECKs on this column; omitting it means every insert aborts with 42501 (LV-TXN-014)",
      };
    }
    if (/\btenant_id\b/i.test(columns)) {
      return { ok: false, reason: "INSERT INTO insurance.policy writes tenant_id — ROUND 342 step 2c retires it; operating_company_id is the one company column" };
    }
  }
  return { ok: true, count: matches.length };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const result = await client.query(\`
      INSERT INTO insurance.policy (
        operating_company_id,
        insurer_name
      )
      VALUES ($1::uuid, $2)
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

  const legacy = good.replace("        operating_company_id,\n", "        tenant_id,\n        operating_company_id,\n");
  if (legacy === good || checkInsurancePolicyInsert(legacy).ok) fail("selftest: legacy tenant_id write should FAIL but passed");

  const secondInsertRegressed = good + good.replace("        operating_company_id,\n", "");
  if (checkInsurancePolicyInsert(secondInsertRegressed).ok) fail("selftest: a second INSERT missing operating_company_id should FAIL (every INSERT is checked) but passed");

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

  console.log(`[${LABEL}] selftest: PASS — good/regressed/legacy/second-insert/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkInsurancePolicyInsert(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — all ${result.count} INSERT INTO insurance.policy write operating_company_id and none writes tenant_id`);
}
