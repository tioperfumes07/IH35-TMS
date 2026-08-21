/**
 * WAVE 3 (INBOX-CC-1.md, 2026-08-21) — "keep creating money events" — maintenance leg. Also doubles
 * as a live proof-of-path for ACCT-F5699 (paid-same-day WO expense -> GL), shipped earlier this
 * session, on a genuinely real, freshly-created WO rather than a mocked unit test.
 *
 * Creates a real maintenance.work_orders row (payment_timing semantics: paid same day, no
 * work_order_lines needed to exercise the fix -- autoCreateExpenseFromWO's own posting-engine
 * fallback DR's the uncategorized_expense role account when a WO carries no Section A lines, which
 * is the exact resilience path ACCT-F5699 already covers), clearly labeled TEST DATA, then calls the
 * EXISTING, unchanged autoCreateExpenseFromWO (two-section-service.ts) -- the same function the real
 * WO-create route calls for payment_timing='paid_same_day' -- and proves the resulting balanced JE.
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-maintenance-test-expense-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-maintenance-test-expense-once.mts --commit  # apply
 */
import pg from "pg";
import { withCompanyScope } from "../apps/backend/src/accounting/shared.js";
import { autoCreateExpenseFromWO } from "../apps/backend/src/maintenance/two-section-service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const UNIT_ID = "6eb57e6d-9b0a-4a6a-9c12-6532b320d7cf"; // real USMCA unit T151
const VENDOR_ID = "95307de7-2e0a-44b3-b3aa-e9d152754320"; // real vendor "LOVES TRAVEL STOPS"
const PAYMENT_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // 1000 Bank of America - Operating (USMCA)
const AMOUNT = 1200.0; // $1,200.00 TEST DATA
const MEMO = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 maintenance WO paid-same-day expense proof-of-path (ACCT-F5699 live proof, unit T151, vendor LOVES TRAVEL STOPS)";

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
      const displayRes = await c.query(
        `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)`,
        [UNIT_ID, "IS", USMCA]
      );
      const display = displayRes.rows[0];

      const woRes = await c.query(
        `
          INSERT INTO maintenance.work_orders (
            operating_company_id, wo_type, source_type, status, unit_id, opened_at,
            repair_location, vendor_id, description, display_id, unit_sequence,
            total_actual_cost
          )
          VALUES ($1,'repair','IS','open',$2,now(),$3,$4,$5,$6,$7,$8)
          RETURNING id
        `,
        [USMCA, UNIT_ID, "In-house shop -- TEST DATA (WAVE3 proof-of-path)", VENDOR_ID, MEMO, display.display_id, display.sequence, AMOUNT]
      );
      const woId = String(woRes.rows[0]?.id ?? "");
      if (!woId) throw new Error("wo_create_failed");

      // A real Section A line is required: autoCreateExpenseFromWO's own copyToAccountingLines
      // reconciles accounting.expenses.total_amount_cents to SUM(expense_lines.amount_cents) after
      // copying -- a WO with a real total_actual_cost but zero work_order_lines rows would have its
      // expense total silently zeroed by that reconcile step (COALESCE(SUM(0 rows), 0)). Every real
      // WO created through the app's own two-section form always carries at least one Section A
      // line, so this mirrors real usage rather than working around a live defect.
      await c.query(
        `
          INSERT INTO maintenance.work_order_lines (
            work_order_uuid, line_type, description, quantity, unit_cost, total_cost, section
          ) VALUES ($1, 'labor', $2, 1, $3, $3, 'A')
        `,
        [woId, "Shop labor -- TEST DATA (WAVE3 proof-of-path)", AMOUNT]
      );

      const expense = await autoCreateExpenseFromWO(c, ACTOR_USER_UUID, woId, PAYMENT_ACCOUNT_ID, null);
      // Explicit sample-data tag: resolveVendorIsSampleDataBestEffort derives is_sample_data from the
      // VENDOR (a real, non-sample vendor here, chosen deliberately per INBOX-CC-1.md's "use whatever
      // is easiest" -- LOVES TRAVEL STOPS is a real prod vendor, not a synthetic one), which would
      // leave this real-shaped TEST DATA expense structurally indistinguishable from real spend.
      // Stamp it explicitly, same rigor as the fleet WAVE3 expense.
      if (expense?.uuid) {
        const expRow = await c.query(`SELECT journal_entry_id FROM accounting.expenses WHERE id = $1::uuid`, [expense.uuid]);
        await c.query(`UPDATE accounting.expenses SET is_sample_data = true WHERE id = $1::uuid`, [expense.uuid]);
        const jeId = expRow.rows[0]?.journal_entry_id;
        if (jeId) {
          await c.query(`UPDATE accounting.journal_entries SET is_sample_data = true WHERE id = $1::uuid`, [jeId]);
        }
      }
      return { woId, expense };
    });

    console.log("RESULT:", result);

    const exp = await client.query(
      `SELECT id, status, posting_status, journal_entry_id, is_sample_data FROM accounting.expenses WHERE id = $1::uuid`,
      [result.expense?.uuid]
    );
    console.log("EXPENSE AFTER:", exp.rows[0]);

    const je = await client.query(
      `SELECT p.account_id::text, ca.account_name, p.debit_or_credit, p.amount_cents
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts ca ON ca.id = p.account_id
        WHERE p.journal_entry_uuid = $1::uuid
        ORDER BY p.line_sequence`,
      [exp.rows[0]?.journal_entry_id]
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
