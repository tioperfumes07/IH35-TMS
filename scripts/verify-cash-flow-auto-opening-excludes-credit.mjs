#!/usr/bin/env node
/**
 * Guard (CASH-ANOMALY, auto projection): daily-prediction opening cash must exclude
 * credit-card / line-of-credit (and other non-cash) accounts — their balances are debt,
 * not cash.
 *
 * REALIGNED #1159: never re-sum Plaid bank_transactions with CASE WHEN is_credit (signed
 * amount_cents produced the phantom -$4.79M). Opening cash must read authoritative
 * depository balances.
 *
 * REALIGNED #2608: cash-flow opening delegates to sumAuthoritativeDepositoryCashCents so
 * Banking KPI total_cash and cash-flow opening_cash stay locked together, and non-Plaid
 * internal wallets (Relay Fuel) use an is_credit-keyed ledger sum gated by
 * plaid_item_id IS NULL. The Plaid path still SUM(current_balance_cents) on
 * account_class='depository' only.
 *
 * Comments are STRIPPED before matching. --selftest plants pass + failure fixtures.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:cash-flow-auto-opening-excludes-credit";
const CASH_FLOW = "apps/backend/src/cash-flow/cash-flow.service.ts";
const HELPER = "apps/backend/src/banking/internal-wallet-balance.ts";
const OPENING_CASH_HELPER_ASSIGN_RE =
  /\b(?:const|let|var)?\s*openingCashCents\s*=\s*(?:await\s+)?sumAuthoritativeDepositoryCashCents\s*\(/;

function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

/** Body text of sumAuthoritativeDepositoryCashCents through the next top-level export (or EOF). */
function extractSumAuthoritativeFn(src) {
  const startRe = /export\s+async\s+function\s+sumAuthoritativeDepositoryCashCents\b/;
  const m = startRe.exec(src);
  if (!m || m.index == null) return "";
  const from = m.index;
  const rest = src.slice(from);
  const nextExport = rest.slice(m[0].length).search(/\nexport\s+(?:async\s+)?(?:function|const|type|class)\b/);
  if (nextExport < 0) return rest;
  return rest.slice(0, m[0].length + nextExport);
}

/**
 * @param {{ cashFlow: string, helper: string }} files
 * @returns {string[]}
 */
export function assertGuard(files) {
  const failures = [];
  const cashFlow = stripComments(files.cashFlow || "");
  const helper = stripComments(files.helper || "");

  if (!cashFlow) {
    failures.push(`${CASH_FLOW}: missing or empty`);
  } else if (!OPENING_CASH_HELPER_ASSIGN_RE.test(cashFlow)) {
    failures.push(
      `${CASH_FLOW}: openingCashCents must be assigned from sumAuthoritativeDepositoryCashCents (shared with Banking KPI; keeps credit/non-depository excluded)`
    );
  }

  if (!helper) {
    failures.push(`${HELPER}: missing or empty`);
    return failures;
  }

  if (!/export\s+async\s+function\s+sumAuthoritativeDepositoryCashCents/.test(helper)) {
    failures.push(`${HELPER}: missing export sumAuthoritativeDepositoryCashCents`);
    return failures;
  }

  const fn = extractSumAuthoritativeFn(helper);
  if (!fn) {
    failures.push(`${HELPER}: could not extract sumAuthoritativeDepositoryCashCents body`);
    return failures;
  }

  // Plaid path: authoritative stored balances on depository only (excludes credit/investment/virtual).
  if (!/SUM\(\s*current_balance_cents\s*\)/.test(fn)) {
    failures.push(
      `${HELPER}: sumAuthoritativeDepositoryCashCents Plaid path must SUM(current_balance_cents)`
    );
  }
  if (!/account_class\s*=\s*'depository'/.test(fn)) {
    failures.push(
      `${HELPER}: sumAuthoritativeDepositoryCashCents must restrict to account_class='depository' (excludes credit/investment/virtual debt)`
    );
  }

  // Any is_credit ledger re-sum inside the shared total MUST be gated to non-Plaid wallets only.
  // Ungated CASE WHEN is_credit against the full txn population reintroduces the -$4.79M phantom
  // on Plaid-signed amounts and can pull non-depository debt into opening cash.
  const caseRe =
    /CASE\s+WHEN\s+(?:bt\.)?is_credit\s+THEN[\s\S]*?(?:bt\.)?amount_cents\s+ELSE/gi;
  let caseMatch;
  let caseCount = 0;
  while ((caseMatch = caseRe.exec(fn)) !== null) {
    caseCount++;
    const windowStart = Math.max(0, caseMatch.index - 80);
    const windowEnd = Math.min(fn.length, caseMatch.index + 900);
    const window = fn.slice(windowStart, windowEnd);
    if (!/plaid_item_id\s+IS\s+NULL/i.test(window)) {
      failures.push(
        `${HELPER}: CASE WHEN is_credit ledger sum #${caseCount} in sumAuthoritativeDepositoryCashCents must be gated by plaid_item_id IS NULL (never re-sum Plaid txns)`
      );
    }
    // Ledger path must still exclude credit/non-depository accounts.
    if (!/account_class\s*=\s*'depository'/.test(window)) {
      failures.push(
        `${HELPER}: CASE WHEN is_credit ledger sum #${caseCount} must also restrict to account_class='depository'`
      );
    }
  }

  return failures;
}

function selftest() {
  const goodCashFlow = `
    import { sumAuthoritativeDepositoryCashCents } from "../banking/internal-wallet-balance.js";
    const openingCashCents = await sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts);
  `;
  const goodHelper = `
    export async function sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts) {
      const plaidRes = await client.query(\`
        SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash
        FROM banking.bank_accounts
        WHERE operating_company_id = $1
          AND account_class = 'depository'
          AND is_active = true
          AND plaid_item_id IS NOT NULL
      \`);
      const internalRes = await client.query(\`
        SELECT COALESCE(SUM(CASE WHEN bt.is_credit THEN bt.amount_cents ELSE -bt.amount_cents END), 0)::bigint
          AS internal_total
        FROM banking.bank_transactions bt
        JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE bt.operating_company_id = $1
          AND ba.account_class = 'depository'
          AND ba.plaid_item_id IS NULL
      \`);
      return Number(plaidRes.rows[0]?.total_cash ?? 0) + Number(internalRes.rows[0]?.internal_total ?? 0);
    }
  `;

  const good = { cashFlow: goodCashFlow, helper: goodHelper };
  const goodFails = assertGuard(good);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} --selftest FAIL: good fixtures flagged`, goodFails);
    process.exit(1);
  }

  const cases = [
    [
      "cash-flow-no-helper-call",
      {
        ...good,
        cashFlow: `
          const openingRow = await client.query(\`
            SELECT COALESCE(SUM(current_balance_cents), 0) FROM banking.bank_accounts
            WHERE account_class = 'depository'
          \`);
        `,
      },
    ],
    [
      "cash-flow-dead-helper-call-only",
      {
        ...good,
        cashFlow: `
          if (false) await sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts);
          const openingRow = await client.query(\`
            SELECT COALESCE(SUM(current_balance_cents), 0) FROM banking.bank_accounts
            WHERE account_class = 'depository'
          \`);
          const openingCashCents = Number(openingRow.rows[0]?.balance_cents ?? 0);
        `,
      },
    ],
    [
      "helper-missing-sum-current-balance",
      {
        ...good,
        helper: goodHelper.replace(/SUM\(current_balance_cents\)/g, "SUM(available_balance_cents)"),
      },
    ],
    [
      "helper-missing-depository",
      {
        ...good,
        helper: goodHelper.replace(/account_class = 'depository'/g, "account_class = 'credit'"),
      },
    ],
    [
      "ungated-is-credit-case",
      {
        ...good,
        helper: `
          export async function sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts) {
            const plaidRes = await client.query(\`
              SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash
              FROM banking.bank_accounts
              WHERE account_class = 'depository'
            \`);
            const bad = await client.query(\`
              SELECT COALESCE(SUM(CASE WHEN bt.is_credit THEN bt.amount_cents ELSE -bt.amount_cents END), 0)
              FROM banking.bank_transactions bt
              JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
              WHERE ba.account_class = 'depository'
            \`);
            return 0;
          }
        `,
      },
    ],
    [
      "is-credit-without-depository",
      {
        ...good,
        helper: `
          export async function sumAuthoritativeDepositoryCashCents(client, operatingCompanyId, opts) {
            const plaidRes = await client.query(\`
              SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash
              FROM banking.bank_accounts
              WHERE account_class = 'depository'
            \`);
            const bad = await client.query(\`
              SELECT COALESCE(SUM(CASE WHEN bt.is_credit THEN bt.amount_cents ELSE -bt.amount_cents END), 0)
              FROM banking.bank_transactions bt
              JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
              WHERE ba.plaid_item_id IS NULL
            \`);
            return 0;
          }
        `,
      },
    ],
  ];

  for (const [name, fx] of cases) {
    if (assertGuard(fx).length === 0) {
      console.error(`${LABEL} --selftest FAIL: bad-${name} fixture not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

function readRel(rel) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

const failures = assertGuard({
  cashFlow: readRel(CASH_FLOW),
  helper: readRel(HELPER),
});

if (failures.length) {
  console.error(`${LABEL} — FAIL`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`${LABEL} — OK (auto opening cash excludes credit accounts via sumAuthoritativeDepositoryCashCents)`);
