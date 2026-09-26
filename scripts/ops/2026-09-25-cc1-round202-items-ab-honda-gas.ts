/**
 * ROUND 202 (Claude-Lead, 2026-09-25) items a) and b): two driver-paid $10.00 "Honda" gas lines from
 * the signed AlwaysTrack settlement PDFs that were NEVER entered into accounting.expenses at all
 * (confirmed live: no expense row on either load matches). Create them now, correctly, credited to
 * the driver's OWN "2175-00-NNN <Driver> — Driver Reimbursements" liability leaf (R-185's "one cost,
 * one payable" model: Dr item / Cr 2175-<driver>, never 1000 Bank / 2000 AP) -- NOT the wrong
 * 1000-Bank-credit pattern the existing (unrelated, R-185-scope) 27-row driver-paid expenses used.
 *
 * a) settlement 5805, load 13582, 2026-09-08, LOVES inv 16049982, driver Jorge Luis Infante Corona.
 * b) settlement 5808, load 13597, 2026-09-12, ROAD RANGER inv 00034608, driver Neftali Coronado Urbano.
 *
 * Debit account: 5000 Fuel & Diesel (same account the existing $10.00 driver-paid gas precedent in
 * the R-185 27-row list used, e.g. expense 9601b556 "ATGTx settl 5802 #1 $10.00 load 13579").
 * Numbering: generateExpenseNumber (load-attributed, per R-168's ownership rule), NOT nextExpenseDisplayId.
 * Posting: hand-built INSERT (accounting.expenses + accounting.expense_lines) + postSourceTransactionInClientTx,
 * mirroring settlement-creator.service.ts's own "Comp. Exp." call site exactly (same InClientTx engines
 * ROUND 202 names: postSourceTransactionInClientTx, appendCrudAudit, nextExpenseDisplayId's sibling
 * generateExpenseNumber).
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
const FUEL_ACCOUNT_NUMBER = "5000"; // Fuel & Diesel -- same account the R-185 precedent $10 driver-paid gas line used.
const AMOUNT_CENTS = 1000; // $10.00, both items.

const ITEMS = [
  {
    label: "a",
    loadNumber: "13582",
    driverId: "3e138476-06db-4b08-9ebe-527a5d8c591d", // Jorge Luis Infante Corona
    driverName: "Jorge Luis Infante Corona",
    settlementDisplayId: "S-5805",
    transactionDate: "2026-09-08",
    memo: "AlwaysTrack settl 5805 Honda $10.00 load 13582 LOVES inv 16049982 (driver-paid, Cr 2175)",
  },
  {
    label: "b",
    loadNumber: "13597",
    driverId: "a32a35c8-7cd5-4368-83f0-35e185092433", // Neftali Coronado Urbano
    driverName: "Neftali Coronado Urbano",
    settlementDisplayId: "S-5808",
    transactionDate: "2026-09-12",
    memo: "AlwaysTrack settl 5808 Honda $10.00 load 13597 ROAD RANGER inv 00034608 (driver-paid, Cr 2175)",
  },
];

async function main() {
  const { provisionDriverReimbursementSubAccount } = await import(
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

      const fuelAcct = await client.query<{ id: string }>(
        `SELECT id::text FROM catalogs.accounts WHERE account_number = $1 AND operating_company_id = $2::uuid`,
        [FUEL_ACCOUNT_NUMBER, USMCA_ID]
      );
      if (!fuelAcct.rows[0]) throw new Error(`STOP: account ${FUEL_ACCOUNT_NUMBER} not found`);
      const fuelAccountId = fuelAcct.rows[0].id;

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

        const reimb = await provisionDriverReimbursementSubAccount(client as never, {
          operatingCompanyId: USMCA_ID,
          driverId: item.driverId,
          driverName: item.driverName,
          actorUserId: SYSTEM_ACTOR_USER_ID,
        });
        const reimbAccountId = "accountId" in reimb ? reimb.accountId! : null;
        if (!reimbAccountId) throw new Error(`STOP: could not resolve 2175 leaf for ${item.driverName}: ${JSON.stringify(reimb)}`);

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

        // expense_lines_item_qty_rate_amount_check requires item_id/quantity/rate_cents/unit_of_measure
        // to be ALL NULL or ALL set (with item_id NOT NULL) -- no catalogs.items row applies here, so
        // all four stay NULL (amount/amount_cents alone fully describe this line, same as any expense
        // line with no item-catalog linkage).
        await client.query(
          `
            INSERT INTO accounting.expense_lines (
              operating_company_id, expense_id, line_sequence, amount, amount_cents, description,
              load_id, load_required, expense_account_uuid, driver_id
            )
            VALUES ($1::uuid, $2::uuid, 1, $3, $4::bigint, $5, $6::uuid, true, $7::uuid, $8::uuid)
          `,
          [USMCA_ID, expenseId, AMOUNT_CENTS / 100, AMOUNT_CENTS, item.memo, loadId, fuelAccountId, item.driverId]
        );

        const posted = await postSourceTransactionInClientTx(
          client as never,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: SYSTEM_ACTOR_USER_ID }
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
            credit_account_id: reimbAccountId,
            debit_account_id: fuelAccountId,
            journal_entry_id: posted.journal_entry_id ?? null,
          },
          "info",
          "AUTH-046-ROUND202-ITEM-A-B"
        );

        results.push({
          item: item.label,
          status: "created",
          expense_id: expenseId,
          expense_number: numbering.number,
          journal_entry_id: posted.journal_entry_id ?? null,
          debit_account: FUEL_ACCOUNT_NUMBER,
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
