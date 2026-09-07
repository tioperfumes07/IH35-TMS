#!/usr/bin/env tsx
// CRITICAL-AR-TIEOUT-POSTED-WITHOUT-POSTING (2026-09-07) remediation, invoice 732f17c2 / load
// 6e823810 (load_number 13525, $607.41) -- the ONE of the original 10 red invoices that could not
// be safely fixed by the blind bulk set_status re-fire (which handled the other 9): this load's
// Event 1 (earn) never posted at all. Root cause, live-traced: the load sat at rate_total_cents=0
// while it reached delivered_pending_docs (audit trail: two
// "accounting.invoice.proforma_skipped_zero_rate" / reason=load_has_no_rate events), so Event 1's
// own zero_amount gate correctly no-op'd -- not a bug. The rate was corrected to $607.41 on
// 2026-09-07 at the same moment the invoice was created+sent, but nothing re-triggers Event 1 when
// a load's rate is corrected after delivery evidence was already reached (a real, separate wiring
// gap from the mark_factored one -- tracked, not fixed here; see OUTBOX for the finding).
//
// This script does NOT invent GL math. It calls the exact same two production functions every
// other delivery/invoice path calls (postLoadRevenueLatch for Event 1, then
// fireRevrecLatchOnInvoiceIssued for Event 2), using the load's CURRENT, real, already-corrected
// rate_total_cents -- never a guessed number. Safe by construction: postLoadRevenueLatch's own
// already_posted / zero_amount / missing_delivery_evidence gates make this a documented no-op if
// anything about the premises has changed since verification.
import pg from "pg";
import {
  postLoadRevenueLatch,
  fireRevrecLatchOnInvoiceIssued,
} from "../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "6e823810-9601-4646-bdbc-ce81d4183d97";
const INVOICE_ID = "732f17c2-ad4d-4592-8207-688fab1d2453";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  // Pre-flight live re-verification (never trust the earlier trace blindly) -- confirm the load's
  // current rate, that no earn/bill latch row already exists, and the invoice is still real+sent.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const load = await c.query(
      `SELECT rate_total_cents, status FROM mdata.loads WHERE id = $1::uuid`,
      [LOAD_ID]
    );
    const inv = await c.query(
      `SELECT status, total_cents, voided_at FROM accounting.invoices WHERE id = $1::uuid`,
      [INVOICE_ID]
    );
    const latch = await c.query(
      `SELECT event, is_active FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid`,
      [LOAD_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("PRE-FLIGHT load:", JSON.stringify(load.rows[0]));
    console.log("PRE-FLIGHT invoice:", JSON.stringify(inv.rows[0]));
    console.log("PRE-FLIGHT existing latch rows:", JSON.stringify(latch.rows));
    if (latch.rows.length > 0) {
      throw new Error("ABORT: a latch row already exists for this load -- premises changed, do not proceed blind");
    }
    if (inv.rows[0]?.status !== "sent" || inv.rows[0]?.voided_at) {
      throw new Error("ABORT: invoice is no longer sent/non-void -- premises changed, do not proceed blind");
    }
    if (!(Number(load.rows[0]?.rate_total_cents) > 0)) {
      throw new Error("ABORT: load rate is not positive -- premises changed, do not proceed blind");
    }
  }

  const earnResult = await postLoadRevenueLatch({
    operating_company_id: USMCA_COMPANY_ID,
    load_id: LOAD_ID,
    target_status: "delivered_pending_docs",
    entry_date_iso: new Date().toISOString(),
    actor_user_id: OWNER_USER_ID,
  });
  console.log("Event 1 (earn) result:", JSON.stringify(earnResult));

  await fireRevrecLatchOnInvoiceIssued({} as object, {
    operating_company_id: USMCA_COMPANY_ID,
    source_load_id: LOAD_ID,
    actor_user_id: OWNER_USER_ID,
    invoice_id: INVOICE_ID,
  });
  console.log("Event 2 (bill) fired via fireRevrecLatchOnInvoiceIssued (swallow-and-log; see next re-read for result)");

  // Post-flight live re-read.
  {
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const latch = await c.query(
      `SELECT event, is_active, journal_entry_id FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid ORDER BY event`,
      [LOAD_ID]
    );
    await c.query("COMMIT");
    c.release();
    console.log("POST-FLIGHT latch rows:", JSON.stringify(latch.rows));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
