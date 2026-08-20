#!/usr/bin/env node
/**
 * ACCT-F5653 — a caller-supplied `credit_account_id` (the operator's chosen source/bank account at
 * cash-advance approve / driver-advance disburse / driver-reimbursement immediate-pay time,
 * `apps/backend/src/accounting/posting-engine.service.ts`) was written straight into a
 * `journal_entry_postings.account_id` row with NO check that it belongs to the posting
 * `operating_company_id`'s own chart of accounts. `journal_entry_postings.account_id`'s FK to
 * `catalogs.accounts` is a single-column FK (migration 0092), not a composite
 * (operating_company_id, account_id) constraint, and `catalogs.accounts`' own FORCE RLS only guards
 * direct reads/writes of that table, never FK references made from a foreign INSERT — so nothing at
 * the schema level stopped a UUID belonging to a DIFFERENT entity's chart of accounts (TRANSP/TRK/
 * USMCA) from being posted under this entity's operating_company_id.
 *
 * FAIL if any of the three `creditAccountId`-consuming builders uses the caller-supplied value
 * without first passing it through `verifyCreditAccountBelongsToCompany`. PASS when all three do.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-credit-account-id-entity-scoped";
const FILE = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");

const BUILDERS = ["buildCashAdvanceLines", "buildDriverAdvanceLines", "buildDriverReimbursementLines"];

export function analyzeSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  if (!/async function verifyCreditAccountBelongsToCompany\(/.test(code)) {
    failures.push(`${path.relative(ROOT, FILE)}: verifyCreditAccountBelongsToCompany helper is missing`);
    return failures;
  }
  if (!/WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(code)) {
    failures.push(`${path.relative(ROOT, FILE)}: verifyCreditAccountBelongsToCompany must scope its existence check by operating_company_id`);
  }

  for (const name of BUILDERS) {
    const fnMatch = code.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n\\}`));
    if (!fnMatch) {
      failures.push(`${path.relative(ROOT, FILE)}: could not locate ${name}`);
      continue;
    }
    const fn = fnMatch[0];
    if (!fn.includes("creditAccountId")) continue; // doesn't take a caller-supplied credit account at all
    if (!/verifyCreditAccountBelongsToCompany\(/.test(fn)) {
      failures.push(
        `${path.relative(ROOT, FILE)}: ${name} uses a caller-supplied creditAccountId without passing it ` +
          `through verifyCreditAccountBelongsToCompany — a UUID belonging to a DIFFERENT entity's chart of ` +
          `accounts could be posted under this operating_company_id (ACCT-F5653).`
      );
    }
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(FILE, "utf8");
  return analyzeSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
async function verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId) {
  const res = await client.query(
    \`SELECT id::text FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1\`,
    [creditAccountId, operatingCompanyId]
  );
  if (!res.rows[0]?.id) throw new PostingEngineError("CREDIT_ACCOUNT_CROSS_ENTITY", "x");
  return res.rows[0].id;
}
async function buildCashAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
  const creditAccount = creditAccountId
    ? await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId)
    : await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
}
async function buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
  let creditAccount;
  if (creditAccountId) {
    creditAccount = await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId);
  } else if (advance.from_bank_account_id) {
    creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, advance.from_bank_account_id);
  }
}
async function buildDriverReimbursementLines(client, operatingCompanyId, sourceId, creditAccountId) {
  const creditAccount = creditAccountId
    ? await verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId)
    : await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
}
`;
  const goodFailures = analyzeSource(GOOD);
  if (goodFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${goodFailures.join("; ")}`);
  }

  const BAD = `
async function verifyCreditAccountBelongsToCompany(client, operatingCompanyId, creditAccountId) {
  const res = await client.query(
    \`SELECT id::text FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1\`,
    [creditAccountId, operatingCompanyId]
  );
  return res.rows[0]?.id;
}
async function buildCashAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
  const creditAccount = creditAccountId ?? (await resolveDisbursementCashAccountForCompany(client, operatingCompanyId));
}
async function buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
  let creditAccount;
  if (creditAccountId) {
    creditAccount = creditAccountId;
  } else if (advance.from_bank_account_id) {
    creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, advance.from_bank_account_id);
  }
}
async function buildDriverReimbursementLines(client, operatingCompanyId, sourceId, creditAccountId) {
  const creditAccount = creditAccountId ?? (await resolveDisbursementCashAccountForCompany(client, operatingCompanyId));
}
`;
  const badFailures = analyzeSource(BAD);
  if (badFailures.length < 3) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (all 3 builders using raw creditAccountId) should FAIL all 3 but got ${badFailures.length}: ${badFailures.join("; ")}`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — every caller-supplied credit_account_id is verified against the posting entity's own chart of accounts before use`);
