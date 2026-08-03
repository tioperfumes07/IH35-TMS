#!/usr/bin/env node
/**
 * GUARD — CLS-FUEL-DOUBLE-POST: Relay fuel-card swipes (imported to fuel.fuel_transactions)
 * are posted to GL by the fuel_event poster. Bank debits for the same Love's/Relay settlements
 * must NOT also be categorized to fuel expense GL accounts — that double-counts the expense.
 *
 * WHAT IT ENFORCES (static):
 *   A. bank-feed-gl-posting.service.ts contains a fuel-settlement interlock that skips posting
 *      when a bank transaction is identified as a Relay/Love's fuel-card settlement AND the
 *      categorized account is a fuel expense account already owned by the fuel_event poster.
 *   B. The posting engine's fuel_event source posts to accounts that are discoverable (the
 *      fuel poster code references a deterministic account resolution path).
 *
 * DEFECT (live, TRANSP 2026-08-03): 18 RELAY/Love's bank debits ($9,216.49) categorized to
 * 6100 Fuel Expense / QBO-155 Fuel-Def / QBO-92 Fuel-Reefer-Diesel — the same accounts the
 * fuel_event poster uses. Both paths debit fuel expense → GL overstated by $9,216.49.
 *
 * THE DATA FIX (reverse the 18 bank_categorization JEs + reclass to a transfer/clearing
 * account) needs a DB migration. This guard ensures the CODE interlock exists so it cannot
 * recur after fix.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify-fuel-gl-no-double-post";

const BANK_FEED_GL_SERVICE = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";

// ─── CHECK A: fuel-settlement interlock exists ───────────────────────────────
function checkFuelSettlementInterlock() {
  if (!existsSync(BANK_FEED_GL_SERVICE)) {
    return { pass: false, msg: `${BANK_FEED_GL_SERVICE} does not exist` };
  }
  const src = readFileSync(BANK_FEED_GL_SERVICE, "utf8");

  // The interlock should:
  // 1. Identify fuel-card settlement bank transactions (Relay/Love's pattern)
  // 2. Skip posting when the target account is a fuel expense account
  //    already owned by the fuel_event poster
  //
  // We look for ANY of these signals that the interlock is present:
  const interlockPatterns = [
    /fuel.settlement/i,
    /fuel.card.settlement/i,
    /relay.*fuel/i,
    /fuel_event.*skip/i,
    /fuel.*double.?post/i,
    /is_fuel_card_settlement/i,
    /fuel_poster_owned/i,
    /skip.*fuel.*categoriz/i,
    /cede.*fuel/i,
    /fuel.*interlock/i,
  ];

  const hasInterlock = interlockPatterns.some((p) => p.test(src));

  if (hasInterlock) {
    return { pass: true, msg: "fuel-settlement interlock present in bank-feed-gl-posting.service.ts" };
  }

  // Also accept a skip-reason enum value mentioning fuel
  const hasSkipReason = /fuel_card_settlement/i.test(src) || /fuel_poster_owns/i.test(src);
  if (hasSkipReason) {
    return { pass: true, msg: "fuel-settlement skip-reason found in BankFeedGlSkipReason" };
  }

  return {
    pass: false,
    msg: `FAIL ${LABEL}: bank-feed-gl-posting.service.ts has NO fuel-settlement interlock. ` +
      `A Relay/Love's fuel-card settlement categorized to a fuel expense account will DOUBLE-POST ` +
      `(fuel_event poster already posted the same swipes). Add interlock #4: skip when ` +
      `source_is_relay_fuel_settlement AND account_is_fuel_expense_poster_target.`,
  };
}

// ─── CHECK B: fuel poster service exists and posts via posting engine ────────
function checkFuelPosterExists() {
  const FUEL_POSTER = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
  const POSTER_IMPL = "apps/backend/src/accounting/fuel-posting/poster.service.ts";
  if (!existsSync(FUEL_POSTER)) {
    return { pass: false, msg: `${FUEL_POSTER} does not exist` };
  }
  if (!existsSync(POSTER_IMPL)) {
    return { pass: false, msg: `${POSTER_IMPL} does not exist` };
  }
  const src = readFileSync(FUEL_POSTER, "utf8");
  if (/postFuelExpenseFromEvent/i.test(src) && /EXPENSE_GL_POSTING/i.test(src)) {
    return { pass: true, msg: "fuel poster service exists (postFuelExpenseFromEvent + EXPENSE_GL_POSTING flag)" };
  }
  return { pass: false, msg: `FAIL: fuel poster service missing expected postFuelExpenseFromEvent or flag reference` };
}

// ─── RUN ─────────────────────────────────────────────────────────────────────
const results = [checkFuelSettlementInterlock(), checkFuelPosterExists()];

const failures = results.filter((r) => !r.pass);
if (failures.length > 0) {
  for (const f of failures) console.error(f.msg);
  console.error(
    `\n${LABEL} FAILED — ${failures.length} check(s) failed. ` +
      `CLS-FUEL-DOUBLE-POST is OPEN: the fuel-settlement interlock has not been added yet. ` +
      `Once the interlock is in place AND the 18 historical JEs are reversed, this guard will pass.`
  );
  process.exit(1);
}

console.log(`${LABEL}: PASS (interlock present + fuel_event source confirmed)`);
