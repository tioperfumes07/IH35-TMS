#!/usr/bin/env node
/**
 * GUARD — verify-relay-stage1-no-new-gl-math (CONN-3 stage 1)
 *
 * WHAT THIS PROTECTS
 * Stage 1 of CONN-3 moves money from a company bank/card account into the prepaid Relay wallet. Both
 * sides are balance-sheet accounts; nothing touches P&L. That is exactly a transfer, and the system
 * already books transfers: `banking.transfers` + `postSourceTransaction('transfer')` debits the
 * destination's ledger account and credits the source's.
 *
 * The temptation is to write a bespoke relay-deposit poster. Doing so would mean a SECOND
 * implementation of double entry for a movement already expressible — and it would have to re-earn,
 * from scratch, the four things the transfer path already carries: the accounting-period lock, the
 * idempotency key, the reversal machinery, and the TRANSFER_GL_POSTING_ENABLED per-entity kill switch.
 * "Reuse the poster, write no new GL math" exists for precisely this case.
 *
 * WHAT IS ASSERTED
 *   1. the stage-1 service inserts a banking.transfers row and NEVER writes journal entries or
 *      postings directly;
 *   2. it refuses an unmapped funding card rather than guessing a credit side — guessing is how
 *      Amex-funded wallet loads landed in Faro Factoring Reserves;
 *   3. it only materialises 'company'-classified, 'settled' deposits, so an unidentified card (a
 *      possible owner loan or capital contribution — an owner ruling) and a canceled pre-auth (never
 *      money) can never be booked as company cash;
 *   4. it is idempotent on the Relay deposit id, so a re-run cannot fund the wallet twice;
 *   5. it does NOT backfill: no sweep over integrations.relay_deposits. The 104 historical company
 *      deposits are imported history, and posting them would book cash the TMS never witnessed into a
 *      period QuickBooks owns.
 *
 * METHOD: comments and string literals stripped before structural assertions. --selftest mutates the
 * REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-relay-stage1-no-new-gl-math";
const SVC = "apps/backend/src/integrations/relay-payments/relay-deposit-stage1-transfer.service.ts";
const INGEST = "apps/backend/src/integrations/relay-payments/relay-deposit-classifier.service.ts";

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

function check(raw, ingestRaw) {
  const errors = [];
  if (!raw) {
    errors.push(`${SVC}: missing — CONN-3 stage 1 has no materialiser.`);
    return errors;
  }
  const code = stripCommentsAndStrings(raw);
  const withStrings = stripCommentsOnly(raw);

  // 1. Reuses the transfer path; writes no GL itself.
  if (!/INSERT INTO banking\.transfers/i.test(withStrings)) {
    errors.push(`${SVC}: does not create a banking.transfers row — stage 1 must reuse the transfer poster.`);
  }
  for (const forbidden of ["accounting.journal_entries", "accounting.journal_entry_postings"]) {
    if (new RegExp(`INSERT INTO ${forbidden.replace(".", "\\.")}`, "i").test(withStrings)) {
      errors.push(
        `${SVC}: writes ${forbidden} directly. Stage 1 must express the wallet funding as a TRANSFER and ` +
          `let the existing engine post it — a second double-entry implementation would have to re-earn ` +
          `the period lock, idempotency, reversal and the TRANSFER_GL_POSTING_ENABLED kill switch.`
      );
    }
  }

  // 2. Refuses an unmapped card.
  if (!/card_unmapped/.test(withStrings)) {
    errors.push(
      `${SVC}: no refusal for a card with no funding account. Guessing a credit side is how Amex-funded ` +
        `wallet loads were posted into Faro Factoring Reserves.`
    );
  }

  // 3. Company + settled only.
  // Accept either quote style: the check that matters is that the literal "company" is compared
  // against classification. An earlier version of this assertion only matched single quotes and so
  // failed on correct source — a guard that cries wolf gets muted, which is worse than no guard.
  if (!/classification\s*!==\s*["'`]company["'`]/.test(withStrings)) {
    errors.push(`${SVC}: does not compare classification against "company" — a non-company deposit could be booked as company cash.`);
  }
  if (!/not_company_classified/.test(withStrings) || !/not_settled/.test(withStrings)) {
    errors.push(
      `${SVC}: lost the classification/status refusals — an unidentified card (possible owner loan or ` +
        `capital contribution) or a canceled pre-auth could be booked as company cash.`
    );
  }

  // 4. Idempotent on the deposit id.
  if (!/reference_number/.test(withStrings) || !/already_materialised/.test(withStrings)) {
    errors.push(`${SVC}: no idempotency on the Relay deposit id — a re-run could fund the wallet twice.`);
  }

  // 5. No backfill sweep.
  if (/FROM integrations\.relay_deposits[\s\S]{0,400}(LIMIT\s+\$?\d|ORDER BY)/i.test(withStrings) && !/deposit_id = \$2/.test(withStrings)) {
    errors.push(
      `${SVC}: appears to sweep integrations.relay_deposits. Stage 1 is going-forward only; the 104 ` +
        `historical company deposits are imported history and posting them would book cash the TMS never ` +
        `witnessed into a period QuickBooks owns.`
    );
  }
  // 6. The materialiser must be REACHED from ingest, and must never abort the deposit record. A
  //    deposit that cannot be booked (unmapped card, unclassified, canceled) must still be STORED and
  //    visible in the review queue — refusing to record it because we cannot yet book it would hide
  //    money from the owner, which is the opposite of the goal.
  const ingest = stripCommentsAndStrings(ingestRaw ?? "");
  if (!/materialiseRelayDepositAsTransfer\s*\(/.test(ingest)) {
    errors.push(
      `${INGEST}: does not call materialiseRelayDepositAsTransfer — stage 1 exists but is unreachable, ` +
        `so the wallet balance is still never established.`
    );
  } else if (!/try\s*\{[\s\S]{0,400}materialiseRelayDepositAsTransfer/.test(ingest)) {
    errors.push(
      `${INGEST}: calls the materialiser outside a try/catch — a stage-1 failure would abort the deposit ` +
        `upsert itself, hiding the deposit from the owner review queue entirely.`
    );
  }

  return errors;
}

function selftest() {
  const real = readFileSync(SVC, "utf8");
  const baseline = check(real, readFileSync(INGEST, "utf8"));
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["writes journal entries directly", (s) => s.replace("INSERT INTO banking.transfers", "INSERT INTO accounting.journal_entries")],
    ["unmapped card no longer refused", (s) => s.split("card_unmapped").join("card_ok")],
    ["classification refusal removed", (s) => s.split("not_company_classified").join("fine")],
    ["status refusal removed", (s) => s.split("not_settled").join("fine2")],
    ["idempotency removed", (s) => s.split("already_materialised").join("again")],
  ];
  // Ingest-side mutations run against the real ingest file, mutated separately.
  const ingestReal = readFileSync(INGEST, "utf8");
  const ingestMutations = [
    ["ingest no longer calls the materialiser", (t) => t.split("materialiseRelayDepositAsTransfer").join("noopStage1")],
  ];
  for (const [name, mutate] of ingestMutations) {
    const brokenIngest = mutate(ingestReal);
    if (brokenIngest === ingestReal) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(real, brokenIngest).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken, readFileSync(INGEST, "utf8")).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length + ingestMutations.length} mutations all detected (incl. ingest wiring).`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

let src = "";
try {
  src = readFileSync(SVC, "utf8");
} catch {
  src = "";
}
let ingestSrc = "";
try {
  ingestSrc = readFileSync(INGEST, "utf8");
} catch {
  ingestSrc = "";
}
const errors = check(src, ingestSrc);
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in CONN-3 stage 1:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — stage 1 books the wallet funding as a TRANSFER through the existing poster: no new ` +
    `GL math, no guessed credit side, no backfill, idempotent per deposit.`
);
