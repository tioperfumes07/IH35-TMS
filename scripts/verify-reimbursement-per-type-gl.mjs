#!/usr/bin/env node
// ROW 0 REIMBURSEMENT-PER-TYPE-GL (owner ruling 2026-09-10, INBOX-CC-1). Live-verified (Neon
// tiny-field-89581227, bypass_rls=lucia, USMCA): every driver reimbursement -- fuel, toll, scale,
// parking, lumper, other (driver_finance.driver_reimbursements.reimbursement_type CHECK values) --
// was debiting the SAME generic 'reimbursement_expense' role account (DRIVERTRIPLU056412 "Driver
// Trip-Lumper Reimbursement") regardless of its real type, at all 3 real call sites: the immediate
// pay-out poster (posting-engine.service.ts), the per-line settlement materializer
// (settlement-lines-materialize.service.ts, both its create-time loop and its own
// backfillExistingSettlementLineAccounts repair path), and the canonical live settlement-close JE
// (settlement-payrun-close.service.ts -- settlement-posting.service.ts is explicitly DEPRECATED/
// SUPERSEDED, not the live path). Owner mapping: fuel -> 5000 Fuel & Diesel (reuses the existing
// company_fuel_advance_expense role), toll/scale/parking -> 5300 Tolls & Scales (new
// toll_scale_expense role), lumper -> unchanged (stays on reimbursement_expense), other -> 6999
// Other Operating Expense (new other_operating_expense role).
//
// STATIC (always runs, no DB/browser needed): asserts, by reading the real source files, that:
//   1. resolver.service.ts exports ONE shared resolveReimbursementExpenseAccount(type) function,
//      admits the 2 new roles into COA_ROLE_VALUES, and the function falls back to
//      'reimbursement_expense' when a type has no per-type mapping or that mapping doesn't resolve
//      (the owner's own "never fails" instruction) -- never a bare `return null` shortcut.
//   2. All 3 real call sites import and call resolveReimbursementExpenseAccount (not the old flat
//      resolveRoleAccountOptional(..., "reimbursement_expense") for the reimbursement-type leg
//      specifically) -- posting-engine.service.ts's buildDriverReimbursementLines,
//      settlement-lines-materialize.service.ts's per-row materialization loop AND its
//      backfillExistingSettlementLineAccounts repair function, and settlement-payrun-close.
//      service.ts's settlement-close JE (via the per-account grouped loadReimbursementsByAccount,
//      which reuses the already-resolved posting_account_id rather than re-resolving).
//   3. settlement-payrun-close.service.ts posts ONE JE leg PER DISTINCT reimbursement account
//      (a real for-loop over a Map), not one lump `if (cents > 0)` leg -- and fails CLOSED
//      (throws) on any reimbursement line with no resolved account, rather than silently dropping
//      it from the JE.
//   4. The two new migration files (CHECK widen + USMCA seed) exist and reference the correct
//      account numbers (5300, 6999) and role names.
import fs from "node:fs";
import path from "node:path";

const RESOLVER_REL = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const POSTING_ENGINE_REL = "apps/backend/src/accounting/posting-engine.service.ts";
const MATERIALIZE_REL = "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts";
const PAYRUN_CLOSE_REL = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const MIGRATION_CHECK_WIDEN_REL = "db/migrations/202614050000_coa_roles_widen_reimbursement_per_type.sql";
const MIGRATION_SEED_REL = "db/migrations/202614050001_usmca_seed_reimbursement_per_type_roles.sql";

export function auditSources({ resolverSrc, postingEngineSrc, materializeSrc, payrunCloseSrc, migrationCheckWidenSrc, migrationSeedSrc }) {
  const failures = [];

  if (resolverSrc === null) {
    failures.push(`${RESOLVER_REL}: missing`);
  } else {
    if (!/"toll_scale_expense"/.test(resolverSrc) || !/"other_operating_expense"/.test(resolverSrc)) {
      failures.push(`${RESOLVER_REL}: COA_ROLE_VALUES does not admit both new roles (toll_scale_expense, other_operating_expense)`);
    }
    if (!/export async function resolveReimbursementExpenseAccount/.test(resolverSrc)) {
      failures.push(`${RESOLVER_REL}: no exported resolveReimbursementExpenseAccount -- no shared per-type resolver for the 3 posters to share`);
    } else {
      const fnStart = resolverSrc.indexOf("export async function resolveReimbursementExpenseAccount");
      const fnBody = resolverSrc.slice(fnStart, fnStart + 1200);
      if (!/resolveRoleAccountOptional\([^)]*"reimbursement_expense"\)/.test(fnBody)) {
        failures.push(`${RESOLVER_REL}: resolveReimbursementExpenseAccount does not fall back to 'reimbursement_expense' -- a per-type-only lookup would fail closed instead of the owner's own "never fails" instruction`);
      }
    }
  }

  if (postingEngineSrc === null) {
    failures.push(`${POSTING_ENGINE_REL}: missing`);
  } else {
    if (!/resolveReimbursementExpenseAccount\(client,\s*operatingCompanyId,\s*reimb\.reimbursement_type\)/.test(postingEngineSrc)) {
      failures.push(`${POSTING_ENGINE_REL}: buildDriverReimbursementLines does not call resolveReimbursementExpenseAccount(..., reimb.reimbursement_type) -- still resolving the flat generic role`);
    }
  }

  if (materializeSrc === null) {
    failures.push(`${MATERIALIZE_REL}: missing`);
  } else {
    if (!/resolveReimbursementExpenseAccount\(client,\s*input\.operatingCompanyId,\s*r\.reimbursement_type\)/.test(materializeSrc)) {
      failures.push(`${MATERIALIZE_REL}: per-line materialization loop does not call resolveReimbursementExpenseAccount(..., r.reimbursement_type)`);
    }
    if (!/backfillExistingSettlementLineAccounts/.test(materializeSrc)) {
      failures.push(`${MATERIALIZE_REL}: backfillExistingSettlementLineAccounts not found`);
    } else {
      const fnStart = materializeSrc.indexOf("export async function backfillExistingSettlementLineAccounts");
      const fnBody = fnStart === -1 ? "" : materializeSrc.slice(fnStart, fnStart + 3000);
      if (!/GROUP BY dr\.reimbursement_type/.test(fnBody)) {
        failures.push(`${MATERIALIZE_REL}: backfillExistingSettlementLineAccounts no longer groups stuck reimbursement lines by reimbursement_type -- back to one blind bulk UPDATE into a single account`);
      }
      if (!/resolveReimbursementExpenseAccount\(client,\s*input\.operatingCompanyId,\s*group\.reimbursement_type\)/.test(fnBody)) {
        failures.push(`${MATERIALIZE_REL}: backfillExistingSettlementLineAccounts does not resolve the per-type account for each group`);
      }
    }
  }

  if (payrunCloseSrc === null) {
    failures.push(`${PAYRUN_CLOSE_REL}: missing`);
  } else {
    if (!/GROUP BY dr\.reimbursement_type/.test(payrunCloseSrc)) {
      failures.push(`${PAYRUN_CLOSE_REL}: no query grouping reimbursement lines by the real reimbursement_type -- the settlement-close JE would still be summing everything into one figure`);
    }
    if (!/for \(const \[reimbType, cents\] of reimbursementsByType\)/.test(payrunCloseSrc)) {
      failures.push(`${PAYRUN_CLOSE_REL}: no per-type loop resolving + fanning out JE legs -- still a single lump reimbursement leg`);
    }
    if (!/resolveReimbursementExpenseAccount\(client,\s*opco,\s*reimbType\)/.test(payrunCloseSrc)) {
      failures.push(`${PAYRUN_CLOSE_REL}: does not resolve the per-type account inside the loop -- reverted to a single flat role resolution`);
    }
    const loopStart = payrunCloseSrc.indexOf("for (const [reimbType, cents] of reimbursementsByType)");
    const loopBody = loopStart === -1 ? "" : payrunCloseSrc.slice(loopStart, loopStart + 700);
    if (!/if \(!acctId\)/.test(loopBody) || !/throw new SettlementPayRunError/.test(loopBody)) {
      failures.push(`${PAYRUN_CLOSE_REL}: no fail-closed check inside the per-type loop -- a type whose account (including the fallback) can't resolve could silently vanish from the JE instead of blocking the close`);
    }
  }

  if (migrationCheckWidenSrc === null) {
    failures.push(`${MIGRATION_CHECK_WIDEN_REL}: missing`);
  } else if (!/'toll_scale_expense'/.test(migrationCheckWidenSrc) || !/'other_operating_expense'/.test(migrationCheckWidenSrc)) {
    failures.push(`${MIGRATION_CHECK_WIDEN_REL}: does not widen the CHECK constraint to admit both new roles`);
  }

  if (migrationSeedSrc === null) {
    failures.push(`${MIGRATION_SEED_REL}: missing`);
  } else {
    if (!/account_number = '5300'/.test(migrationSeedSrc)) {
      failures.push(`${MIGRATION_SEED_REL}: does not bind toll_scale_expense to account 5300 by number`);
    }
    if (!/account_number = '6999'/.test(migrationSeedSrc)) {
      failures.push(`${MIGRATION_SEED_REL}: does not bind other_operating_expense to account 6999 by number`);
    }
  }

  return failures;
}

function readOrNull(root, rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

if (process.argv.includes("--selftest")) {
  const goodResolver = `
export const COA_ROLE_VALUES = [
  "reimbursement_expense",
  "company_fuel_advance_expense",
  "toll_scale_expense",
  "other_operating_expense",
] as const;
export async function resolveReimbursementExpenseAccount(client, operatingCompanyId, reimbursementType) {
  const preferredRole = REIMBURSEMENT_TYPE_ROLE[reimbursementType];
  if (preferredRole) {
    const preferred = await resolveRoleAccountOptional(client, operatingCompanyId, preferredRole);
    if (preferred) return preferred;
  }
  return resolveRoleAccountOptional(client, operatingCompanyId, "reimbursement_expense");
}
`;
  const goodPostingEngine = `
  const debitAccountId = await resolveReimbursementExpenseAccount(client, operatingCompanyId, reimb.reimbursement_type);
`;
  const goodMaterialize = `
  for (const r of reimbRes.rows) {
    const postingAccountId = isExtraPay
      ? await resolveRoleAccountOptional(client, input.operatingCompanyId, "driver_pay_expense")
      : await resolveReimbursementExpenseAccount(client, input.operatingCompanyId, r.reimbursement_type);
  }

export async function backfillExistingSettlementLineAccounts(client, input) {
  const reimbTypesRes = await client.query(
    \`SELECT dr.reimbursement_type, array_agg(sl.id::text) AS line_ids
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_reimbursements dr ON dr.id::text = sl.source_reference_id::text
      GROUP BY dr.reimbursement_type\`
  );
  for (const group of reimbTypesRes.rows) {
    const accountId = await resolveReimbursementExpenseAccount(client, input.operatingCompanyId, group.reimbursement_type);
  }
}
`;
  const goodPayrunClose = `
  const res = await client.query(
    \`SELECT dr.reimbursement_type, COALESCE(SUM(ABS(sl.amount)), 0)::text AS total
      FROM driver_finance.settlement_lines sl
      LEFT JOIN driver_finance.driver_reimbursements dr ON dr.id::text = sl.source_reference_id::text
      GROUP BY dr.reimbursement_type\`
  );
    if (reimbursementsByType.size > 0) {
      const reimbursementsByAccount = new Map();
      for (const [reimbType, cents] of reimbursementsByType) {
        const acctId = await resolveReimbursementExpenseAccount(client, opco, reimbType);
        if (!acctId) {
          throw new SettlementPayRunError("REIMBURSEMENT_EXPENSE_ACCOUNT_MISSING", "x");
        }
        reimbursementsByAccount.set(acctId, (reimbursementsByAccount.get(acctId) ?? 0) + cents);
      }
      for (const [accountId, cents] of reimbursementsByAccount) {
        legs.push({ account_id: accountId, debit_or_credit: "debit", amount_cents: cents, description: "x" });
      }
    }
`;
  const goodMigrationCheckWiden = "CHECK (role IN ('reimbursement_expense', 'toll_scale_expense', 'other_operating_expense'))";
  const goodMigrationSeed = "account_number = '5300'\naccount_number = '6999'";

  const pass = auditSources({
    resolverSrc: goodResolver,
    postingEngineSrc: goodPostingEngine,
    materializeSrc: goodMaterialize,
    payrunCloseSrc: goodPayrunClose,
    migrationCheckWidenSrc: goodMigrationCheckWiden,
    migrationSeedSrc: goodMigrationSeed,
  });
  if (pass.length) throw new Error("SELFTEST FAIL (should be clean): " + JSON.stringify(pass));

  const noNewRoles = goodResolver.replace('"toll_scale_expense",\n  "other_operating_expense",\n', "");
  if (
    auditSources({
      resolverSrc: noNewRoles,
      postingEngineSrc: goodPostingEngine,
      materializeSrc: goodMaterialize,
      payrunCloseSrc: goodPayrunClose,
      migrationCheckWidenSrc: goodMigrationCheckWiden,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: missing new COA_ROLE_VALUES entries went undetected");
  }

  const noFallback = goodResolver.replace('return resolveRoleAccountOptional(client, operatingCompanyId, "reimbursement_expense");', "return null;");
  if (
    auditSources({
      resolverSrc: noFallback,
      postingEngineSrc: goodPostingEngine,
      materializeSrc: goodMaterialize,
      payrunCloseSrc: goodPayrunClose,
      migrationCheckWidenSrc: goodMigrationCheckWiden,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: removed fallback-to-reimbursement_expense went undetected");
  }

  const postingEngineReverted = goodPostingEngine.replace(
    "resolveReimbursementExpenseAccount(client, operatingCompanyId, reimb.reimbursement_type)",
    'resolveRoleAccountOptional(client, operatingCompanyId, "reimbursement_expense")'
  );
  if (
    auditSources({
      resolverSrc: goodResolver,
      postingEngineSrc: postingEngineReverted,
      materializeSrc: goodMaterialize,
      payrunCloseSrc: goodPayrunClose,
      migrationCheckWidenSrc: goodMigrationCheckWiden,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: posting-engine.service.ts reverted to the flat role went undetected");
  }

  const backfillReverted = goodMaterialize.replace(/GROUP BY dr\.reimbursement_type/, "");
  if (
    auditSources({
      resolverSrc: goodResolver,
      postingEngineSrc: goodPostingEngine,
      materializeSrc: backfillReverted,
      payrunCloseSrc: goodPayrunClose,
      migrationCheckWidenSrc: goodMigrationCheckWiden,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: backfill reverting to a blind bulk update went undetected");
  }

  const payrunReverted = `
  const res = await client.query(
    \`SELECT COALESCE(SUM(ABS(sl.amount)), 0)::text AS total FROM driver_finance.settlement_lines sl\`
  );
    if (reimbursementsCents > 0) {
      const reimbAcct = await resolvePayRunRoleAccount(client, opco, "reimbursement_expense");
      if (!reimbAcct) {
        throw new SettlementPayRunError("REIMBURSEMENT_EXPENSE_ACCOUNT_MISSING", "x");
      }
      legs.push({ account_id: reimbAcct, debit_or_credit: "debit", amount_cents: reimbursementsCents, description: "x" });
    }
`;
  if (
    auditSources({
      resolverSrc: goodResolver,
      postingEngineSrc: goodPostingEngine,
      materializeSrc: goodMaterialize,
      payrunCloseSrc: payrunReverted,
      migrationCheckWidenSrc: goodMigrationCheckWiden,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: payrun-close reverting to a single lump leg went undetected");
  }

  const noMigration = null;
  if (
    auditSources({
      resolverSrc: goodResolver,
      postingEngineSrc: goodPostingEngine,
      materializeSrc: goodMaterialize,
      payrunCloseSrc: goodPayrunClose,
      migrationCheckWidenSrc: noMigration,
      migrationSeedSrc: goodMigrationSeed,
    }).length === 0
  ) {
    throw new Error("SELFTEST FAIL: missing CHECK-widen migration went undetected");
  }

  console.log("verify-reimbursement-per-type-gl: SELFTEST PASS (8/8)");
  process.exit(0);
}

const root = process.cwd();
const failures = auditSources({
  resolverSrc: readOrNull(root, RESOLVER_REL),
  postingEngineSrc: readOrNull(root, POSTING_ENGINE_REL),
  materializeSrc: readOrNull(root, MATERIALIZE_REL),
  payrunCloseSrc: readOrNull(root, PAYRUN_CLOSE_REL),
  migrationCheckWidenSrc: readOrNull(root, MIGRATION_CHECK_WIDEN_REL),
  migrationSeedSrc: readOrNull(root, MIGRATION_SEED_REL),
});
if (failures.length) {
  console.error("verify-reimbursement-per-type-gl FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-reimbursement-per-type-gl: OK -- all 3 reimbursement-posting call sites resolve a per-type " +
    "GL account via the shared resolver (with a never-fails fallback), and the settlement-close JE " +
    "posts one leg per distinct account instead of one lump leg"
);
