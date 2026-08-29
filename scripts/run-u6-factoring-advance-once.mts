/**
 * U6 6/6 — INBOX-CC-1.md "factoring advance — TMS-internal only. NO Faro/external draw."
 *
 * TMS-internal only: no external Faro API exists in this codebase to contact (confirmed by source
 * read) and none is called here — this only writes to accounting.invoices / accounting.
 * factoring_advances / accounting.journal_entries via the EXISTING poster + existing route logic,
 * exactly mirroring what book-load.service.ts / loads.routes.ts's transition endpoint / POST
 * /api/v1/accounting/factoring-advances(+/:id/advance) already do in production. No new GL math.
 *
 * USMCA's Faro relationship is REAL, not fabricated: apps/backend/src/home/factoring-balance-invoice-
 * linkage.service.ts's own comment (ACCT-F5332) — "the owner confirmed in chat 2026-08-16 that USMCA
 * began factoring with Faro on 2026-08-07, same terms as TRANSP (migration 202612690000 seeds the
 * matching canonical_factor_agreements + vendor rows for USMCA)" — confirmed live: USMCA has a real
 * factoring.canonical_factor_agreements row (agreement_code FARO_FULL_RECOURSE_V1, effective_from
 * 2026-08-07, fee_rate_tier1=1.5%, reserve_rate=1.5%) bound to a real "Faro Factoring" vendor row.
 * Uses those REAL rates, not invented ones.
 *
 * Candidate selection: the only 'sent' USMCA invoice (INV-2026-00037, from the earlier U6 3-4/6
 * revrec+invoice work) turned out to belong to a customer deactivated 2026-08-17 — the real
 * production route's own RLS-scoped customer JOIN would ALSO refuse that invoice (customers_select
 * policy requires deactivated_at IS NULL), confirmed live on a rehearsal branch before assuming
 * anything. No other non-void invoice exists anywhere for USMCA against an active, factoring_
 * eligible customer either. So this script mints a FRESH real invoice (via the same
 * buildInvoiceFromLoad function book-load.service.ts itself calls at booking time) on a real,
 * already-dispatched, already-driver-assigned USMCA load whose customer (TC Freight LLC) is active
 * and factoring-eligible, carries it through the same real delivery-lifecycle transition already
 * proven in run-u6-revrec-invoice-once.mts, then factors the resulting real 'sent' invoice.
 *
 * Usage:
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-factoring-advance-once.mts          # dry run
 *   DATABASE_URL=<direct, non-pooled> npx tsx scripts/run-u6-factoring-advance-once.mts --commit  # apply
 */
import pg from "pg";
import { withCompanyScope } from "../apps/backend/src/accounting/shared.js";
import { nextFactoringDisplayId } from "../apps/backend/src/accounting/display-id.js";
import { postFactoringAdvanceEvent } from "../apps/backend/src/accounting/factoring-posting/poster.service.js";
import { buildInvoiceFromLoad } from "../apps/backend/src/accounting/from-load.js";
import { validateLoadStatusTransition, toMdataStatus } from "../apps/backend/src/dispatch/load-state-machine.js";
import {
  loadStatusRequiresDeliveryDepartureStamp,
  stampFinalActiveDeliveryDeparture,
} from "../apps/backend/src/dispatch/stamp-final-delivery-departure.js";
import { ensureDriverBillArtifactsForLoad } from "../apps/backend/src/dispatch/book-load.service.js";
import { latchOnDeliveryEvidence } from "../apps/backend/src/dispatch/delivery-evidence-latch.js";
import { pingSettlementOnLoadEvent } from "../apps/backend/src/driver-finance/settlements-load-bookended.service.js";
import { emitDispatchSpineEvent } from "../apps/backend/src/dispatch/dispatch-spine-emit.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "96ecc9cb-e62c-4ee7-8eed-28514771d984"; // L-20260810-0003, $1,850.00, dispatched, real driver, customer TC Freight LLC (active, factoring_eligible)
const FARO_VENDOR_ID = "a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4"; // real "Faro Factoring" vendor row
const HOPS = ["in_transit", "delivered_pending_docs"] as const;
// Real rates from factoring.canonical_factor_agreements (USMCA row, FARO_FULL_RECOURSE_V1):
// fee_rate_tier1=1.5%, reserve_rate=1.5% -> advance_rate_pct = 100 - 1.5 - 1.5 = 97.
const ADVANCE_RATE_PCT = 97;
const RESERVE_PCT = 1.5;
const FACTOR_FEE_PCT = 1.5;

const COMMIT = process.argv.includes("--commit");

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");
if (/-pooler\./.test(dbUrl)) {
  throw new Error("Refusing a pooled connection string.");
}

async function transitionOneHop(targetStatus: string) {
  return withCompanyScope(ACTOR_USER_UUID, USMCA, async (client: any) => {
    const currentRes = await client.query(
      `SELECT status FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
      [LOAD_ID, USMCA]
    );
    const current = currentRes.rows[0];
    if (!current) throw new Error("load_not_found");
    const transition = validateLoadStatusTransition(current.status, targetStatus);
    if (!transition.ok) throw new Error(`invalid_transition from=${transition.from} to=${transition.to}`);

    const mdataStatus = toMdataStatus(targetStatus);
    await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [LOAD_ID, mdataStatus]);

    if (loadStatusRequiresDeliveryDepartureStamp(targetStatus)) {
      await stampFinalActiveDeliveryDeparture(client, USMCA, LOAD_ID, null);
      await ensureDriverBillArtifactsForLoad(client, { loadId: LOAD_ID, operatingCompanyId: USMCA, actorUserId: ACTOR_USER_UUID });
    }

    await latchOnDeliveryEvidence(client, { operatingCompanyId: USMCA, loadId: LOAD_ID, targetStatus, actorUserId: ACTOR_USER_UUID });

    try {
      await pingSettlementOnLoadEvent(client, { loadId: LOAD_ID, operatingCompanyId: USMCA, dispatchTargetStatus: targetStatus, actorUserId: ACTOR_USER_UUID });
    } catch (err) {
      console.warn("settlement_ping_failed", err);
    }

    await emitDispatchSpineEvent(client, {
      operating_company_id: USMCA,
      actor_user_id: ACTOR_USER_UUID,
      event_type: "load.status_changed",
      load_id: LOAD_ID,
      payload: { from_status: current.status, to_status: targetStatus },
    });

    return { from: current.status, to: targetStatus };
  });
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    const before = await client.query(`SELECT status FROM mdata.loads WHERE id = $1::uuid`, [LOAD_ID]);
    console.log("BEFORE load status:", before.rows[0]);

    if (!COMMIT) {
      console.log("DRY RUN — pass --commit to apply. No writes made.");
      return;
    }

    // --- Step 0: mint a fresh real proforma invoice for this load (its prior invoice is void) ---
    const minted = await withCompanyScope(ACTOR_USER_UUID, USMCA, async (c: any) =>
      buildInvoiceFromLoad(c, { userId: ACTOR_USER_UUID, operatingCompanyId: USMCA, loadId: LOAD_ID, asProforma: true })
    );
    console.log("MINTED INVOICE:", minted.invoice.id, minted.invoice.status, minted.invoice.total_cents, "idempotent=", minted.idempotent);
    const invoiceId = String((minted.invoice as any).id);

    // --- Step 1: carry the load through its real delivery lifecycle (proforma -> sent) ---
    for (const hop of HOPS) {
      const result = await transitionOneHop(hop);
      console.log("HOP RESULT:", JSON.stringify(result));
    }

    const invAfterLatch = await client.query(`SELECT id, status, total_cents FROM accounting.invoices WHERE id = $1::uuid`, [invoiceId]);
    console.log("INVOICE AFTER LATCH:", invAfterLatch.rows[0]);

    // --- Step 2: create the factoring_advances row + tag the invoice (mirrors POST /factoring-advances) ---
    const createResult = await withCompanyScope(ACTOR_USER_UUID, USMCA, async (c: any) => {
      const vendorRes = await c.query(
        `SELECT id FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
        [FARO_VENDOR_ID, USMCA]
      );
      if (!vendorRes.rows[0]) throw new Error("factoring_vendor_not_found");

      const invRes = await c.query(
        `
          SELECT i.id, i.customer_id, i.total_cents, i.status, COALESCE(i.factoring_status,'not_factored') AS factoring_status, cust.factoring_eligible
            FROM accounting.invoices i
            JOIN mdata.customers cust ON cust.id = i.customer_id AND cust.operating_company_id = i.operating_company_id
           WHERE i.operating_company_id = $1::uuid AND i.id = $2::uuid
        `,
        [USMCA, invoiceId]
      );
      const inv = invRes.rows[0];
      if (!inv) throw new Error("invoice_not_found");
      if (inv.status !== "sent") throw new Error(`invoice_not_sent status=${inv.status}`);
      if (inv.factoring_status !== "not_factored") throw new Error(`invoice_already_factored status=${inv.factoring_status}`);
      if (!inv.factoring_eligible) throw new Error("customer_not_factoring_eligible");

      const invoiceTotalCents = Number(inv.total_cents);
      const advanceAmount = Math.round((invoiceTotalCents * ADVANCE_RATE_PCT) / 100);
      const reserveAmount = Math.max(0, invoiceTotalCents - advanceAmount);
      const displayId = await nextFactoringDisplayId(c, USMCA, new Date());

      const insertRes = await c.query(
        `
          INSERT INTO accounting.factoring_advances (
            operating_company_id, factoring_company_vendor_id, display_id, status,
            submission_batch_ref, invoice_total_cents, advance_rate_pct, advance_amount_cents,
            reserve_pct, reserve_amount_cents, factor_fee_pct, notes, memo, created_by_user_id
          )
          VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)
          RETURNING id
        `,
        [
          USMCA,
          FARO_VENDOR_ID,
          displayId,
          "U6-6of6-run-once",
          invoiceTotalCents,
          ADVANCE_RATE_PCT,
          advanceAmount,
          RESERVE_PCT,
          reserveAmount,
          FACTOR_FEE_PCT,
          "U6 6/6 -- TMS-internal factoring advance, real USMCA<->Faro FARO_FULL_RECOURSE_V1 agreement rates, reuse existing poster (INBOX-CC-1.md)",
          ACTOR_USER_UUID,
        ]
      );
      const advanceId = String(insertRes.rows[0]?.id ?? "");
      if (!advanceId) throw new Error("factoring_advance_create_failed");

      await c.query(
        `UPDATE accounting.invoices SET factoring_advance_id = $2, factoring_status = 'submitted', updated_at = now(), updated_by_user_id = $3
         WHERE operating_company_id = $1::uuid AND id = $4::uuid`,
        [USMCA, advanceId, ACTOR_USER_UUID, invoiceId]
      );
      return { advanceId, displayId, advanceAmount, reserveAmount };
    });
    console.log("CREATE RESULT:", createResult);

    // --- Step 3: fire the real poster (mirrors POST /factoring-advances/:id/advance) ---
    const result = await postFactoringAdvanceEvent({
      operating_company_id: USMCA,
      factoring_advance_id: createResult.advanceId,
      actor_user_id: ACTOR_USER_UUID,
      advanced_at_iso: new Date().toISOString(),
    });
    console.log("POSTER RESULT:", JSON.stringify(result, null, 2));

    if ((result as any).journal_entry_id) {
      await withCompanyScope(ACTOR_USER_UUID, USMCA, async (c: any) => {
        await c.query(`UPDATE accounting.factoring_advances SET status = 'advanced', advanced_at = now() WHERE id = $1::uuid`, [createResult.advanceId]);
        await c.query(
          `UPDATE accounting.invoices SET factoring_status = 'advanced', updated_at = now(), updated_by_user_id = $2
           WHERE operating_company_id = $1::uuid AND id = $3::uuid`,
          [USMCA, ACTOR_USER_UUID, invoiceId]
        );
      });
    }

    const after = await client.query(`SELECT id, status, factoring_status FROM accounting.invoices WHERE id = $1::uuid`, [invoiceId]);
    console.log("AFTER invoice:", after.rows[0]);
    const advanceAfter = await client.query(
      `SELECT id, status, advance_amount_cents, reserve_amount_cents FROM accounting.factoring_advances WHERE id = $1::uuid`,
      [createResult.advanceId]
    );
    console.log("AFTER advance:", advanceAfter.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
