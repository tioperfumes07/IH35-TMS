/**
 * LOAD-CLOSE-LIFECYCLE (owner ruling 2026-09-09, verbatim: "THOSE DELIVERED SHOULD ALREADY HAVE BEEN
 * CLOSED IN THE APP"). Under AlwaysTrack the docs are always in, so a delivered load must not sit in
 * `delivered_pending_docs` forever — it progresses with its receivable and closes off the live board
 * once the carrier's side of the money is settled.
 *
 * McLeod/Alvys parity, the correct method:
 *   - invoice SENT      → load `invoiced`   (docs in + invoice out; still on the billing band)
 *   - invoice PAID, or its factoring purchase FUNDED/COLLECTED/RELEASED (`advanced`/`collected`/
 *     `released`) → load `closed`   (carrier has its money; the invoice's collection/recourse now
 *     lives in the factoring module, NOT the dispatch board — so the load leaves the board)
 *
 * This NEVER computes or posts a journal entry — it only walks `mdata.loads.status` FORWARD along the
 * canonical billing tail, and only through steps that already exist in loads.routes.ts's
 * `allowedStatusTransitions`. It never moves a load backward and never touches a cancelled / abandoned
 * / walk-off / no-show / pre-delivery load. Idempotent: a load already at (or past) the target is a
 * clean no-op, so re-firing from the delivery latch, the factoring advance, a customer payment, or the
 * one-shot backfill can never double-apply. Void-not-delete is preserved: `closed` is a status, fully
 * reversible by an owner transition; nothing is deleted.
 */
import { withCompanyScope } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

/** Invoice.status values that mean the carrier has been paid in full → close the load. */
export const LOAD_CLOSE_INVOICE_STATUSES = ["paid"] as const;
/**
 * Invoice.factoring_status values that mean the factor has funded the purchase (carrier has its
 * money) → close the load. Collection/recourse continues to be tracked in the factoring module.
 */
export const LOAD_CLOSE_FACTORING_STATUSES = ["advanced", "collected", "released"] as const;

/**
 * The canonical billing tail, in order. A load is only ever advanced FORWARD along this list, and only
 * via a step that exists in loads.routes.ts `allowedStatusTransitions`. Guarded by
 * verify-load-close-lifecycle-wired.mjs so it can never drift from that map.
 */
const BILLING_TAIL_ORDER = [
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
] as const;
type BillingTailStatus = (typeof BILLING_TAIL_ORDER)[number];

/**
 * The forward steps this service is allowed to take. Every pair is present in
 * loads.routes.ts `allowedStatusTransitions` (checked by the guard). We deliberately jump
 * delivered_pending_docs → invoiced directly (allowed) rather than through completed_docs_received,
 * because under AlwaysTrack the docs are in and the invoice is already sent.
 */
const FORWARD_STEP: Partial<Record<BillingTailStatus, BillingTailStatus>> = {
  delivered: "invoiced",
  delivered_pending_docs: "invoiced",
  completed_docs_received: "invoiced",
  invoiced: "closed",
  paid: "closed",
};

function rank(status: string): number {
  const i = (BILLING_TAIL_ORDER as readonly string[]).indexOf(status);
  return i;
}

export type SyncResult = {
  changed: boolean;
  from?: string;
  to?: string;
  reason?: string;
};

async function walkForward(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  operatingCompanyId: string,
  loadId: string,
  actorUserId: string,
  currentStatus: string,
  target: BillingTailStatus
): Promise<SyncResult> {
  // Only operate on a load that is already in the billing tail and BEHIND the target.
  if (rank(currentStatus) < 0) return { changed: false, reason: "load_not_in_billing_tail" };
  if (rank(currentStatus) >= rank(target)) return { changed: false, reason: "already_at_or_past_target" };

  let status = currentStatus;
  let steps = 0;
  const from = currentStatus;
  // Bounded walk (≤ length of the tail) — never loops.
  while (rank(status) < rank(target) && steps < BILLING_TAIL_ORDER.length) {
    const next = FORWARD_STEP[status as BillingTailStatus];
    if (!next) return { changed: steps > 0, from, to: status, reason: "no_forward_step" };
    // Do not overshoot the target (e.g. target=invoiced must not step to closed).
    const stepTo = rank(next) > rank(target) ? target : next;
    const upd = await client.query(
      `
        UPDATE mdata.loads
        SET status = $2::mdata.load_status_enum, updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $3::uuid
          AND status = $4::mdata.load_status_enum
        RETURNING id
      `,
      [loadId, stepTo, operatingCompanyId, status]
    );
    if (!upd.rows[0]) return { changed: steps > 0, from, to: status, reason: "status_moved_concurrently" };
    status = stepTo;
    steps += 1;
  }

  await appendCrudAudit(
    client as never,
    actorUserId,
    "dispatch.load_billing_lifecycle_sync",
    {
      resource_type: "mdata.loads",
      resource_id: loadId,
      operating_company_id: operatingCompanyId,
      from,
      to: status,
    },
    "info",
    "LOAD-CLOSE-LIFECYCLE"
  );
  return { changed: true, from, to: status };
}

/**
 * Sync a single load's status to its invoice's billing state. Reads the load's linked invoice
 * (accounting.invoices.source_load_id) and advances the load to `invoiced` (invoice sent) or `closed`
 * (invoice paid / factoring funded). No-op when the invoice is not yet sent, or the load is already
 * at/past the target, or the load is not in the billing tail. Never throws — swallow-and-log.
 */
export async function syncLoadStatusToBilling(input: {
  operatingCompanyId: string;
  loadId: string;
  actorUserId: string;
}): Promise<SyncResult> {
  try {
    return await withCompanyScope(input.actorUserId, input.operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            l.status AS load_status,
            i.status AS invoice_status,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status
          FROM mdata.loads l
          LEFT JOIN accounting.invoices i
            ON i.source_load_id = l.id
           AND i.operating_company_id = l.operating_company_id
           AND i.voided_at IS NULL
          WHERE l.id = $1::uuid
            AND l.operating_company_id = $2::uuid
          ORDER BY i.created_at DESC NULLS LAST
          LIMIT 1
        `,
        [input.loadId, input.operatingCompanyId]
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { changed: false, reason: "load_not_found" };
      const loadStatus = String(row.load_status);
      const invoiceStatus = row.invoice_status ? String(row.invoice_status) : null;
      const factoringStatus = String(row.factoring_status);
      if (!invoiceStatus) return { changed: false, reason: "no_invoice" };

      let target: BillingTailStatus | null = null;
      if (
        (LOAD_CLOSE_INVOICE_STATUSES as readonly string[]).includes(invoiceStatus) ||
        (LOAD_CLOSE_FACTORING_STATUSES as readonly string[]).includes(factoringStatus)
      ) {
        target = "closed";
      } else if (invoiceStatus === "sent") {
        target = "invoiced";
      }
      if (!target) return { changed: false, reason: "invoice_not_billable_yet" };

      return walkForward(client, input.operatingCompanyId, input.loadId, input.actorUserId, loadStatus, target);
    });
  } catch (err) {
    console.warn({ err, load_id: input.loadId }, "load_billing_lifecycle_sync_failed");
    return { changed: false, reason: "error" };
  }
}

/**
 * Sync every load linked (via its invoice) to a factoring advance. Used by the factoring advance
 * hook after an advance is funded (`advanced`) so the underlying delivered load(s) close off the
 * board. Runs on its own connection — the caller must invoke this AFTER its own transaction commits
 * (a same-txn call could not see the just-written `advanced` factoring_status under READ COMMITTED).
 */
export async function syncLoadsForFactoringAdvance(input: {
  operatingCompanyId: string;
  factoringAdvanceId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const loadIds = await withCompanyScope(input.actorUserId, input.operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT DISTINCT i.source_load_id
          FROM accounting.invoices i
          WHERE i.factoring_advance_id = $1::uuid
            AND i.operating_company_id = $2::uuid
            AND i.source_load_id IS NOT NULL
        `,
        [input.factoringAdvanceId, input.operatingCompanyId]
      );
      return res.rows.map((r: Record<string, unknown>) => String((r as { source_load_id?: string }).source_load_id)).filter(Boolean);
    });
    for (const loadId of loadIds) {
      await syncLoadStatusToBilling({
        operatingCompanyId: input.operatingCompanyId,
        loadId,
        actorUserId: input.actorUserId,
      });
    }
  } catch (err) {
    console.warn({ err, factoring_advance_id: input.factoringAdvanceId }, "load_billing_lifecycle_sync_for_advance_failed");
  }
}

/**
 * Resolve a load id from an invoice id and sync it. Used by the customer-payment and factoring hooks,
 * which know the invoice but not the load.
 */
export async function syncLoadStatusFromInvoice(input: {
  operatingCompanyId: string;
  invoiceId: string;
  actorUserId: string;
}): Promise<SyncResult> {
  try {
    const loadId = await withCompanyScope(input.actorUserId, input.operatingCompanyId, async (client) => {
      const res = await client.query(
        `SELECT source_load_id FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [input.invoiceId, input.operatingCompanyId]
      );
      return (res.rows[0] as { source_load_id?: string } | undefined)?.source_load_id ?? null;
    });
    if (!loadId) return { changed: false, reason: "invoice_has_no_load" };
    return syncLoadStatusToBilling({
      operatingCompanyId: input.operatingCompanyId,
      loadId,
      actorUserId: input.actorUserId,
    });
  } catch (err) {
    console.warn({ err, invoice_id: input.invoiceId }, "load_billing_lifecycle_sync_from_invoice_failed");
    return { changed: false, reason: "error" };
  }
}
