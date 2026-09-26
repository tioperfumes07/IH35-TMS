/**
 * R-187 G1 REPOST (Lead ruling, 2026-09-26, superseding the earlier "NOT 5000" text): USMCA's live
 * catalog already carries the QBO item "Driver Reimbursement-Company Vehicle Fuel"
 * (catalogs.items e93a0c79-337f-4563-b0fc-d09c9b36e499), whose own default_expense_account_id resolves
 * to 5000 Fuel & Diesel -- confirmed live. Two-layer QBO clone law: coarse chart account (5000, correct
 * all along), detailed item on the line (the missing piece, not a wrong account). No new account is
 * created; the item mapping IS the source.
 *
 * Reposts the two missing Honda gas lines (settlements 5805/5808, loads 13582/13597) that AUTH-046
 * posted without an item_id (reversed under AUTH-048 for that reason) -- now WITH item_id set,
 * quantity=1, rate_cents=1000, unit_of_measure='each' (satisfies
 * expense_lines_item_qty_rate_amount_check's "all four set" branch: item_id NOT NULL, quantity>0,
 * round(quantity*rate_cents)=amount_cents). Same debit account (5000, via the item), same credit
 * accounts (the driver's own 2175-00-NNN leaf) as the reversed originals.
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
const ITEM_ID = "e93a0c79-337f-4563-b0fc-d09c9b36e499"; // "Driver Reimbursement-Company Vehicle Fuel"
const AMOUNT_CENTS = 1000; // $10.00, both items.

const ITEMS = [
  {
    label: "a",
    loadNumber: "13582",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d", // Jorge Luis Infante Corona
    driverName: "Jorge Luis Infante Corona",
    transactionDate: "2026-09-08",
    memo: "AlwaysTrack settl 5805 Honda $10.00 load 13582 LOVES inv 16049982 (driver-paid, item=Driver Reimbursement-Company Vehicle Fuel, Cr 2175)",
  },
  {
    label: "b",
    loadNumber: "13597",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", // Neftali Coronado Urbano
    driverName: "Neftali Coronado Urbano",
    transactionDate: "2026-09-12",
    memo: "AlwaysTrack settl 5808 Honda $10.00 load 13597 ROAD RANGER inv 00034608 (driver-paid, item=Driver Reimbursement-Company Vehicle Fuel, Cr 2175)",
  },
];

async function main() {
  const { resolveDriverReimbursementSubAccountId } = await import(
    "../../apps/backend/src/accounting/driver-subaccount-provision.service.js"
  );
  const { postSourceTransactionInClientTx } = await import("../../apps/backend/src/accounting/posting-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { generateExpenseNumber } = await import("../../apps/backend/src/expense-attribution/expense-number.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const itemRes = await client.query<{ id: string; default_expense_account_id: string; deactivated_at: string | null }>(
        `SELECT id::text, default_expense_account_id::text, deactivated_at FROM catalogs.items WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [ITEM_ID, USMCA_ID]
      );
      if (!itemRes.rows[0]) throw new Error(`STOP: item ${ITEM_ID} not found`);
      if (itemRes.rows[0].deactivated_at) throw new Error(`STOP: item ${ITEM_ID} is deactivated`);
      const expenseAccountId = itemRes.rows[0].default_expense_account_id;
      if (!expenseAccountId) throw new Error(`STOP: item ${ITEM_ID} has no default_expense_account_id`);
      const acctCheck = await client.query<{ account_number: string }>(`SELECT account_number FROM catalogs.accounts WHERE id = $1::uuid`, [expenseAccountId]);
      if (acctCheck.rows[0]?.account_number !== "5000") {
        throw new Error(`STOP: item's default_expense_account_id resolved to ${acctCheck.rows[0]?.account_number}, expected 5000`);
      }

      for (const item of ITEMS) {
        const load = await client.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE load_number = $1`, [item.loadNumber]);
        if (!load.rows[0]) throw new Error(`STOP: load ${item.loadNumber} not found`);
        const loadId = load.rows[0].id;

        // Idempotency: refuse to double-create if a matching memo already exists for this load.
        const already = await client.query<{ id: string }>(
          `SELECT id::text FROM accounting.expenses WHERE load_id = $1::uuid AND memo = $2 AND voided_at IS NULL`,
          [loadId, item.memo]
        );
        if (already.rows[0]) {
          results.push({ item: item.label, status: "already_exists", expense_id: already.rows[0].id });
          continue;
        }

        const reimbAccountId = await resolveDriverReimbursementSubAccountId(client as never, {
          operatingCompanyId: USMCA_ID,
          driverName: item.driverName,
        });
        if (!reimbAccountId) throw new Error(`STOP: could not resolve existing 2175 leaf for ${item.driverName} (should already exist from AUTH-044)`);

        const numbering = await generateExpenseNumber(client as never, loadId, USMCA_ID);

        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO accounting.expenses (
              operating_company_id, status, transaction_date, total_amount_cents,
              memo, expense_number, load_id, is_sample_data, payment_account_uuid,
              is_company_expense, driver_uuid, created_by_user_id, updated_by_user_id
            )
            VALUES ($1::uuid, 'draft', $2::date, $3::bigint, $4, $5, $6::uuid, false, $7::uuid, false, $8::uuid, $9::uuid, $9::uuid)
            RETURNING id::text
          `,
          [USMCA_ID, item.transactionDate, AMOUNT_CENTS, item.memo, numbering.number, loadId, reimbAccountId, item.driverId, SYSTEM_ACTOR_USER_ID]
        );
        const expenseId = inserted.rows[0]!.id;

        // expense_lines_item_qty_rate_amount_check: item_id/quantity/rate_cents/unit_of_measure ALL
        // set (the branch AUTH-046's original attempt missed), quantity>0, round(qty*rate)=amount.
        await client.query(
          `
            INSERT INTO accounting.expense_lines (
              operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
              load_id, load_required, expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure, driver_id
            )
            VALUES ($1::uuid, $2::uuid, 1, $3, $4::bigint, $5, $6::uuid, true, $7::uuid, $8::uuid, 1, $4::bigint, 'each', $9::uuid)
          `,
          [USMCA_ID, expenseId, AMOUNT_CENTS / 100, AMOUNT_CENTS, item.memo, loadId, expenseAccountId, ITEM_ID, item.driverId]
        );

        const posted = await postSourceTransactionInClientTx(
          client as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: SYSTEM_ACTOR_USER_ID }
        );
        if (!posted.journal_entry_id) throw new Error(`STOP: ${expenseId} did not post a journal entry: ${JSON.stringify(posted)}`);

        // ACCT-F2026092595 root-cause fix: status moves in lockstep with posting_status here too.
        await client.query(
          `UPDATE accounting.expenses
              SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
          [expenseId, posted.journal_entry_id, USMCA_ID]
        );

        await appendCrudAudit(
          client as never,
          SYSTEM_ACTOR_USER_ID,
          "accounting.expenses.created",
          {
            resource_type: "accounting.expenses",
            resource_id: expenseId,
            operating_company_id: USMCA_ID,
            expense_number: numbering.number,
            amount_cents: AMOUNT_CENTS,
            load_id: loadId,
            driver_id: item.driverId,
            item_id: ITEM_ID,
            debit_account_id: expenseAccountId,
            credit_account_id: reimbAccountId,
            journal_entry_id: posted.journal_entry_id,
          },
          "info",
          "R-187-G1-REPOST-WITH-ITEM"
        );

        results.push({
          item: item.label,
          status: "created",
          expense_id: expenseId,
          expense_number: numbering.number,
          journal_entry_id: posted.journal_entry_id,
          debit_account: "5000",
          item_id: ITEM_ID,
          credit_account_id: reimbAccountId,
        });
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
