#!/usr/bin/env node
/**
 * GO-CLOSE-188 CC-1 DEFECT A -- static-shape guard.
 *
 * INVESTIGATION FINDING: "customer payments never debit cash" is real, but not in the way the board
 * row implied. buildCustomerPaymentLines (posting-engine.service.ts) already correctly posts Dr
 * Undeposited Funds / Cr AR for every eligible payment -- confirmed live, all 7 real USMCA paid/partial
 * invoices have a balanced customer_payment JE. The actual gap: nothing ever swept that balance out of
 * Undeposited Funds into the REAL bank register (the account bank reconciliation actually reconciles),
 * because the only place that learns "this money really arrived at this real bank account" -- the
 * bank-recon MATCH -- never posted the second leg.
 *
 * This guard confirms the fix: a new "customer_payment_deposit" posting source type (Dr the matched
 * bank's ledger_account_id / Cr the payment's original holding account) wired to fire once, inside
 * match.service.ts's existing transaction, at the moment a payment is matched to its real
 * bank_transaction -- reusing postSourceTransactionInClientTx (same idempotency + period-close guard +
 * balance assertion every other poster gets), with a narrow, explicit skip list (never fails the match
 * itself for an ineligible-but-expected case; any OTHER error still surfaces).
 */
import { readFileSync } from "node:fs";

const ENGINE_FILE = "apps/backend/src/accounting/posting-engine.service.ts";
const MATCH_FILE = "apps/backend/src/accounting/bank-recon/match.service.ts";

function analyze(engine, match) {
  const failures = [];

  if (!/"customer_payment_deposit",/.test(engine)) {
    failures.push(`${ENGINE_FILE}: "customer_payment_deposit" not registered in POSTING_SOURCE_TYPES`);
  }
  if (!/async function buildCustomerPaymentDepositSweepLines\(/.test(engine)) {
    failures.push(`${ENGINE_FILE}: buildCustomerPaymentDepositSweepLines is missing`);
  }
  if (!/if \(sourceType === "customer_payment_deposit"\) return buildCustomerPaymentDepositSweepLines/.test(engine)) {
    failures.push(`${ENGINE_FILE}: buildPostingDraft does not dispatch to the deposit-sweep builder`);
  }
  if (!/account_id: bankLedgerAccountId,\s*\n\s*debit_or_credit: "debit"/.test(engine)) {
    failures.push(`${ENGINE_FILE}: deposit-sweep does not debit the real bank ledger account`);
  }
  if (!/account_id: holdingAccount,\s*\n\s*debit_or_credit: "credit"/.test(engine)) {
    failures.push(`${ENGINE_FILE}: deposit-sweep does not credit the holding account`);
  }
  if (!/if \(holdingAccount === bankLedgerAccountId\)/.test(engine)) {
    failures.push(`${ENGINE_FILE}: deposit-sweep does not no-op when the payment already posted straight to the matched bank`);
  }

  if (!/import\s*\{\s*ensureOpenPeriod,\s*postSourceTransactionInClientTx,\s*PostingEngineError\s*\}\s*from\s*"\.\.\/posting-engine\.service\.js"/.test(match)) {
    failures.push(`${MATCH_FILE}: does not import postSourceTransactionInClientTx + PostingEngineError from posting-engine.service.js`);
  }
  if (!/source_transaction_type: "customer_payment_deposit"/.test(match)) {
    failures.push(`${MATCH_FILE}: does not call the deposit-sweep poster on match accept`);
  }
  if (!/"DEPOSIT_ALREADY_AT_BANK"/.test(match) || !/"PAYMENT_NOT_POSTING_ELIGIBLE"/.test(match)) {
    failures.push(`${MATCH_FILE}: skippable-error list is missing the expected no-op codes`);
  }
  if (!/if \(!\(sweepError instanceof PostingEngineError\) \|\| !skippable\.includes\(sweepError\.code\)\) \{\s*\n\s*throw sweepError;/.test(match)) {
    failures.push(`${MATCH_FILE}: an unexpected sweep error is not re-thrown (would silently swallow a real posting failure)`);
  }

  return failures;
}

function readAll() {
  return {
    engine: readFileSync(ENGINE_FILE, "utf8"),
    match: readFileSync(MATCH_FILE, "utf8"),
  };
}

function selftest() {
  const { engine, match } = readAll();
  const good = analyze(engine, match);
  if (good.length > 0) {
    console.error("verify-acct-defect-a-deposit-sweep-wired --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "posting-engine loses the customer_payment_deposit source type",
      apply: (e, m) => [e.replace('"customer_payment_deposit",\n', ""), m],
    },
    {
      name: "posting-engine loses the buildPostingDraft dispatch",
      apply: (e, m) => [
        e.replace(
          'if (sourceType === "customer_payment_deposit") return buildCustomerPaymentDepositSweepLines(client, operatingCompanyId, sourceId);\n',
          ""
        ),
        m,
      ],
    },
    {
      name: "match.service.ts loses the deposit-sweep call",
      apply: (e, m) => [e, m.replace('source_transaction_type: "customer_payment_deposit",', 'source_transaction_type: "transfer",')],
    },
    {
      name: "match.service.ts's skippable list drops DEPOSIT_ALREADY_AT_BANK",
      apply: (e, m) => [e, m.replace('"DEPOSIT_ALREADY_AT_BANK",\n', "")],
    },
    {
      name: "match.service.ts silently swallows ANY sweep error (never re-throws)",
      apply: (e, m) => [
        e,
        m.replace(
          "if (!(sweepError instanceof PostingEngineError) || !skippable.includes(sweepError.code)) {\n          throw sweepError;\n        }",
          "// swallowed"
        ),
      ],
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const [mutatedEngine, mutatedMatch] = mut.apply(engine, match);
    const failures = analyze(mutatedEngine, mutatedMatch);
    if (failures.length === 0) {
      console.error(`verify-acct-defect-a-deposit-sweep-wired --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { engine, match } = readAll();
  const failures = analyze(engine, match);
  if (failures.length > 0) {
    console.error("verify-acct-defect-a-deposit-sweep-wired: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-acct-defect-a-deposit-sweep-wired: OK -- customer_payment_deposit sweep posts Dr real bank / Cr holding account, fired on bank-recon match, with a narrow explicit skip list"
  );
}
