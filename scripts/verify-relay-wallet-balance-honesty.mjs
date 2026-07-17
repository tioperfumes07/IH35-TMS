#!/usr/bin/env node
/**
 * GUARD (RELAY-WALLET-BALANCE-1): the Relay Fuel Wallet tile/detail/register showed $0.00 forever
 * because banking.bank_accounts.current_balance_cents/available_balance_cents are ONLY ever synced by
 * the Plaid webhook/exchange path — a non-Plaid internal wallet (plaid_item_id IS NULL) is seeded at 0
 * and NEVER updated again. Root-cause fix: derive that account's balance from its own
 * banking.bank_transactions ledger (SUM is_credit ? +amount_cents : -amount_cents) every time it's read,
 * instead of trusting a column nothing keeps in sync (QBO parity — a bank register has no independently
 * stored balance; it's always the sum of the ledger).
 *
 * Locks this guard enforces (2026-07-16):
 *  - apps/backend/src/banking/internal-wallet-balance.ts exists and exports the two derivation helpers,
 *    and its ledger sum is keyed on `is_credit` (NOT a bare amount_cents-sign assumption — the Relay
 *    wallet feed stores amount_cents as a POSITIVE magnitude for both credits and debits; only
 *    `is_credit` distinguishes them, see relay-wallet-bank-feed.service.ts).
 *  - Every live balance-read surface actually WIRES the derivation for plaid_item_id IS NULL accounts:
 *      · banking.routes.ts        GET /banking/accounts/all        (BankingHome fallback rows, Manage Accounts)
 *      · banking.routes.ts        GET /banking/dashboard/kpis      (total_cash KPI — must not silently drop it)
 *      · plaid/link.routes.ts     GET /banking/plaid/accounts      (BankingHome tile fallback)
 *      · plaid/link.routes.ts     GET /banking/plaid/accounts/:id  (BankAccountDetail "Current/Available balance",
 *                                                                    and the register's running-balance anchor)
 *      · banking/account-balance.routes.ts GET /banking/accounts/:id/balance (consistency, future callers)
 *
 * Comments are STRIPPED before matching so descriptive `//`/`/* *\/` prose is not a false positive.
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const HELPER = path.join(root, "apps/backend/src/banking/internal-wallet-balance.ts");
const BANKING_ROUTES = path.join(root, "apps/backend/src/banking/banking.routes.ts");
const LINK_ROUTES = path.join(root, "apps/backend/src/integrations/plaid/link.routes.ts");
const ACCOUNT_BALANCE_ROUTES = path.join(root, "apps/backend/src/banking/account-balance.routes.ts");

function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function assertHelper(rawSrc, errors) {
  const src = stripComments(rawSrc);
  if (!/export\s+(async\s+)?function\s+withInternalWalletBalances/.test(src)) {
    errors.push("internal-wallet-balance.ts: missing export withInternalWalletBalances (list-endpoint derivation)");
  }
  if (!/export\s+(async\s+)?function\s+deriveInternalWalletBalanceCents/.test(src)) {
    errors.push("internal-wallet-balance.ts: missing export deriveInternalWalletBalanceCents (single-account derivation)");
  }
  // Sign convention: the ledger sum MUST branch on is_credit, not just amount_cents sign — the Relay
  // wallet feed stores amount_cents as a positive magnitude for both money-in and money-out rows.
  if (!/WHEN\s+is_credit\s+THEN\s+amount_cents\s+ELSE\s+-amount_cents/i.test(src)) {
    errors.push("internal-wallet-balance.ts: ledger sum must be `CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END` (is_credit-keyed, not a bare amount_cents sign assumption)");
  }
  // Must only ever touch non-Plaid accounts — never override a Plaid-synced account's real balance.
  if (!/plaid_item_id/.test(src)) {
    errors.push("internal-wallet-balance.ts: must gate on plaid_item_id (Plaid-linked accounts must pass through unchanged)");
  }
}

function assertBankingRoutesWired(rawSrc, errors) {
  const src = stripComments(rawSrc);
  if (!/from\s+["']\.\/internal-wallet-balance\.js["']/.test(src)) {
    errors.push("banking.routes.ts: does not import internal-wallet-balance.js");
  }
  if (!/withInternalWalletBalances\s*\(/.test(src)) {
    errors.push("banking.routes.ts: GET /banking/accounts/all no longer calls withInternalWalletBalances(...) — it will return the frozen current_balance_cents column again");
  }
  // total_cash KPI must not silently regress to a bare SUM(current_balance_cents) that drops internal
  // wallets back to 0 — it must branch on plaid_item_id IS NULL and derive from bank_transactions.
  // Anchored on `::bigint AS total_cash` (unique to the authoritative depository-cash query; the
  // tile-derived kpiRes query above it aliases `total_cash` too but never casts to bigint).
  const anchorIdx = src.indexOf("::bigint AS total_cash");
  if (anchorIdx === -1) {
    errors.push("banking.routes.ts: could not locate the authoritative total_cash query (::bigint AS total_cash) to verify it");
  } else {
    const cashKpiBlock = src.slice(Math.max(0, anchorIdx - 600), anchorIdx);
    if (!/plaid_item_id IS NULL/.test(cashKpiBlock) || !/bank_transactions/.test(cashKpiBlock)) {
      errors.push("banking.routes.ts: total_cash KPI query no longer derives non-Plaid wallet balances from bank_transactions (plaid_item_id IS NULL branch missing) — it will silently show 0 cash for internal wallets again");
    }
  }
}

function assertLinkRoutesWired(rawSrc, errors) {
  const src = stripComments(rawSrc);
  if (!/from\s+["']\.\.\/\.\.\/banking\/internal-wallet-balance\.js["']/.test(src)) {
    errors.push("plaid/link.routes.ts: does not import ../../banking/internal-wallet-balance.js");
  }
  if (!/withInternalWalletBalances\s*\(/.test(src)) {
    errors.push("plaid/link.routes.ts: GET /banking/plaid/accounts no longer calls withInternalWalletBalances(...)");
  }
  if (!/deriveInternalWalletBalanceCents\s*\(/.test(src)) {
    errors.push("plaid/link.routes.ts: GET /banking/plaid/accounts/:id no longer calls deriveInternalWalletBalanceCents(...) — BankAccountDetail's Current/Available balance (and the register's running-balance anchor) will regress to the frozen column");
  }
}

function assertAccountBalanceRoutesWired(rawSrc, errors) {
  const src = stripComments(rawSrc);
  if (!/from\s+["']\.\/internal-wallet-balance\.js["']/.test(src)) {
    errors.push("account-balance.routes.ts: does not import ./internal-wallet-balance.js");
  }
  if (!/deriveInternalWalletBalanceCents\s*\(/.test(src)) {
    errors.push("account-balance.routes.ts: GET /banking/accounts/:accountId/balance no longer calls deriveInternalWalletBalanceCents(...) for the non-Plaid fallback");
  }
}

function assertAll(files) {
  const errors = [];
  assertHelper(files.helper, errors);
  assertBankingRoutesWired(files.bankingRoutes, errors);
  assertLinkRoutesWired(files.linkRoutes, errors);
  assertAccountBalanceRoutesWired(files.accountBalanceRoutes, errors);
  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodHelper = `
    export async function withInternalWalletBalances() {}
    export async function deriveInternalWalletBalanceCents() {}
    const sql = "SELECT bank_account_id, SUM(CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END) FROM banking.bank_transactions WHERE plaid_item_id IS NULL";
  `;
  const badHelperNoSign = `
    export async function withInternalWalletBalances() {}
    export async function deriveInternalWalletBalanceCents() {}
    const sql = "SELECT SUM(amount_cents) FROM banking.bank_transactions WHERE plaid_item_id IS NULL";
  `;
  const goodBankingRoutes = `
    import { withInternalWalletBalances } from "./internal-wallet-balance.js";
    return withInternalWalletBalances(client, companyId, res.rows);
    const cashRes = await client.query(\`SELECT COALESCE(SUM(CASE WHEN ba.plaid_item_id IS NULL THEN (SELECT SUM(x) FROM banking.bank_transactions bt) ELSE ba.current_balance_cents END), 0)::bigint AS total_cash\`);
  `;
  const badBankingRoutes = `
    import { withInternalWalletBalances } from "./internal-wallet-balance.js";
    return withInternalWalletBalances(client, companyId, res.rows);
    const cashRes = await client.query(\`SELECT COALESCE(SUM(current_balance_cents), 0)::bigint AS total_cash FROM banking.bank_accounts\`);
  `;
  const goodLinkRoutes = `
    import { deriveInternalWalletBalanceCents, withInternalWalletBalances } from "../../banking/internal-wallet-balance.js";
    return withInternalWalletBalances(client, id, rows);
    const derivedCents = await deriveInternalWalletBalanceCents(client, id, row.id);
  `;
  const badLinkRoutes = `SELECT current_balance_cents, available_balance_cents FROM banking.bank_accounts WHERE id = $1`;
  const goodAccountBalance = `
    import { deriveInternalWalletBalanceCents } from "./internal-wallet-balance.js";
    balanceCents = await deriveInternalWalletBalanceCents(client, opId, bank.id);
  `;
  const badAccountBalance = `let balanceCents = Number(bank.current_balance_cents ?? 0);`;

  const goodFiles = { helper: goodHelper, bankingRoutes: goodBankingRoutes, linkRoutes: goodLinkRoutes, accountBalanceRoutes: goodAccountBalance };
  if (assertAll(goodFiles).length !== 0) {
    console.error("SELFTEST FAIL: good fixtures flagged", assertAll(goodFiles));
    process.exit(1);
  }
  const cases = [
    ["helper-no-sign", { ...goodFiles, helper: badHelperNoSign }],
    ["banking-routes-regressed", { ...goodFiles, bankingRoutes: badBankingRoutes }],
    ["link-routes-regressed", { ...goodFiles, linkRoutes: badLinkRoutes }],
    ["account-balance-regressed", { ...goodFiles, accountBalanceRoutes: badAccountBalance }],
  ];
  for (const [name, fx] of cases) {
    if (assertAll(fx).length === 0) {
      console.error(`SELFTEST FAIL: bad-${name} fixture not caught`);
      process.exit(1);
    }
  }
  console.log("verify-relay-wallet-balance-honesty selftest OK");
  process.exit(0);
}

for (const f of [HELPER, BANKING_ROUTES, LINK_ROUTES, ACCOUNT_BALANCE_ROUTES]) {
  if (!fs.existsSync(f)) {
    console.error(`GUARD FAIL: missing expected file ${f}`);
    process.exit(1);
  }
}

const errors = assertAll({
  helper: fs.readFileSync(HELPER, "utf8"),
  bankingRoutes: fs.readFileSync(BANKING_ROUTES, "utf8"),
  linkRoutes: fs.readFileSync(LINK_ROUTES, "utf8"),
  accountBalanceRoutes: fs.readFileSync(ACCOUNT_BALANCE_ROUTES, "utf8"),
});

if (errors.length) {
  console.error("GUARD FAIL — Relay Fuel Wallet balance must be derived from its bank_transactions ledger (QBO parity), not a frozen Plaid-only column:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-relay-wallet-balance-honesty OK — non-Plaid wallet balance derivation wired at every read surface, is_credit-keyed, Plaid accounts untouched");
