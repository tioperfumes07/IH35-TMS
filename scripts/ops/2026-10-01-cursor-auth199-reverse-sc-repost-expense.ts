/**
 * AUTH-199 — reverse handwritten recon service-charge JE cf78c2aa and re-post as expense.
 *
 * Lead ruling 2026-10-01 17:20Z / ORDERS CURSOR #1:
 *   reverse cf78c2aa through reverseJournalEntryNoFlip → null session SC JE FK →
 *   postReconciliationAdjustments (expense engine) → stamp session expense + JE FKs.
 *
 * Interest JE 2ef10657 stays (income, not a cost).
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-199 DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cursor-auth199-reverse-sc-repost-expense.ts
 * Rehearse first on a throwaway Neon branch (set DATABASE_URL to the branch).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.ts";
import { postReconciliationAdjustments } from "../../apps/backend/src/banking/recon-adjustments.service.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REHEARSAL = process.env.REHEARSAL === "1";
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;

if (!REHEARSAL) {
  if (!REQUIRED_AUTH_ID) {
    console.error("OWNER_AUTH_ID required (or REHEARSAL=1 on a throwaway Neon branch).");
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
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SESSION_ID = "7a7d1da9-aa5b-4de7-b133-fe529dbde3c2";
const SC_JE = "cf78c2aa-f78c-497d-9062-4e4ba9eb3100";
const BANK_LEDGER = "15d0c12a-f755-4ecc-8f0b-c7441ce77399";
const FEE_ACCT = "de553cc4-160c-4dec-8256-dfb28e9d4989";
const BANK_ACCOUNT = "1b9760dd-e7f1-452c-8b61-1d8f11269dd8";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // USMCA Owner (live)

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  if (REHEARSAL) {
    await assertNotProduction(client, {
      label: "scripts/ops/2026-10-01-cursor-auth199-reverse-sc-repost-expense.ts",
    });
  } else {
    await assertIsIntendedProduction(client, {
      label: "scripts/ops/2026-10-01-cursor-auth199-reverse-sc-repost-expense.ts",
    });
  }
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  const je = await client.query<{
    id: string;
    voided: boolean;
    reversed_by: string | null;
    entry_date: string;
  }>(
    `SELECT id::text, voided_at IS NOT NULL AS voided, reversed_by_je_id::text AS reversed_by, entry_date::text
       FROM accounting.journal_entries
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1`,
    [SC_JE, USMCA]
  );
  if (!je.rows[0]) throw new Error(`SC JE ${SC_JE} not found`);
  if (je.rows[0].voided) throw new Error(`SC JE ${SC_JE} already voided`);

  let reversalId: string | null = je.rows[0].reversed_by;
  if (!reversalId) {
    const rev = await reverseJournalEntryNoFlip(client as never, {
      operatingCompanyId: USMCA,
      journalEntryId: SC_JE,
      reason: "AUTH-199: handwritten recon service-charge JE → expense document (Lead 17:20Z)",
      actorUserId: ACTOR,
    });
    reversalId = rev.reversal.reversal_journal_entry_id;
  }

  await client.query(
    `UPDATE banking.reconciliation_sessions
        SET service_charge_journal_entry_id = NULL,
            service_charge_expense_id = NULL,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [SESSION_ID, USMCA]
  );

  const sess = await client.query<{
    service_charge_cents: string;
    service_charge_date: string | null;
    service_charge_account_id: string | null;
  }>(
    `SELECT service_charge_cents::text, service_charge_date::text, service_charge_account_id::text
       FROM banking.reconciliation_sessions
      WHERE id = $1::uuid
      LIMIT 1`,
    [SESSION_ID]
  );
  const row = sess.rows[0];
  if (!row) throw new Error(`session ${SESSION_ID} not found`);
  const scCents = Number(row.service_charge_cents);
  if (scCents !== 500) throw new Error(`expected SC 500 cents, got ${scCents}`);

  const posted = await postReconciliationAdjustments(
    client as never,
    {
      operating_company_id: USMCA,
      session_id: SESSION_ID,
      bank_ledger_account_id: BANK_LEDGER,
      bank_account_id: BANK_ACCOUNT,
      service_charge_cents: scCents,
      service_charge_date: row.service_charge_date ?? je.rows[0].entry_date,
      service_charge_account_id: row.service_charge_account_id ?? FEE_ACCT,
      service_charge_journal_entry_id: null,
      service_charge_expense_id: null,
      interest_earned_cents: 0,
      interest_earned_date: null,
      interest_earned_account_id: null,
      interest_earned_journal_entry_id: null,
    },
    { userId: ACTOR, role: "Owner" }
  );

  if (!posted.service_charge_expense_id || !posted.service_charge_journal_entry_id) {
    throw new Error("expense re-post returned null expense/JE id");
  }

  await client.query(
    `UPDATE banking.reconciliation_sessions
        SET service_charge_journal_entry_id = $2::uuid,
            service_charge_expense_id = $3::uuid,
            updated_at = now()
      WHERE id = $1::uuid`,
    [SESSION_ID, posted.service_charge_journal_entry_id, posted.service_charge_expense_id]
  );

  const proof = await client.query<{
    expense_id: string;
    journal_entry_id: string;
    has_expense_row: boolean;
  }>(
    `SELECT e.id::text AS expense_id, e.journal_entry_id::text, true AS has_expense_row
       FROM accounting.expenses e
      WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid`,
    [posted.service_charge_expense_id, USMCA]
  );

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        ok: true,
        auth: REQUIRED_AUTH_ID,
        reversed_je: SC_JE,
        reversal_je: reversalId,
        expense_id: posted.service_charge_expense_id,
        expense_journal_entry_id: posted.service_charge_journal_entry_id,
        session_id: SESSION_ID,
        proof: proof.rows[0] ?? null,
      },
      null,
      2
    )
  );
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
