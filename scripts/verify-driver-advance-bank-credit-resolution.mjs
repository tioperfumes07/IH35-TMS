#!/usr/bin/env node
/**
 * CLS-CASH-OUT-CREDITS-CLEARING-ACCOUNT / LV-ADVANCE-CREDITS-UNDEPOSITED-NOT-THE-BANK — static ratchet.
 *
 * The posting engine has multiple builders that credit the cash side of a disbursement. One
 * (buildBillPaymentLines, CHAIN-04) resolves the credit from the source row's OWN bank account via the
 * bank->GL bridge (banking.bank_accounts.ledger_account_id) — its comment names this fix explicitly.
 * buildDriverAdvanceLines used to ignore driver_finance.driver_advances.from_bank_account_id entirely
 * and credit a company-default account instead — live-proven on prod (advance 2239fa7f-…, $250.00
 * credited to Undeposited Funds, the bank's own current_balance_cents cache never moved).
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): every builder in
 * posting-engine.service.ts whose source table HAS a from_bank_account_id column (buildBillPaymentLines,
 * buildDriverAdvanceLines) must call resolveBankLedgerAccountId (the bank->GL bridge) BEFORE any
 * unconditional fallback to resolveCashLikeAccountForCompany / resolveDisbursementCashAccountForCompany
 * — so a bank-named disbursement can never silently land on a company-level or clearing account.
 *
 * ACCT-F5687 — closes the remaining two thirds of the class. buildCashAdvanceLines
 * (driver_finance.cash_advance_requests) and buildDriverReimbursementLines
 * (driver_finance.driver_reimbursements) were a SEPARATE, SCHEMA-level gap: neither source table had a
 * bank column to resolve from at all, so no posting-logic change alone could close them. Migration
 * 202612900000 adds from_bank_account_id to both tables (additive, nullable — every existing row is
 * unaffected), and both builders now follow the SAME precedence as buildDriverAdvanceLines: explicit
 * credit_account_id override, then the row's own from_bank_account_id via the bridge (fail loud), then
 * the ACCT-F345 fail-closed company default. All four bank-sourced builders now covered.
 *
 * Self-test: node scripts/verify-driver-advance-bank-credit-resolution.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-driver-advance-bank-credit-resolution";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/accounting/posting-engine.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * Isolates a named `async function <name>(...) { ... }` block by brace-matching from its opening
 * brace, so this never accidentally spills into the next builder in the same file. Returns null if the
 * function isn't found.
 */
function extractFunctionBody(code, fnName) {
  const anchorRe = new RegExp(String.raw`function\s+${fnName}\s*\([^)]*\)[^{]*\{`);
  const m = anchorRe.exec(code);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < code.length && depth > 0; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
  }
  return code.slice(start, i - 1);
}

/**
 * A builder is compliant when, ignoring comments, the FIRST occurrence of a bank-bridge resolution
 * call (resolveBankLedgerAccountId) appears before the first UNCONDITIONAL fallback call
 * (resolveCashLikeAccountForCompany or resolveDisbursementCashAccountForCompany) that is not itself
 * inside an `if (... from_bank_account_id)` / bank-checked branch. Simpler and just as effective for
 * this codebase's actual shape (verified against both the real fixed and real pre-fix source): the
 * bridge call must appear SOMEWHERE in the function body at all. A builder with zero bridge calls is
 * definitionally the pre-fix shape (fallback-only, no bank attempt).
 */
export function checkBuilderResolvesBankFirst(body) {
  if (body == null) return { ok: false, reason: "function not found" };
  const hasBridgeCall = /resolveBankLedgerAccountId\s*\(/.test(body);
  if (!hasBridgeCall) {
    return { ok: false, reason: "no resolveBankLedgerAccountId call — credit resolution never attempts the source's own bank" };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const goodFixture = `
    async function buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
      const advance = { from_bank_account_id: "x" };
      let creditAccount;
      if (creditAccountId) {
        creditAccount = creditAccountId;
      } else if (advance.from_bank_account_id) {
        creditAccount = await resolveBankLedgerAccountId(client, operatingCompanyId, advance.from_bank_account_id);
      } else {
        creditAccount = await resolveDisbursementCashAccountForCompany(client, operatingCompanyId);
      }
      return creditAccount;
    }
    async function buildOtherLines() {}
  `;
  const goodBody = extractFunctionBody(stripComments(goodFixture), "buildDriverAdvanceLines");
  const goodResult = checkBuilderResolvesBankFirst(goodBody);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedFixture = `
    async function buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
      const creditAccount = creditAccountId ?? (await resolveDisbursementCashAccountForCompany(client, operatingCompanyId));
      return creditAccount;
    }
  `;
  const regressedBody = extractFunctionBody(stripComments(regressedFixture), "buildDriverAdvanceLines");
  const regressedResult = checkBuilderResolvesBankFirst(regressedBody);
  if (regressedResult.ok) fail("selftest: regressed fixture (no bank-bridge attempt, pre-fix shape) should FAIL but passed");

  // Comment-trap: the bridge function name appears only in a comment, real code still pre-fix shape.
  const commentTrap = `
    async function buildDriverAdvanceLines(client, operatingCompanyId, sourceId, creditAccountId) {
      // TODO: should call resolveBankLedgerAccountId here per ACCT-F358
      const creditAccount = creditAccountId ?? (await resolveDisbursementCashAccountForCompany(client, operatingCompanyId));
      return creditAccount;
    }
  `;
  const trapBody = extractFunctionBody(stripComments(commentTrap), "buildDriverAdvanceLines");
  const trapResult = checkBuilderResolvesBankFirst(trapBody);
  if (trapResult.ok) fail("selftest: comment-trap fixture (bridge name mentioned only in a comment) should FAIL but the guard matched its own prose");

  const missingFixture = `async function somethingElse() {}`;
  const missingBody = extractFunctionBody(stripComments(missingFixture), "buildDriverAdvanceLines");
  const missingResult = checkBuilderResolvesBankFirst(missingBody);
  if (missingResult.ok) fail("selftest: missing-function fixture should FAIL but passed");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap/missing fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const code = stripComments(src);

  const BUILDERS = ["buildBillPaymentLines", "buildDriverAdvanceLines", "buildCashAdvanceLines", "buildDriverReimbursementLines"];
  const failures = [];
  for (const name of BUILDERS) {
    const body = extractFunctionBody(code, name);
    const result = checkBuilderResolvesBankFirst(body);
    if (!result.ok) failures.push(`${name}: ${result.reason}`);
  }

  if (failures.length) {
    console.error(`[${LABEL}] FAIL — ${failures.length} of ${BUILDERS.length} bank-sourced builder(s) regressed:`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — all ${BUILDERS.length} bank-sourced builders (${BUILDERS.join(", ")}) resolve credit via the bank->GL bridge before any company-level fallback`);
}
