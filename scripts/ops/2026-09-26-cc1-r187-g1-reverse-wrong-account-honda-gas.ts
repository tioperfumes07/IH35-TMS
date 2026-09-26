/**
 * SELF-CORRECTION: ROUND 202 items a/b (this session's own AUTH-046) posted the two missing $10.00
 * Honda pickup gas expenses (settlements 5805/5808, loads 13582/13597) Dr 5000 Fuel & Diesel / Cr the
 * driver's 2175 leaf. That is WRONG per R-187's own G1 spec (the document I had already read this
 * session), which explicitly says: "These are the Honda pickup's gasoline (closed doc §7: Company
 * Vehicle Fuel, NOT 5000 and NOT an IFTA gallon) ... Account: if no 'Company Vehicle Fuel' item/
 * account exists in USMCA -> BLOCKED line to the Lead (do not invent a number)." Confirmed live: no
 * such account exists in USMCA's chart. The credit side (2175-<driver>) was correct; only the debit
 * account was wrong.
 *
 * This script reverses ONLY those two JEs (void-never-delete: reversePostedSourceTransactionInClientTx
 * + the expense header flipped to status='void'/posting_status='reversed', same shape the live void
 * route uses) and stops there -- it does NOT repost to a new account, since G1's own spec forbids
 * inventing one. The correct account must be created by Lead/owner ruling first; G1 stays BLOCKED
 * until then.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const VOID_REASON = "R-187 G1 self-correction: posted to 5000 Fuel & Diesel, but G1's own spec requires a distinct 'Company Vehicle Fuel' account (NOT 5000) that does not yet exist in USMCA's chart -- reversing rather than leaving a wrong-account JE live; G1 stays BLOCKED pending Lead/owner account creation.";

const EXPENSE_IDS = [
  "0db68e11-b09a-4254-aff8-815835ca47fc", // 13582-4
  "2e63d46c-e47f-4457-9514-5d0e97df1008", // 13597-4
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const { reversePostedSourceTransactionInClientTx } = await import("../../apps/backend/src/accounting/posting-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      for (const expenseId of EXPENSE_IDS) {
        const before = await client.query<{ status: string; posting_status: string; journal_entry_id: string | null }>(
          `SELECT status, posting_status, journal_entry_id::text FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [expenseId, USMCA_ID]
        );
        if (!before.rows[0]) throw new Error(`STOP: ${expenseId} not found`);
        if (before.rows[0].status !== "posted" || before.rows[0].posting_status !== "posted" || !before.rows[0].journal_entry_id) {
          throw new Error(`STOP: ${expenseId} not in the expected posted shape: ${JSON.stringify(before.rows[0])}`);
        }

        const rev = await reversePostedSourceTransactionInClientTx(
          client as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: SYSTEM_ACTOR_USER_ID },
          todayIso()
        );

        await client.query(
          `UPDATE accounting.expenses
              SET status='void',
                  posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
                  reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
                  voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
          [expenseId, rev.journal_entry_id, SYSTEM_ACTOR_USER_ID, VOID_REASON, USMCA_ID]
        );

        await appendCrudAudit(
          client as never,
          SYSTEM_ACTOR_USER_ID,
          "expense.voided",
          { expense_id: expenseId, reversing_journal_entry_id: rev.journal_entry_id, reason: VOID_REASON },
          "warning",
          "R-187-G1-SELF-CORRECTION"
        );

        results.push({ expense_id: expenseId, reversing_journal_entry_id: rev.journal_entry_id });
      }

      await client.query("COMMIT");
      console.log(JSON.stringify(results, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
