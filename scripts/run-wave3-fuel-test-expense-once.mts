/**
 * WAVE 3 (INBOX-CC-1.md, 2026-08-21) — "keep creating money events" — fuel leg (3/4).
 *
 * Creates a real, clearly TEST-DATA-labeled USMCA fuel.fuel_transactions row (manual entry, unit
 * T150, load-exempt since no real dispatched load is wired into this proof), then calls the
 * EXISTING, unchanged postFuelExpenseFromEvent (accounting/fuel-posting/poster.service.ts) directly
 * -- the same poster the real POST /api/v1/fuel/transactions route calls via
 * flushFuelGlPostsAfterCommit -- and proves the resulting balanced JE.
 *
 * fuel.fuel_transactions carries no is_sample_data column (confirmed live/via schema read), so the
 * TEST DATA label lives in `notes`; the resulting JE is explicitly stamped is_sample_data=true after
 * the poster call (the poster itself hardcodes false for real fuel events, matching ACCT-F212's
 * policy -- this script overrides that stamp afterward for this specific TEST row only).
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-fuel-test-expense-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-wave3-fuel-test-expense-once.mts --commit  # apply
 */
import pg from "pg";
import { postFuelExpenseFromEvent } from "../apps/backend/src/accounting/fuel-posting/poster.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const UNIT_ID = "bf353dfc-0cfb-4a85-bb51-72869d558b57"; // real USMCA unit T150
const GALLONS = 120;
const PRICE_PER_GALLON = 4.0;
const TOTAL_COST = GALLONS * PRICE_PER_GALLON; // $480.00 TEST DATA
const NOTES = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 fuel proof-of-path (unit T150, manual entry, load-exempt: no real dispatched load wired into this proof)";
const MEMO = "WAVE3_TEST_DATA_2026-08-21 -- CC-1 fuel WAVE3 proof-of-path, unit T150";

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

    const fuelRow = await client.query<{ id: string; transaction_at: string }>(
      `
        INSERT INTO fuel.fuel_transactions (
          operating_company_id, transaction_at, purchased_at, unit_id, fuel_type,
          gallons, price_per_gallon, total_cost, source, load_required, load_exemption_reason,
          notes, created_by_user_id
        )
        VALUES ($1,now(),now(),$2,'diesel',$3,$4,$5,'manual',false,$6,$7,$8)
        RETURNING id, transaction_at::text
      `,
      [USMCA, UNIT_ID, GALLONS, PRICE_PER_GALLON, TOTAL_COST, NOTES, NOTES, ACTOR_USER_UUID]
    );
    const fuelTxnId = fuelRow.rows[0]?.id;
    const transactionAt = fuelRow.rows[0]?.transaction_at;
    if (!fuelTxnId) throw new Error("fuel_transaction_insert_failed");

    const result = await postFuelExpenseFromEvent({
      operating_company_id: USMCA,
      actor_user_id: ACTOR_USER_UUID,
      fuel_event_id: fuelTxnId,
      fuel_kind: "diesel",
      posted_at: transactionAt,
      amount_cents: Math.round(TOTAL_COST * 100),
      posting_path: "company_direct",
      company_direct_credit: "cash",
      unit_id: UNIT_ID,
      memo: MEMO,
    });
    console.log("RESULT:", result);

    // Explicit sample-data tag: postFuelExpenseFromEvent hardcodes is_sample_data=false on every JE it
    // creates (fuel.fuel_transactions carries no is_sample_data column of its own to derive from) —
    // override for this specific TEST-DATA row so it isn't structurally indistinguishable from real fuel
    // spend, same rigor as the fleet/maintenance WAVE3 proofs.
    await client.query(`UPDATE accounting.journal_entries SET is_sample_data = true WHERE id = $1::uuid`, [result.journal_entry_id]);

    const je = await client.query(
      `
        SELECT p.account_id::text, ca.account_name, p.debit_or_credit, p.amount_cents
          FROM accounting.journal_entry_postings p
          JOIN catalogs.accounts ca ON ca.id = p.account_id
         WHERE p.journal_entry_uuid = $1::uuid
         ORDER BY p.line_sequence
      `,
      [result.journal_entry_id]
    );
    console.log("JE POSTINGS:", je.rows);

    const jeRow = await client.query(`SELECT id, is_sample_data, memo FROM accounting.journal_entries WHERE id = $1::uuid`, [result.journal_entry_id]);
    console.log("JE AFTER:", jeRow.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
