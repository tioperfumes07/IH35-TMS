/**
 * R-185 steps 2-6 (Lead order, 2026-09-26): the 27 driver-paid expenses in
 * ~/ih35-worktrees/.cr1000.json (25 "drv" + 2 "comp" that joined per R-187 G5's ruling: 13516-8 and
 * 13568-13 are the PDF "Drv" rows despite their "comp" tag) all currently credit 1000 Bank of America
 * Operating -- wrong, since the driver paid these, not the company. R-185's "one cost, one payable"
 * model requires Cr the driver's own 2175-00-NNN "Driver Reimbursements" leaf (created live under
 * AUTH-044, confirmed to already exist for all 11 distinct drivers here).
 *
 * Void-never-delete, never UPDATE a posted money row: each row is REVERSED (its funding JE only, via
 * reversePostedSourceTransactionInClientTx) + the old expense header flipped to status='void', then a
 * BRAND NEW expense + expense_lines row is created with the SAME date/load/memo/debit account/item/
 * quantity/rate -- only payment_account_uuid changes, from 1000 to the driver's 2175 leaf -- and
 * freshly posted. Matches the exact shape of this session's own AUTH-048/049 G1 self-correction.
 *
 * item_id is REQUIRED on every new line (expense_lines_item_qty_rate_amount_check). 25 of 27 rows
 * already carry a real item_id (carried forward unchanged); 2 do not (9601b556-... "ATGTx settl 5802
 * #1 $10.00 load 13579" and 9c3fb19f-... "LUMPER VIAJE PASADO ... load 13540") -- both filled in here
 * from the established item for their own existing debit account (5000 Fuel & Diesel ->
 * "Driver Reimbursement-Company Vehicle Fuel", same item G1 used; 5310 Lumper Expense ->
 * "Warehouse Lumper Expense", the same item the OTHER live 5310 row in this exact 27-row list
 * already uses), never invented.
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
const BANK_1000_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // confirmed live on all 27 rows.

// item_id overrides for the 2 rows with no existing item on their line.
const ITEM_OVERRIDES: Record<string, { itemId: string; quantity: number; rateCents: number; unitOfMeasure: string }> = {
  "9601b556-713f-479f-8f2a-95ded5ae9456": { itemId: "e93a0c79-337f-4563-b0fc-d09c9b36e499", quantity: 1, rateCents: 1000, unitOfMeasure: "each" }, // Driver Reimbursement-Company Vehicle Fuel
  "9c3fb19f-2c4b-4c08-a37a-70857ff91f14": { itemId: "e09e3a25-a4c0-404c-abf1-2bb7ac329e45", quantity: 1, rateCents: 1800, unitOfMeasure: "each" }, // Warehouse Lumper Expense
};

// expense_id -> driver's full name (matches mdata.drivers first_name+last_name exactly, resolved by
// NAME per resolveDriverReimbursementSubAccountId -- both ALFONSO HIDALGO CHAVEZ driver_uuids resolve
// to the SAME 2175 leaf, matching AUTH-044's own name-collapse).
const DRIVER_NAME: Record<string, string> = {
  "9601b556-713f-479f-8f2a-95ded5ae9456": "Neftali Coronado Urbano",
  "3c0546ab-c62a-4955-b2f5-13e33f1aa7f4": "PEDRO ABRAHAM LOPEZ COLLADO",
  "4b2a4f08-2c48-4f84-990f-8d1a2e9de5cb": "JOSE ANTONIO VICENTE MARTINEZ",
  "3f31fef7-31d2-4c30-bab3-68900ac40ac5": "ALFONSO HIDALGO CHAVEZ",
  "b8763810-cd05-4566-b810-52e5385c9d58": "Leonel Antonio Morales",
  "24a27568-87fc-41ad-b3d7-3fb919ef6a5d": "Leonel Antonio Morales",
  "d870ebda-6da2-4acb-b83a-8d3ce73273c9": "Leonel Antonio Morales",
  "63aa3571-6f92-498c-95fd-affda941981d": "Leonel Antonio Morales",
  "af9e8f01-4e5e-44ad-a2bb-559204154ad5": "Leonel Antonio Morales",
  "3416103e-4bae-4a18-a470-8fa1c17c117c": "Leonel Antonio Morales",
  "489ac1e2-4fef-49fa-8434-460018426833": "HUGO GAYTAN",
  "bb6856b8-83aa-4452-ab41-f0b3a159e01a": "JOSE ANTONIO VICENTE MARTINEZ",
  "e1c6cceb-bb7d-458b-8f5f-9287983b8ea1": "JOSE ANTONIO VICENTE MARTINEZ",
  "8fe24dd9-89e8-47e2-9842-ed59f2ae9dc6": "JOSE ANTONIO VICENTE MARTINEZ",
  "cecac0af-1faa-4352-a42c-cbaa34606fb7": "GENARO GUERRERO CHAVEZ",
  "dfdd2e12-f9f3-4ead-9952-f66f75f55c96": "ALFONSO HIDALGO CHAVEZ",
  "cea59dcb-1e08-4f9c-aa82-37e628b476c6": "Neftali Coronado Urbano",
  "4c6b3f8e-0b6a-4f1c-988f-783a86a9264a": "Neftali Coronado Urbano",
  "51c84c14-8602-4686-8d8c-4885096ad71e": "Neftali Coronado Urbano",
  "dfa8ceca-c150-4f4f-bafe-34517b289cd4": "JOSE ANTONIO VICENTE MARTINEZ",
  "160c37ce-fe84-45d4-bc02-7ad8aa81e27f": "Jorge Luis Infante Corona",
  "0f2437db-d92e-4601-bbff-ebd237982ba1": "Carlos Mauricio Pena Carvallo",
  "0e3f359c-c095-4eb7-8e2d-95e33d4748f6": "Carlos Mauricio Pena Carvallo",
  "8651813d-fe3a-4c23-a9ea-551cc7de1ecf": "Carlos Mauricio Pena Carvallo",
  "063717c9-bad0-4709-86f1-6d8adbc2a5d3": "Fernando Mecor Hernandez",
  "2e03e4ce-8a6a-4040-93cf-562b788f6e20": "Neftali Coronado Urbano",
  "9c3fb19f-2c4b-4c08-a37a-70857ff91f14": "HUGO GAYTAN",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const { resolveDriverReimbursementSubAccountId } = await import(
    "../../apps/backend/src/accounting/driver-subaccount-provision.service.js"
  );
  const { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { generateExpenseNumber } = await import("../../apps/backend/src/expense-attribution/expense-number.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const ids = Object.keys(DRIVER_NAME);

    for (const oldExpenseId of ids) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("RESET ROLE");
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

        const header = await client.query<{
          id: string; expense_number: string; transaction_date: string; total_amount_cents: string;
          memo: string; load_id: string; driver_uuid: string; payment_account_uuid: string;
          status: string; posting_status: string; journal_entry_id: string | null;
        }>(
          `SELECT id::text, expense_number, transaction_date::text, total_amount_cents::text, memo, load_id::text, driver_uuid::text, payment_account_uuid::text, status, posting_status, journal_entry_id::text
             FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [oldExpenseId, USMCA_ID]
        );
        if (!header.rows[0]) throw new Error(`STOP: ${oldExpenseId} not found`);
        const h = header.rows[0];
        if (h.payment_account_uuid !== BANK_1000_ACCOUNT_ID) {
          throw new Error(`STOP: ${oldExpenseId} (${h.expense_number}) payment_account_uuid is ${h.payment_account_uuid}, expected 1000 Bank -- shape unexpected`);
        }
        if (h.status !== "posted" || h.posting_status !== "posted" || !h.journal_entry_id) {
          throw new Error(`STOP: ${oldExpenseId} (${h.expense_number}) not in the expected posted shape: ${JSON.stringify(h)}`);
        }

        const lineRes = await client.query<{
          expense_account_uuid: string; item_id: string | null; quantity: string | null; rate_cents: string | null; unit_of_measure: string | null; amount_cents: string;
        }>(
          `SELECT expense_account_uuid::text, item_id::text, quantity::text, rate_cents::text, unit_of_measure, amount_cents::text
             FROM accounting.expense_lines WHERE expense_id=$1::uuid`,
          [oldExpenseId]
        );
        if (!lineRes.rows[0]) throw new Error(`STOP: ${oldExpenseId} has no expense_lines row`);
        const line = lineRes.rows[0];

        const override = ITEM_OVERRIDES[oldExpenseId];
        const itemId = override ? override.itemId : line.item_id;
        const quantity = override ? override.quantity : Number(line.quantity);
        const rateCents = override ? override.rateCents : Number(line.rate_cents);
        const unitOfMeasure = override ? override.unitOfMeasure : line.unit_of_measure;
        if (!itemId || !quantity || !rateCents || !unitOfMeasure) {
          throw new Error(`STOP: ${oldExpenseId} (${h.expense_number}) resolved line shape incomplete: item=${itemId} qty=${quantity} rate=${rateCents} uom=${unitOfMeasure}`);
        }

        const driverName = DRIVER_NAME[oldExpenseId]!;
        const reimbAccountId = await resolveDriverReimbursementSubAccountId(client as never, {
          operatingCompanyId: USMCA_ID,
          driverName,
        });
        if (!reimbAccountId) throw new Error(`STOP: no existing 2175 leaf for "${driverName}" (should already exist from AUTH-044)`);

        // ---- Reverse the OLD expense (void-never-delete) ----
        const rev = await reversePostedSourceTransactionInClientTx(
          client as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: oldExpenseId },
          { userId: SYSTEM_ACTOR_USER_ID },
          todayIso()
        );
        if (!rev.journal_entry_id) throw new Error(`STOP: ${oldExpenseId} reversal did not return a journal_entry_id: ${JSON.stringify(rev)}`);

        const voidReason = "R-185 steps 2-6 (Lead order, 2026-09-26): driver-paid expense wrongly credited 1000 Bank of America Operating instead of the driver's own 2175 reimbursement leaf. Reissuing as a new expense with the correct credit account.";
        await client.query(
          `UPDATE accounting.expenses
              SET status='void',
                  posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
                  reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
                  voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
          [oldExpenseId, rev.journal_entry_id, SYSTEM_ACTOR_USER_ID, voidReason, USMCA_ID]
        );
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "expense.voided",
          { expense_id: oldExpenseId, reversing_journal_entry_id: rev.journal_entry_id, reason: voidReason },
          "warning", "R-185-STEP2-6-REPOST"
        );

        // ---- Create the NEW expense, correct credit account ----
        const numbering = await generateExpenseNumber(client as never, h.load_id, USMCA_ID);
        const newMemo = `${h.memo} (R-185 reissue of ${h.expense_number}: Cr driver 2175 reimbursement, was wrongly 1000 Bank)`;
        const insExp = await client.query<{ id: string }>(
          `
            INSERT INTO accounting.expenses (
              operating_company_id, status, transaction_date, total_amount_cents,
              memo, expense_number, load_id, is_sample_data, payment_account_uuid,
              is_company_expense, driver_uuid, created_by_user_id, updated_by_user_id
            )
            VALUES ($1::uuid, 'draft', $2::date, $3::bigint, $4, $5, $6::uuid, false, $7::uuid, false, $8::uuid, $9::uuid, $9::uuid)
            RETURNING id::text
          `,
          [USMCA_ID, h.transaction_date, Number(h.total_amount_cents), newMemo, numbering.number, h.load_id, reimbAccountId, h.driver_uuid, SYSTEM_ACTOR_USER_ID]
        );
        const newExpenseId = insExp.rows[0]!.id;

        // AUTH-060 STOP-THE-LINE fix: mirror the canonical create path's expense_load_links write
        // (expenses.routes.ts, body.load_id branch) in the SAME transaction as the expense insert --
        // omitting it is what broke verify-alwaystrack-parity arm D for this script's first run.
        await client.query(
          `
            INSERT INTO expense_attribution.expense_load_links (
              operating_company_id, expense_id, expense_source, load_id, load_number,
              expense_seq, expense_number, attribution_method, attribution_confidence,
              attribution_reason, attributed_by_user_id
            ) VALUES ($1,$2,'accounting',$3,$4,$5,$6,'user_assigned','high',$7,$8)
          `,
          [USMCA_ID, newExpenseId, h.load_id, numbering.loadNumber, numbering.seq, numbering.number, `R-185 reissue of ${h.expense_number}: driver-paid expense re-credited to the driver's 2175 reimbursement leaf`, SYSTEM_ACTOR_USER_ID]
        );

        await client.query(
          `
            INSERT INTO accounting.expense_lines (
              operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
              load_id, load_required, expense_account_uuid, item_id, quantity, rate_cents, unit_of_measure, driver_id
            )
            VALUES ($1::uuid, $2::uuid, 1, $3, $4::bigint, $5, $6::uuid, true, $7::uuid, $8::uuid, $9, $10::bigint, $11, $12::uuid)
          `,
          [USMCA_ID, newExpenseId, Number(h.total_amount_cents) / 100, Number(h.total_amount_cents), newMemo, h.load_id, line.expense_account_uuid, itemId, quantity, rateCents, unitOfMeasure, h.driver_uuid]
        );

        const posted = await postSourceTransactionInClientTx(
          client as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: newExpenseId },
          { userId: SYSTEM_ACTOR_USER_ID }
        );
        if (!posted.journal_entry_id) throw new Error(`STOP: ${newExpenseId} (${numbering.number}) did not post a journal entry: ${JSON.stringify(posted)}`);

        await client.query(
          `UPDATE accounting.expenses
              SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
          [newExpenseId, posted.journal_entry_id, USMCA_ID]
        );
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "accounting.expenses.created",
          {
            resource_type: "accounting.expenses", resource_id: newExpenseId, operating_company_id: USMCA_ID,
            expense_number: numbering.number, amount_cents: Number(h.total_amount_cents), load_id: h.load_id,
            driver_id: h.driver_uuid, item_id: itemId, debit_account_id: line.expense_account_uuid,
            credit_account_id: reimbAccountId, journal_entry_id: posted.journal_entry_id,
            reissue_of_expense_id: oldExpenseId,
          },
          "info", "R-185-STEP2-6-REPOST"
        );

        await client.query("COMMIT");
        console.log(`${h.expense_number} -> ${numbering.number}: void_je=${rev.journal_entry_id} new_je=${posted.journal_entry_id} driver="${driverName}" credit=${reimbAccountId}`);
        results.push({
          old_expense_number: h.expense_number, new_expense_number: numbering.number,
          old_expense_id: oldExpenseId, new_expense_id: newExpenseId,
          reversing_je: rev.journal_entry_id, new_je: posted.journal_entry_id,
          driver_name: driverName, credit_account_id: reimbAccountId, amount_cents: Number(h.total_amount_cents),
        });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(JSON.stringify(results, null, 2));
    console.log(`DONE. ${results.length} of ${ids.length} rows reissued.`);
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
