/**
 * DEFECT ITEM 4 (Lead order, 2026-09-30): "The expense engine is creating A/P. A Bill IS Accounts
 * Payable — $2,117.49 sits in 2000 with zero bills behind it. If paid, it is an Expense crediting
 * the real funding account. If owed, create a Bill." Law 280.0.b: no journal entries, create the
 * document.
 *
 * ROOT CAUSE (live-verified, USMCA, bypass_rls): posting-engine.service.ts's own expense-posting
 * logic (line ~1455) credits `payment_account_uuid` directly when set, else falls back to
 * `ap_control` (account 2000). These 12 LOVES-vendor expenses were created with
 * `payment_account_uuid IS NULL`, so the engine correctly-per-its-own-logic defaulted to AP — the
 * documents themselves are what's wrong, not the posting engine. Every OTHER LOVES expense of the
 * exact same shape (no source_fuel_transaction_id, i.e. manually entered, not card-feed-adopted)
 * credits 1000 Bank of America - Operating (USMCA) 202 times out of 217 (93%) — this is the real
 * funding account for this population. Only 12 (these) and a handful of exceptions (2 x 2510, 3 x
 * 1295) diverge; 12/217 landing on the AP-fallback path is the mis-set-field bug, not a legitimate
 * alternate funding source (no source_fuel_transaction_id / card link exists on any of the 12 to
 * suggest otherwise).
 *
 * FIX (QuickBooks-style, per Law 280.0.b — no manual JE): void each of the 12 original expenses
 * through the real void route's own logic (verbatim copy, same pattern as
 * scripts/ops/2026-09-25-cc1-r157-step0-reclass-via-writer.ts), then recreate each with the
 * IDENTICAL category/account/amount/date/vendor/load — only `payment_account_uuid` changes, from
 * NULL to 1000's account id — and post through the real posting engine
 * (postSourceTransactionInClientTx). The engine's own existing logic then correctly credits 1000
 * instead of 2000. No new GL math, no new writer, no manual journal entry.
 *
 * The other 3 non-LOVES vendors found in the same $2,117.49/2000 population (TRUCK WASH HEBRON
 * $47.25, Smithfield Foods Inc $269.10 lumper, TERRENCE SMITH $250.00 lumper) are NOT touched here
 * — each is a single, first-ever expense for its vendor with no precedent, no bank link, no
 * fuel_transaction link, and no payment_account_uuid evidence of what funded it. Guessing a
 * funding account for those would be exactly the invented-data risk Rule 0 forbids. Per the Lead's
 * own branching rule ("If owed, create a Bill"), those 3 are reported separately for a real Bill
 * to be created against them — a different write path, not this script's scope.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

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
const ACCOUNT_1000_BOA = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3"; // 1000 Bank of America - Operating (USMCA)
const VENDOR_LOVES = "5a529e97-5af6-4874-89c0-f300715101f2";

const EXPENSE_IDS = [
  "8f4c66f1-3b8c-4455-ba40-840c8c63b3ed", // 13609
  "8c170d77-8146-492c-9363-0355e6a5bcdb", // 13609-1
  "2bbc404d-91fe-4151-be83-6f29c7cda3b2", // 13610
  "1e24c761-d8bd-40f0-8d31-ff0d37dc6980", // 13610-1
  "7c22d99d-da73-4771-8671-1d0fa1bcd0f7", // 13612
  "58168f62-2f13-4e98-8319-634406fc5f9e", // 13612-1
  "667478e2-8229-4b06-b763-9e7d6e0d397e", // 13614
  "04ec3581-f3e1-44c9-bbf3-3577557c1655", // 13614-1
  "047b0f6e-effe-43af-9b0a-c655792a7ab4", // 13614-2
  "90a95164-bac4-473b-a60d-cf1f4db2c39b", // 13617
  "43fc648c-00d1-4692-bd94-1d6bd34be15b", // 13617-1
  "2aa0e584-478e-4d3c-bc7c-65c151d0c3be", // 13619
];

async function main() {
  const { reversePostedSourceTransactionInClientTx, postSourceTransactionInClientTx, PostingEngineError } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { todayIso } = await import("../../apps/backend/src/accounting/void.service.js");
  const { cascadeVoidChildren } = await import("../../apps/backend/src/accounting/cascade-void-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc1-item4-loves-ap-to-bank-reclass.ts" });
  const results: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    // Pre-flight: re-verify all 12 are still live, credit 2000, vendor LOVES, no payment_account_uuid.
    const pre = await client.query<{ id: string; ok: boolean }>(
      `SELECT e.id::text,
              (e.vendor_uuid = $2::uuid AND e.payment_account_uuid IS NULL AND e.voided_at IS NULL) AS ok
         FROM accounting.expenses e
        WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $3::uuid`,
      [EXPENSE_IDS, VENDOR_LOVES, USMCA_ID]
    );
    if (pre.rows.length !== EXPENSE_IDS.length || pre.rows.some((r) => !r.ok)) {
      throw new Error(`preflight_state_mismatch: ${JSON.stringify(pre.rows)}`);
    }
    console.log(`PRE-FLIGHT OK: all ${pre.rows.length} expenses live, vendor=LOVES, payment_account_uuid NULL.`);

    for (const expenseId of EXPENSE_IDS) {
      const orig = await client.query<{
        id: string; expense_number: string; vendor_uuid: string | null; driver_uuid: string | null; memo: string | null;
        linked_work_order_uuid: string | null; unit_id: string | null; trailer_id: string | null;
        insurance_claim_id: string | null; legal_matter_id: string | null; class_id: string | null;
        vendor_document_number: string | null; created_by_user_id: string | null; load_id: string | null;
        transaction_date: string; total_amount_cents: string; is_sample_data: boolean;
        is_reimbursable: boolean; is_company_expense: boolean; posting_status: string;
      }>(
        `SELECT id::text, expense_number, vendor_uuid::text, driver_uuid::text, memo,
                linked_work_order_uuid::text, unit_id::text, trailer_id::text, insurance_claim_id::text,
                legal_matter_id::text, class_id::text, vendor_document_number, created_by_user_id::text,
                load_id::text, transaction_date::text, total_amount_cents::text,
                is_sample_data, is_reimbursable, is_company_expense, posting_status
           FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [expenseId, USMCA_ID]
      );
      const o = orig.rows[0];
      if (!o) throw new Error(`${expenseId}: original expense not found -- STOP`);

      const line = await client.query<{ expense_account_uuid: string; description: string | null }>(
        `SELECT expense_account_uuid::text, description FROM accounting.expense_lines WHERE expense_id = $1::uuid ORDER BY line_sequence LIMIT 1`,
        [expenseId]
      );
      const l = line.rows[0];
      if (!l) throw new Error(`${o.expense_number}: no expense_lines row -- STOP`);

      // 1. Void the original -- verbatim shape of expenses.routes.ts POST /:expenseId/void.
      let reversingJeId: string | null = null;
      if (o.posting_status === "posted") {
        try {
          const rev = await reversePostedSourceTransactionInClientTx(
            client,
            { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: expenseId },
            { userId: SYSTEM_ACTOR_USER_ID },
            todayIso()
          );
          reversingJeId = rev.journal_entry_id;
        } catch (revErr) {
          if (!(revErr instanceof PostingEngineError) || revErr.code !== "SOURCE_NOT_FOUND") throw revErr;
        }
      }
      await client.query(
        `UPDATE accounting.expenses
           SET status='void',
               posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
               reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
               voided_at=now(), voided_by_user_id=$3::uuid, void_reason=$4, updated_at=now()
         WHERE id=$1::uuid AND operating_company_id=$5::uuid`,
        [expenseId, reversingJeId, SYSTEM_ACTOR_USER_ID, "DEFECT ITEM 4 -- recreated with payment_account_uuid=1000 Bank of America, engine's own AP-fallback logic was crediting 2000 with no bill behind it", USMCA_ID]
      );
      await cascadeVoidChildren(client, "expense", expenseId, USMCA_ID);
      await appendCrudAudit(client, SYSTEM_ACTOR_USER_ID, "expense.voided", { expense_id: expenseId, reversing_journal_entry_id: reversingJeId, reason: "DEFECT ITEM 4 recreate" }, "warning");

      // 2. Recreate -- identical fields, ONLY payment_account_uuid changes (NULL -> 1000).
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO accounting.expenses (
           operating_company_id, status, transaction_date, total_amount_cents,
           is_sample_data, is_reimbursable, is_company_expense,
           vendor_uuid, driver_uuid, memo, payment_account_uuid, linked_work_order_uuid,
           unit_id, trailer_id, insurance_claim_id, legal_matter_id, class_id,
           vendor_document_number, created_by_user_id, load_id
         ) VALUES (
           $1::uuid, 'posted', $2::date, $3::bigint,
           $4, $5, $6,
           $7::uuid, $8::uuid, $9, $10::uuid, $11::uuid,
           $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid,
           $17, $18::uuid, $19::uuid
         ) RETURNING id::text`,
        [
          USMCA_ID, o.transaction_date, o.total_amount_cents,
          o.is_sample_data, o.is_reimbursable, o.is_company_expense,
          o.vendor_uuid, o.driver_uuid, o.memo, ACCOUNT_1000_BOA, o.linked_work_order_uuid,
          o.unit_id, o.trailer_id, o.insurance_claim_id, o.legal_matter_id, o.class_id,
          o.vendor_document_number, o.created_by_user_id, o.load_id,
        ]
      );
      const newExpenseId = insertRes.rows[0]?.id;
      if (!newExpenseId) throw new Error(`${o.expense_number}: recreate insert failed -- STOP`);

      await client.query(
        `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description, expense_account_uuid)
         VALUES ($1::uuid, 1, $2::bigint, $3::numeric, $4, $5::uuid)`,
        [newExpenseId, o.total_amount_cents, (Number(o.total_amount_cents) / 100).toFixed(2), l.description, l.expense_account_uuid]
      );

      const posted = await postSourceTransactionInClientTx(
        client,
        { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: newExpenseId },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`${o.expense_number}: voided ${expenseId} -> recreated ${newExpenseId} on payment_account=1000, posted -> ${JSON.stringify(posted)}`);
      results.push({ expense_number: o.expense_number, old_expense_id: expenseId, new_expense_id: newExpenseId });
    }

    const after = await client.query<{ account_number: string; cnt: string; sum: string }>(
      `SELECT a.account_number, count(*) AS cnt, sum(jep.amount_cents) AS sum
         FROM accounting.expenses e
         JOIN accounting.journal_entry_postings jep ON jep.source_transaction_type='expense' AND jep.source_transaction_id::uuid=e.id AND jep.debit_or_credit='credit'
         JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id=jep.account_id
        WHERE e.operating_company_id=$1::uuid AND e.vendor_uuid=$2::uuid
          AND e.voided_at IS NULL AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
        GROUP BY 1 ORDER BY 1`,
      [USMCA_ID, VENDOR_LOVES]
    );
    console.log("AFTER -- LOVES live credit-side accounts (2000 should be gone from this population):", JSON.stringify(after.rows));

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
