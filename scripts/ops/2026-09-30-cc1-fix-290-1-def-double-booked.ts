/**
 * SELF-CORRECTION -- ROUND 290.1's own 34-row fuel-to-expense-bridge backfill (AUTH-145,
 * 2026-09-30 ~05:10-05:11) created a SECOND expense document for 24 fuel purchases that already
 * had a real expense from settlement-document extraction, because it called
 * createExpenseFromFuelTransaction unconditionally for any fuel_transaction with no
 * source_fuel_transaction_id link, without first checking whether an existing expense (from any
 * other provenance) already represented the SAME purchase.
 *
 * SEVERITY, VERIFIED LIVE BEFORE WRITING THIS (correcting an overstated first report): ALL 24 of
 * the newly-created duplicate documents are posting_status='unposted' with journal_entry_id NULL
 * -- none of them ever posted a second GL entry. There is NO double-booked COST in the ledger
 * today. This is a duplicate-DOCUMENT defect (would become a double-booked-cost defect the moment
 * anything posts these 24 drafts), not an active P&L overstatement. Detected by
 * scripts/verify-no-fuel-purchase-booked-twice.mjs (pre-existing ROUND 165 guard B), which groups
 * by (load_id, total_amount_cents) and flags any group with both a card-fuel
 * (source_fuel_transaction_id set) and a regular (not set) expense.
 *
 * Checked live before writing this: the OTHER 8 rows from the same 32-row backfill (loads
 * 428263f5-fcf0-4ccb-9a7e-84664aef13ad and 686ef3f2-da5b-4156-a07d-63d6b9563f9d have ZERO
 * settlement-extraction DEF expenses at all; the 2 remaining rows on load
 * b0581b44-7f55-4c91-81fb-7e967543a5d4 have no settlement-extraction row at their amount) are
 * genuinely new, non-duplicate documents -- not touched by this script.
 *
 * FIX, per row pair, in one transaction each:
 *   1. Void the NEWER (backfill-created, unposted) duplicate via the same status-flip shape
 *      expenses.routes.ts's void route uses (posting_status is 'unposted', not 'posted', so there
 *      is no live JE to reverse -- reversePostedSourceTransactionInClientTx is still attempted
 *      defensively in case a row's state differs from what was measured, exactly mirroring the
 *      real void route's own conditional).
 *   2. Set source_fuel_transaction_id on the OLDER (settlement-extraction, already-posted)
 *      expense to the SAME fuel_transaction_id the voided duplicate carried -- a pure metadata
 *      addition, no GL math touched, satisfies the fuel-to-expense bridge invariant (every live
 *      fuel_transaction has exactly one linked LIVE expense) via the document that is actually
 *      real, instead of a phantom duplicate.
 *
 * Every pair is its own transaction. DRY_RUN=1 (default) prints the full plan, zero writes.
 * AUTHORIZATION: OWNER_AUTH_ID, verified against an OPEN entry in docs/bus/OWNER-AUTHORIZATIONS.md.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN !== "0";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("Refusing a production financial write without OWNER_AUTH_ID.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

async function main() {
  const { reversePostedSourceTransactionInClientTx, PostingEngineError } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { cascadeVoidChildren } = await import("../../apps/backend/src/accounting/cascade-void-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { todayIso } = await import("../../apps/backend/src/accounting/void.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  // READ PHASE — re-derive the duplicate groups live, using the SAME predicate as
  // scripts/verify-no-fuel-purchase-booked-twice.mjs's findDuplicatePairs, so this script and the
  // guard can never disagree about what counts as a duplicate.
  const readClient = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(readClient, { label: "scripts/ops/2026-09-30-cc1-fix-290-1-def-double-booked.ts" });
  let rows: Array<{ id: string; load_id: string; total_amount_cents: string; source_fuel_transaction_id: string | null }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await readClient.query(
      `SELECT id::text, load_id::text, total_amount_cents, source_fuel_transaction_id::text
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND load_id IS NOT NULL`,
      [USMCA_ID]
    );
    rows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.load_id} ${r.total_amount_cents}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }
  const pairs: Array<{ older: (typeof rows)[number]; newer: (typeof rows)[number] }> = [];
  for (const bucket of groups.values()) {
    const cardFuel = bucket.filter((r) => r.source_fuel_transaction_id);
    const regular = bucket.filter((r) => !r.source_fuel_transaction_id);
    if (cardFuel.length > 0 && regular.length > 0) {
      if (cardFuel.length !== 1 || regular.length !== 1) {
        console.error(`AMBIGUOUS GROUP -- load=${bucket[0].load_id} amount=${bucket[0].total_amount_cents}: ${cardFuel.length} card-fuel, ${regular.length} regular -- STOP, needs a human`);
        continue;
      }
      pairs.push({ older: regular[0], newer: cardFuel[0] });
    }
  }

  console.log(`Re-derived live: ${pairs.length} duplicate pair(s) (expected 24).`);
  if (pairs.length !== 24) {
    console.error(`STOP -- live re-derivation (${pairs.length}) does not match the expected 24. Not proceeding automatically.`);
    if (!DRY_RUN) process.exit(1);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const { older, newer } of pairs) {
    const plan = {
      load_id: older.load_id,
      amount_cents: older.total_amount_cents,
      older_expense_id: older.id,
      newer_expense_id: newer.id,
      fuel_transaction_id: newer.source_fuel_transaction_id,
    };

    if (DRY_RUN) {
      console.log(JSON.stringify({ ...plan, status: "DRY_RUN -- would void newer, link older" }));
      results.push({ ...plan, status: "DRY_RUN" });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      // Re-check both rows are still live and in the expected shape at write time.
      const chk = await client.query(
        `SELECT id::text, voided_at::text, posting_status, source_fuel_transaction_id::text
           FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid FOR UPDATE`,
        [[older.id, newer.id], USMCA_ID]
      );
      const map = new Map(chk.rows.map((r: any) => [r.id, r]));
      const o = map.get(older.id);
      const n = map.get(newer.id);
      if (!o || !n) throw new Error("row(s) not found at write time -- STOP");
      if (o.voided_at || n.voided_at) throw new Error("one of the pair is already voided at write time -- STOP");
      if (o.source_fuel_transaction_id) throw new Error(`older expense ${older.id} already carries a source_fuel_transaction_id (${o.source_fuel_transaction_id}) -- STOP, would overwrite`);
      if (n.source_fuel_transaction_id !== newer.source_fuel_transaction_id) throw new Error("newer expense's fuel transaction id changed since read -- STOP");

      // 1. Void the newer duplicate — same shape as expenses.routes.ts's void route.
      let reversingJeId: string | null = null;
      if (n.posting_status === "posted") {
        try {
          const rev = await reversePostedSourceTransactionInClientTx(
            client,
            { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: newer.id },
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
        [newer.id, reversingJeId, SYSTEM_ACTOR_USER_ID,
          `SELF-CORRECTION -- duplicate of already-posted settlement-extraction expense ${older.id} for the same fuel purchase (load ${older.load_id}, $${(Number(older.total_amount_cents) / 100).toFixed(2)}). Created in error by the ROUND 290.1 fuel-to-expense-bridge backfill (AUTH-145), which did not check for an existing expense before minting one. Never posted (posting_status was 'unposted', journal_entry_id NULL) -- no GL entry was ever double-booked. See ${older.id} for the real, linked document.`,
          USMCA_ID]
      );
      await cascadeVoidChildren(client, "expense", newer.id, USMCA_ID);
      await appendCrudAudit(client, SYSTEM_ACTOR_USER_ID, "expense.voided", { expense_id: newer.id, reversing_journal_entry_id: reversingJeId, reason: "ROUND 290.1 self-correction: duplicate fuel expense" }, "warning");

      // 2. Link the older, already-posted, REAL expense to the fuel transaction — metadata only.
      await client.query(
        `UPDATE accounting.expenses SET source_fuel_transaction_id = $2::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
        [older.id, newer.source_fuel_transaction_id, USMCA_ID]
      );
      await appendCrudAudit(client, SYSTEM_ACTOR_USER_ID, "expense.updated", {
        expense_id: older.id,
        field: "source_fuel_transaction_id",
        new_value: newer.source_fuel_transaction_id,
        reason: "ROUND 290.1 self-correction: linking the real, already-posted settlement-extraction expense to its fuel transaction, replacing the voided duplicate",
      }, "info");

      await client.query("COMMIT");
      console.log(`load=${older.load_id} amount=${older.total_amount_cents}: voided ${newer.id}, linked ${older.id} -> fuel_txn ${newer.source_fuel_transaction_id}`);
      results.push({ ...plan, status: "FIXED" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`FAILED (load=${older.load_id} amount=${older.total_amount_cents}):`, (err as Error).message);
      results.push({ ...plan, status: `FAILED -- ${(err as Error).message}` });
    } finally {
      client.release();
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
