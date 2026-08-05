#!/usr/bin/env node
/**
 * GUARD — verify-bank-ledger-account-class-match
 *
 * THE DEFECT THIS ASSERTS — measured on prod, and it was silently accumulating when found
 * bank-feed-gl-posting.service.ts resolves the bank leg of every categorized bank transaction from
 * `banking.bank_accounts.ledger_account_id`. It failed closed when that bridge was NULL — and only
 * when it was NULL. It never asked whether the bridge pointed at a SENSIBLE account.
 *
 * On prod 2026-08-04 the "Business Platinum Card®" bank account (account_class='credit') had its
 * ledger_account_id pointing at catalogs.accounts QBO-1150040080 "Faro Factoring Reserves" — an
 * Asset/Savings row. Because the poster trusted the bridge verbatim, 120 categorized card purchases
 * CREDITED $41,191.86 to the factoring reserve between 2026-07-04 and 2026-08-04, where a card purchase
 * must instead CREDIT a card liability. Nothing threw. Nothing was flagged. The reserve balance — a
 * number the owner watches — was simply being drawn down by fuel spend.
 *
 * WHY A SHAPE CHECK AND NOT A DATA FIX
 * Which GL account represents a given card is a human decision (the owner ruled 2026-08-04 that
 * QBO-338 "Amex Card-" is a DIFFERENT card, so it is not a safe auto-target). Code cannot pick it. What
 * code CAN do is refuse to post through a bridge whose shape is impossible: a credit-class account must
 * bridge to a Liability, a depository account to an Asset. Refusing leaves the line categorized and
 * unposted — recoverable. Posting it wrong is not.
 *
 * WHAT IS ASSERTED
 *   1. the decision query still reads the bank account's class AND the bridged account's type — you
 *      cannot check a shape you did not select;
 *   2. the mismatch check exists and returns the dedicated skip reason rather than posting;
 *   3. 'bank_ledger_account_class_mismatch' is a member of the skip-reason union (so callers and
 *      dashboards can count it instead of it collapsing into a generic failure);
 *   4. the NULL-bridge check survives — the new check must ADD to it, never replace it.
 *
 * METHOD: comments and string literals are stripped before asserting structure (this header names every
 * symbol under test). --selftest mutates the REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-bank-ledger-account-class-match";
const SVC = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
function stripCommentsOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function check(raw) {
  const code = stripCommentsAndStrings(raw);
  const withStrings = stripCommentsOnly(raw);
  const errors = [];

  // 1. The shape data must actually be selected.
  if (!/ba\.account_class/.test(withStrings)) {
    errors.push(
      `${SVC}: the decision query no longer selects ba.account_class — without it the bank leg's shape ` +
        `cannot be validated and a credit card can post against an asset again`
    );
  }
  if (!/led\.account_type/.test(withStrings)) {
    errors.push(
      `${SVC}: the decision query no longer joins the bridged ledger account's type — the mismatch ` +
        `check would have nothing to compare`
    );
  }
  if (!/LEFT JOIN catalogs\.accounts led/i.test(withStrings)) {
    errors.push(`${SVC}: the join to the bridged ledger account (alias led) is gone`);
  }

  // 2. The check itself must exist and refuse to post.
  if (!/bank_ledger_account_class_mismatch/.test(withStrings)) {
    errors.push(
      `${SVC}: the class-mismatch refusal is gone — a bank account whose ledger_account_id points at the ` +
        `wrong account TYPE would post silently, exactly as the Amex/Faro-Reserves defect did`
    );
  }
  if (!/expectedType/.test(code)) {
    errors.push(`${SVC}: expectedType is not derived — there is no credit→Liability / depository→Asset rule left`);
  }
  if (!/liability/i.test(withStrings) || !/asset/i.test(withStrings)) {
    errors.push(
      `${SVC}: the expected-type mapping no longer names both liability and asset — one side of the ` +
        `rule has been dropped`
    );
  }

  // 3. Countability: the reason must be a real member of the union, not an ad-hoc string.
  const unionMatch = withStrings.match(/export type BankFeedGlSkipReason\s*=([\s\S]*?);/);
  if (!unionMatch) {
    errors.push(`${SVC}: BankFeedGlSkipReason union not found`);
  } else if (!/bank_ledger_account_class_mismatch/.test(unionMatch[1])) {
    errors.push(
      `${SVC}: 'bank_ledger_account_class_mismatch' is not in the BankFeedGlSkipReason union — the ` +
        `refusal would not be countable and would not typecheck as a reason`
    );
  }

  // 4. The original NULL-bridge guard must still be there; the new check ADDS to it.
  if (!/bank_account_ledger_unlinked/.test(withStrings)) {
    errors.push(
      `${SVC}: the NULL bank-ledger check was removed — an unlinked bank account would fall through ` +
        `instead of failing closed`
    );
  }
  return errors;
}

function selftest() {
  const real = readFileSync(SVC, "utf8");
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["account_class no longer selected", (s) => s.split("ba.account_class").join("ba.id")],
    ["bridged ledger type no longer selected", (s) => s.split("led.account_type").join("ba.id")],
    ["ledger join removed", (s) => s.replace("LEFT JOIN catalogs.accounts led", "LEFT JOIN catalogs.accounts other")],
    ["mismatch refusal removed", (s) => s.split("bank_ledger_account_class_mismatch").join("post_failed")],
    ["expected-type rule removed", (s) => s.split("expectedType").join("unusedVar")],
    ["NULL-bridge check removed", (s) => s.split("bank_account_ledger_unlinked").join("post_failed")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(SVC, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in the bank-leg bridge validation:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — a credit-class bank account must bridge to a Liability and a depository account to ` +
    `an Asset; a mismatched bridge refuses to post with a countable reason.`
);
