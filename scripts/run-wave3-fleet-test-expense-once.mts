/**
 * WAVE 3 (INBOX-CC-1.md, 2026-08-21) — "create one labeled USMCA fleet operating expense ($1,200
 * TEST DATA) through the existing poster and prove a balanced JE."
 *
 * Creates a real accounting.expenses header + accounting.expense_lines row on a real, existing
 * USMCA unit (T149), tagged is_sample_data=true and memo-labeled TEST DATA (same convention as the
 * prior USMCA_GATEB_SAMPLE test expenses already on prod), then posts it through the EXISTING,
 * unchanged posting engine (postSourceTransactionInClientTx, source_transaction_type="expense") --
 * the exact same call shape already wired into apps/backend/src/accounting/expenses.routes.ts's own
 * POST /api/v1/expenses route. No new GL math.
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-fleet-test-expense-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-fleet-test-expense-once.mts --commit  # apply
 */
import pg from "pg";
import { withCompanyScope } from "../apps/backend/src/accounting/shared.js";
import { postSourceTransactionInClientTx, PostingEngineError } from "../apps/backend/src/accounting/posting-engine.service.js";
import { isEnabled } from "../apps/backend/src/lib/feature-flags/service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const UNIT_ID = "1a3c98da-1fb1-4302-8ca8-87e276a1aaa9"; // real USMCA unit T149
const CATEGORY_ACCOUNT_ID = "0310dda2-d0af-4557-b1e9-0f26bd2e75bf"; // 6150 Heavy Repair Expense
const PAYMENT_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // 1000 Bank of America - Operating (USMCA)
const AMOUNT_CENTS = 120000; // $1,200.00
const MEMO = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 fleet operating expense proof-of-path (unit T149, Heavy Repair Expense) -- labeled TEST DATA per INBOX-CC-1.md, is_sample_data=true, excluded from real financial totals.";

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string.");
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const unit = await client.query(`SELECT id, unit_number FROM mdata.units WHERE id = $1::uuid`, [UNIT_ID]);
    console.log("BEFORE — target unit:", unit.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    const result = await withCompanyScope(ACTOR_USER_UUID, USMCA, async (c: any) => {
      const expRes = await c.query(
        `
          INSERT INTO accounting.expenses (
            operating_company_id, status, transaction_date, total_amount_cents, is_sample_data,
            memo, payment_account_uuid, unit_id, created_by_user_id
          )
          VALUES ($1, 'posted', CURRENT_DATE, $2, true, $3, $4, $5, $6)
          RETURNING id
        `,
        [USMCA, AMOUNT_CENTS, MEMO, PAYMENT_ACCOUNT_ID, UNIT_ID, ACTOR_USER_UUID]
      );
      const expenseId = String(expRes.rows[0]?.id ?? "");
      if (!expenseId) throw new Error("expense_create_failed");

      await c.query(
        `
          INSERT INTO accounting.expense_lines (
            operating_company_id, expense_id, line_sequence, amount, description, amount_cents,
            expense_account_uuid, load_required
          )
          VALUES ($1, $2, 1, $3, $4, $5, $6, false)
        `,
        [USMCA, expenseId, AMOUNT_CENTS / 100, "Heavy Repair Expense -- TEST DATA (WAVE3 proof-of-path)", AMOUNT_CENTS, CATEGORY_ACCOUNT_ID]
      );

      const flagOn = await isEnabled(c, "EXPENSE_GL_POSTING_ENABLED", { operating_company_id: USMCA, user_uuid: ACTOR_USER_UUID });
      console.log("EXPENSE_GL_POSTING_ENABLED for USMCA:", flagOn);
      if (!flagOn) throw new Error("expense_gl_posting_flag_off_cannot_prove_je");

      let journalEntryId: string | null = null;
      try {
        const posting = await postSourceTransactionInClientTx(
          c,
          { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: ACTOR_USER_UUID }
        );
        journalEntryId = posting.journal_entry_id;
        await c.query(
          `UPDATE accounting.expenses SET posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
           WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
          [expenseId, journalEntryId, USMCA]
        );
      } catch (err) {
        if (err instanceof PostingEngineError) {
          console.error("POSTING ENGINE ERROR (expense row still exists, unposted):", err.message);
          throw err;
        }
        throw err;
      }

      return { expenseId, journalEntryId };
    });

    console.log("RESULT:", result);

    const je = await client.query(
      `SELECT p.account_id::text, ca.account_name, p.debit_or_credit, p.amount_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts ca ON ca.id = p.account_id
        WHERE p.journal_entry_uuid = $1::uuid
        ORDER BY p.line_sequence`,
      [result.journalEntryId]
    );
    console.log("JE POSTINGS:", je.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
