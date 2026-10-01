/**
 * LIVE PROOF — ROUND 313 BANK-SURF-04/ECON-04
 * Petty Cash recon session closed at $0 with service charge $5 + interest $5
 * posted through postReconciliationAdjustments → createJournalEntryOnClient.
 * Not a seed fixture: real USMCA session + JEs (void-not-delete if later reversed).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { postReconciliationAdjustments } from "../../apps/backend/src/banking/recon-adjustments.service.ts";
import { computeAdjustedBalanceSummary } from "../../apps/backend/src/banking/adjusted-balance-rec.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("OWNER_AUTH_ID required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], {
    stdio: "inherit",
  });
} catch {
  console.error(`${REQUIRED_AUTH_ID} rejected — see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PETTY = "1b9760dd-e7f1-452c-8b61-1d8f11269dd8";
const BANK_LEDGER = "15d0c12a-f755-4ecc-8f0b-c7441ce77399";
const FEE_ACCT = "de553cc4-160c-4dec-8256-dfb28e9d4989";
const INTEREST_ACCT = "6a0bf0cc-8dd5-418b-b6cc-1212120a744d";
const ACTOR = "00000000-0000-4000-8000-000000000001";

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  const today = new Date().toISOString().slice(0, 10);
  const sess = await client.query<{ id: string }>(
    `INSERT INTO banking.reconciliation_sessions (
        id, operating_company_id, bank_account_id, period_start, period_end,
        statement_balance_cents, beginning_balance_cents, status, created_at, updated_at
      ) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::date, $3::date, 0, 0, 'open', now(), now())
      RETURNING id::text`,
    [USMCA, PETTY, today]
  );
  const sessionId = sess.rows[0].id;

  const summary = computeAdjustedBalanceSummary({
    beginningBalanceCents: 0,
    statementEndingCents: 0,
    transactions: [],
    serviceChargeCents: 500,
    interestEarnedCents: 500,
  });
  if (summary.varianceCents !== 0) {
    throw new Error(`expected variance 0 got ${summary.varianceCents}`);
  }

  const posted = await postReconciliationAdjustments(
    client,
    {
      operating_company_id: USMCA,
      session_id: sessionId,
      bank_ledger_account_id: BANK_LEDGER,
      service_charge_cents: 500,
      service_charge_date: today,
      service_charge_account_id: FEE_ACCT,
      service_charge_journal_entry_id: null,
      interest_earned_cents: 500,
      interest_earned_date: today,
      interest_earned_account_id: INTEREST_ACCT,
      interest_earned_journal_entry_id: null,
    },
    { userId: ACTOR, role: "Owner" }
  );

  await client.query(
    `UPDATE banking.reconciliation_sessions SET
        status='reconciled', reconciled_at=now(), reconciled_by_user_id=$2::uuid,
        variance_cents=0, service_charge_cents=500, service_charge_date=$3::date,
        service_charge_account_id=$4::uuid, service_charge_journal_entry_id=$5::uuid,
        interest_earned_cents=500, interest_earned_date=$3::date,
        interest_earned_account_id=$6::uuid, interest_earned_journal_entry_id=$7::uuid,
        adjusted_bank_balance_cents=0, adjusted_book_balance_cents=0, updated_at=now()
      WHERE id=$1::uuid`,
    [
      sessionId,
      ACTOR,
      today,
      FEE_ACCT,
      posted.service_charge_journal_entry_id,
      INTEREST_ACCT,
      posted.interest_earned_journal_entry_id,
    ]
  );

  const check = await client.query(
    `SELECT status, variance_cents::int AS variance_cents,
            service_charge_cents::int AS service_charge_cents,
            interest_earned_cents::int AS interest_earned_cents,
            service_charge_journal_entry_id::text AS service_charge_je,
            interest_earned_journal_entry_id::text AS interest_je
       FROM banking.reconciliation_sessions WHERE id=$1::uuid`,
    [sessionId]
  );
  const jes = await client.query(
    `SELECT je.id::text, je.status, je.memo,
            (SELECT count(*)::int FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid=je.id) AS lines
       FROM accounting.journal_entries je
      WHERE je.id = ANY($1::uuid[])`,
    [[posted.service_charge_journal_entry_id, posted.interest_earned_journal_entry_id]]
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        session_id: sessionId,
        session: check.rows[0],
        journal_entries: jes.rows,
        variance_formula: summary.varianceCents,
      },
      null,
      2
    )
  );
  await client.query("COMMIT");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
