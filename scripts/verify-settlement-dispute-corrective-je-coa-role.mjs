#!/usr/bin/env node
/**
 * ACCT-F5616 regression guard — settlement-dispute.service.ts's pickCorrectionAccounts() must resolve
 * a designated CoA role for both the debit and credit leg of a dispute's corrective JE, never fall
 * back to an ORDER BY created_at ASC LIMIT 2 pick of arbitrary accounts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-corrective-je-coa-role";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/driver-finance/settlement-dispute.service.ts";

const DEBIT_RESOLVE = 'resolveRoleAccountOptional(client, operatingCompanyId, "driver_pay_expense")';
const CREDIT_RESOLVE = 'resolveRoleAccountOptional(client, operatingCompanyId, "settlement_dispute_correction_recovery")';
const FORBIDDEN_ORDER_BY = "ORDER BY created_at ASC NULLS LAST, id ASC";

function assertAll(src) {
  const problems = [];
  if (!src.includes(DEBIT_RESOLVE)) {
    problems.push("pickCorrectionAccounts no longer resolves driver_pay_expense via resolveRoleAccountOptional.");
  }
  if (!src.includes(CREDIT_RESOLVE)) {
    problems.push("pickCorrectionAccounts no longer resolves settlement_dispute_correction_recovery via resolveRoleAccountOptional.");
  }
  if (src.includes(FORBIDDEN_ORDER_BY)) {
    problems.push("found the arbitrary ORDER BY created_at ASC ... LIMIT 2 account pick again -- the regression is back.");
  }
  if (!/if \(!debitAccountId \|\| !creditAccountId\) throw new Error\("E_CORRECTIVE_JE_ACCOUNTS_MISSING"\)/.test(src)) {
    problems.push("pickCorrectionAccounts no longer fails closed when either role is undesignated.");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const droppedCreditResolve = src.replace(
    CREDIT_RESOLVE,
    'Promise.resolve(null)'
  );
  if (droppedCreditResolve === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: credit-resolve mutation string did not match live source`);
    process.exit(1);
  }
  const p1 = assertAll(droppedCreditResolve);
  if (!p1.some((p) => p.includes("settlement_dispute_correction_recovery"))) {
    console.error(`${LABEL} SELFTEST FAILED: dropping the credit-role resolve call not caught`);
    process.exit(1);
  }

  const reverted = src.replace(
    /const \[debitAccountId, creditAccountId\] = await Promise\.all\(\[[\s\S]*?\]\);\n  if \(!debitAccountId \|\| !creditAccountId\) throw new Error\("E_CORRECTIVE_JE_ACCOUNTS_MISSING"\);\n  return \{ debitAccountId, creditAccountId \};/,
    `const res = await client.query(\n    \`SELECT id::text FROM catalogs.accounts ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 2\`\n  );\n  if (res.rows.length < 2) throw new Error("E_CORRECTIVE_JE_ACCOUNTS_MISSING");\n  return { debitAccountId: res.rows[0].id, creditAccountId: res.rows[1].id };`
  );
  if (reverted === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: full-revert mutation string did not match live source`);
    process.exit(1);
  }
  const p2 = assertAll(reverted);
  if (!p2.some((p) => p.includes("ORDER BY created_at"))) {
    console.error(`${LABEL} SELFTEST FAILED: reverting to the arbitrary ORDER BY pick not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — settlement dispute corrective JE resolves designated CoA roles, never an arbitrary account pick`);
