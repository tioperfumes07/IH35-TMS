/**
 * ROUND 441.21-B R5 — CHAIN-05 Relay↔bank Match engine static checks.
 * Folded into verify-relay-tick-completes (R10) so orphan-guard census stays flat.
 *
 * Match = link only (no JE / no expense). Named refusals. Floor 2026-08-03. F442 wallet amount.
 */
import fs from "node:fs";
import path from "node:path";

const ENGINE = "apps/backend/src/accounting/bank-recon/relay-bank-match.service.ts";
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const TESTS = "apps/backend/src/accounting/bank-recon/__tests__/relay-bank-match.service.test.ts";

export function staticProblems(root) {
  const p = [];
  const engPath = path.join(root, ENGINE);
  const matchPath = path.join(root, MATCH);
  const testPath = path.join(root, TESTS);
  if (!fs.existsSync(engPath)) {
    p.push(`missing ${ENGINE}`);
    return p;
  }
  const eng = fs.readFileSync(engPath, "utf8");
  const match = fs.existsSync(matchPath) ? fs.readFileSync(matchPath, "utf8") : "";
  const tests = fs.existsSync(testPath) ? fs.readFileSync(testPath, "utf8") : "";

  if (!/journal_entry_created:\s*false/.test(eng)) {
    p.push("R5 engine must declare journal_entry_created: false (CHAIN-05 Match = link, no JE)");
  }
  if (!/expense_created:\s*false/.test(eng)) {
    p.push("R5 engine must declare expense_created: false (matching does not create an expense)");
  }
  if (!/pre_floor_fill/.test(eng) || !/RELAY_USMCA_DATA_FLOOR/.test(eng)) {
    p.push("R5 engine must refuse pre_floor_fill against RELAY_USMCA_DATA_FLOOR");
  }
  if (!/already_matched_to_bill/.test(eng) || !/matched_bill_id/.test(eng)) {
    p.push("R5 engine must refuse already_matched_to_bill and report the bill / line id");
  }
  if (!/account_cross_entity/.test(eng)) {
    p.push("R5 engine must refuse account_cross_entity");
  }
  if (!/zero_amount/.test(eng)) {
    p.push("R5 engine must refuse zero_amount");
  }
  if (!/reversePostedSourceTransactionInClientTx/.test(eng)) {
    p.push("R5 rematch must reverse via reversePostedSourceTransactionInClientTx (never void)");
  }
  if (!/relayWalletDrawdownCents|RELAY_FUEL_WALLET_AMOUNT_SQL/.test(eng)) {
    p.push("R5 engine must use F442 wallet drawdown (paid + sender_fee)");
  }
  if (!/RELAY_FUEL_WALLET_AMOUNT_SQL/.test(match)) {
    p.push("match.service loadLedgerAmountCents / candidates must use RELAY_FUEL_WALLET_AMOUNT_SQL (F442)");
  }
  if (!/wants\("relay_fuel"\)/.test(match) && !/wants\('relay_fuel'\)/.test(match)) {
    p.push("fetchLedgerCandidates must surface relay_fuel under !isCredit");
  }
  const requiredTests = [
    "exact single match links",
    "two candidates in window",
    "sender fee",
    "fill with no bank line",
    "bank line with no fill",
    "already_matched_to_bill",
    "account_cross_entity",
    "re-match",
    "zero_amount",
    "before 2026-08-03",
    "does NOT create",
  ];
  for (const name of requiredTests) {
    if (!new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(tests)) {
      p.push(`R5 tests missing coverage for: ${name}`);
    }
  }
  return p;
}
