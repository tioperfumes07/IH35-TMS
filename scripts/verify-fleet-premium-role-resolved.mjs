#!/usr/bin/env node
/**
 * INS-01 — fleet premium JE accounts must resolve by CoA role, never ORDER BY created_at LIMIT 2.
 *
 * Root cause: pickFleetPremiumAccounts grabbed the two oldest catalogs.accounts rows.
 * Fix: resolveRoleAccount(..., "insurance_expense") + resolveRoleAccount(..., "ap_control").
 *
 * Usage:
 *   node scripts/verify-fleet-premium-role-resolved.mjs
 *   node scripts/verify-fleet-premium-role-resolved.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-premium-role-resolved";
const SELFTEST = process.argv.includes("--selftest");

const SERVICE = path.join(ROOT, "apps/backend/src/insurance/policy-unit-fleet.service.ts");
const RESOLVER = path.join(ROOT, "apps/backend/src/accounting/coa-roles/resolver.service.ts");
const FE_API = path.join(ROOT, "apps/frontend/src/api/accounting.ts");
const MIG = path.join(
  ROOT,
  "db/migrations/202609100010_ins_01_fleet_premium_insurance_expense_role.sql"
);

/** @param {string} service @param {string} resolver @param {string} feApi @param {string} mig */
export function check(service, resolver, feApi, mig) {
  const problems = [];

  if (!service) problems.push("policy-unit-fleet.service.ts missing");
  if (!resolver) problems.push("resolver.service.ts missing");
  if (!mig) problems.push("missing migration 202609100010_ins_01_fleet_premium_insurance_expense_role.sql");

  if (service) {
    if (/ORDER BY\s+created_at/i.test(service) && /LIMIT\s+2/.test(service)) {
      problems.push("pickFleetPremiumAccounts must not use ORDER BY created_at LIMIT 2");
    }
    if (/LIMIT\s+2/.test(service) && /catalogs\.accounts/.test(service)) {
      problems.push("fleet premium must not SELECT catalogs.accounts LIMIT 2");
    }
    if (!/resolveRoleAccount\([^)]*"insurance_expense"\)/.test(service)) {
      problems.push('must resolveRoleAccount(..., "insurance_expense") for debit expense');
    }
    if (!/resolveRoleAccount\([^)]*"ap_control"\)/.test(service)) {
      problems.push('must resolveRoleAccount(..., "ap_control") for credit payable');
    }
  }

  if (resolver && !/"insurance_expense"/.test(resolver)) {
    problems.push("COA_ROLE_VALUES must include insurance_expense");
  }
  if (feApi && !/"insurance_expense"/.test(feApi)) {
    problems.push("frontend COA_ROLE_VALUES must include insurance_expense");
  }
  if (mig && !/'insurance_expense'/.test(mig)) {
    problems.push("migration must widen CHECK to include insurance_expense");
  }
  if (mig && !/HOLD-FOR-JORGE/.test(mig)) {
    problems.push("migration must carry HOLD-FOR-JORGE financial marker");
  }
  if (mig && !/DO NOT RUN ON PROD/.test(mig)) {
    problems.push("migration must carry DO NOT RUN ON PROD marker");
  }

  return problems;
}

function selftest() {
  const goodService = `
    async function pickFleetPremiumAccounts(client, opco) {
      const expenseAccountId = await resolveRoleAccount(client, opco, "insurance_expense");
      const payableAccountId = await resolveRoleAccount(client, opco, "ap_control");
      return { expenseAccountId, payableAccountId };
    }
  `;
  const badService = `
    SELECT id FROM catalogs.accounts ORDER BY created_at ASC LIMIT 2
  `;
  const goodResolver = `export const COA_ROLE_VALUES = ["ap_control", "insurance_expense"] as const;`;
  const goodFe = `export const COA_ROLE_VALUES = ["ap_control", "insurance_expense"] as const;`;
  const goodMig = `HOLD-FOR-JORGE\nDO NOT RUN ON PROD\nCHECK (role IN ('insurance_expense'))`;

  if (check(goodService, goodResolver, goodFe, goodMig).length) {
    throw new Error("compliant flagged");
  }
  if (!check(badService, goodResolver, goodFe, goodMig).length) {
    throw new Error("ORDER BY created_at LIMIT 2 not caught");
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const problems = check(read(SERVICE), read(RESOLVER), read(FE_API), read(MIG));
if (problems.length) {
  console.error(`[${LABEL}] FAILED:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — fleet premium resolves insurance_expense + ap_control (no created_at LIMIT 2)`);
