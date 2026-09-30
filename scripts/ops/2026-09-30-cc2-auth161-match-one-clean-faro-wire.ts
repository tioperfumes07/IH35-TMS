#!/usr/bin/env -S npx tsx
/**
 * AUTH-161 -- ROUND 282.7 item 1: match the ONE genuinely clean, unambiguous Faro wire-in bank
 * transaction to its factoring advance, through the sanctioned banking match engine.
 *
 * bank_transaction 3feba937-1aa5-463b-9ce7-054d404c1024 (2026-09-25, $4,161.00, for_review)
 *   <-> factoring_advance a925526e-b2cf-4513-98bf-40ed1cbb3f6d (FAC-2026-00138, faro_invoice 101,
 *       Bennett International Logistics, expected net $4,161.00 exactly -- zero variance)
 *
 * Two sanctioned calls, same order AUTH-134 used for the 8-clean-rows sweep:
 *   1. acceptMatchWithResolveDifference -- writes reconciliation_matches + audit, stamps
 *      review_state='matched' + matched_factoring_advance_id (zero variance -> no difference JE).
 *   2. postSourceTransactionInClientTx({source_transaction_type:'factoring_advance_deposit'}) --
 *      sweeps 1090 -> 1000 for this one advance.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth161-match-one-clean-faro-wire.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-161";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const BANK_TXN_ID = "3feba937-1aa5-463b-9ce7-054d404c1024";
const ADVANCE_ID = "a925526e-b2cf-4513-98bf-40ed1cbb3f6d";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  process.env.DATABASE_URL = url;
  const { acceptMatchWithResolveDifference } = await import(
    path.join(ROOT, "apps/backend/src/accounting/bank-recon/match.service.ts")
  );
  const { postSourceTransactionInClientTx } = await import(
    path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts")
  );

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const before = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1000', '1090')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("BEFORE:", before.rows);

    const btCheck = await client.query(
      `SELECT review_state, matched_factoring_advance_id FROM banking.bank_transactions WHERE id = $1 AND operating_company_id = $2`,
      [BANK_TXN_ID, USMCA]
    );
    if (btCheck.rows[0]?.review_state !== "for_review" || btCheck.rows[0]?.matched_factoring_advance_id) {
      throw new Error(`bank transaction not in expected for_review/unmatched state: ${JSON.stringify(btCheck.rows[0])}`);
    }

    console.log("Calling acceptMatchWithResolveDifference...");
    const matchResult = await (acceptMatchWithResolveDifference as any)({
      operating_company_id: USMCA,
      bank_transaction_id: BANK_TXN_ID,
      ledger_entry_kind: "factoring_advance",
      ledger_entry_id: ADVANCE_ID,
      difference_account_id: null,
      actor_user_uuid: ACTOR_USER_ID,
    }, client);
    console.log("Match result:", matchResult);
    if (matchResult.variance_cents !== 0) {
      throw new Error(`UNEXPECTED NONZERO VARIANCE ${matchResult.variance_cents} -- refusing, this was supposed to be exact`);
    }

    console.log("Calling postSourceTransactionInClientTx (factoring_advance_deposit sweep)...");
    const sweepResult = await postSourceTransactionInClientTx(
      client,
      { operating_company_id: USMCA, source_transaction_type: "factoring_advance_deposit", source_transaction_id: ADVANCE_ID },
      { userId: ACTOR_USER_ID }
    );
    console.log("Sweep result:", sweepResult);

    const after = await client.query(
      `SELECT a.account_number,
              COALESCE(SUM(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS balance_cents
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = a.id
         LEFT JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid AND je.voided_at IS NULL
        WHERE a.operating_company_id = $1 AND a.account_number IN ('1000', '1090')
        GROUP BY a.account_number ORDER BY a.account_number`,
      [USMCA]
    );
    console.log("AFTER (this transaction, before commit):", after.rows);

    const btAfter = await client.query(
      `SELECT review_state, matched_factoring_advance_id FROM banking.bank_transactions WHERE id = $1 AND operating_company_id = $2`,
      [BANK_TXN_ID, USMCA]
    );
    console.log("bank_transaction after:", btAfter.rows);

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
