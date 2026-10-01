/**
 * ROUND 313 CC-3 item 5 — the canonical UNDO of a load cancellation (migration 202615180900).
 *
 * Before this there was no undo: a wrong cancellation was "fixed" by a one-off script that put the load's status
 * back and left dispatch.load_cancellations 'approved' + mdata.loads.canceled_at / canceled_by stamped (13625,
 * 13627, 13638 since 2026-09-28). Now one path does all of it, in one transaction:
 *   1. the cancellation row -> status 'reversed' + reversed_at / reversed_by_user_id / reversal_reason (kept as
 *      history, never deleted); the 0281 sync trigger then clears the load's cancel stamp (only this
 *      cancellation's stamp);
 *   2. a load still at status 'cancelled' goes back to the dispatch-work status the caller names (must be one of
 *      DISPATCH_WORK_LOAD_STATUSES); a load already back in work keeps its status untouched;
 *   3. one audit row 'dispatch.load.cancellation_reversed' with before/after.
 * What it never does: re-create money the cancel cascade voided (voids are reversals of their own; re-issuing an
 * invoice or driver bill is that engine's job, reported in the result), invent a delivery date, or change a
 * delivered/invoiced/closed load's status.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { DISPATCH_WORK_LOAD_STATUSES } from "./canonical-active-load-set.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type CancellationReversalInput = {
  operating_company_id: string;
  load_id: string;
  reason: string;
  /** Required only when the load is still 'cancelled'; ignored otherwise. */
  restore_status?: (typeof DISPATCH_WORK_LOAD_STATUSES)[number];
};

export async function reverseLoadCancellationInClientTx(client: Db, actorUserId: string, input: CancellationReversalInput, auditSource = "P5-F4-CANCELLATIONS") {
  if (input.reason.trim().length < 10) throw new Error("E_REVERSAL_REASON_MIN_10");
  const before = (
    await client.query<{ load_number: string; status: string; canceled_at: string | null; canceled_by: string | null; cancellation_id: string | null; cancellation_status: string | null; cancelled_at: string | null }>(
      `SELECT l.load_number, l.status::text AS status, l.canceled_at::text, l.canceled_by::text,
              lc.id::text AS cancellation_id, lc.status AS cancellation_status, lc.cancelled_at::text
         FROM mdata.loads l
         LEFT JOIN dispatch.load_cancellations lc ON lc.load_id = l.id AND lc.operating_company_id = l.operating_company_id
        WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid AND l.soft_deleted_at IS NULL
        FOR UPDATE OF l`,
      [input.load_id, input.operating_company_id]
    )
  ).rows[0];
  if (!before) throw new Error("E_LOAD_NOT_FOUND");
  if (!before.cancellation_id || !["requested", "approved"].includes(String(before.cancellation_status))) {
    throw new Error("E_NO_ACTIVE_CANCELLATION");
  }
  let restoreTo: string | null = null;
  if (before.status === "cancelled") {
    if (!input.restore_status || !(DISPATCH_WORK_LOAD_STATUSES as readonly string[]).includes(input.restore_status)) {
      throw new Error("E_RESTORE_STATUS_REQUIRED");
    }
    restoreTo = input.restore_status;
  }

  await client.query(
    `UPDATE dispatch.load_cancellations
        SET status = 'reversed', reversed_at = now(), reversed_by_user_id = $3::uuid, reversal_reason = $4
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status IN ('requested', 'approved')`,
    [before.cancellation_id, input.operating_company_id, actorUserId, input.reason.trim()]
  );
  if (restoreTo) {
    await client.query(
      `UPDATE mdata.loads SET status = $3::mdata.load_status_enum, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'cancelled'::mdata.load_status_enum`,
      [input.load_id, input.operating_company_id, restoreTo]
    );
  }
  const after = (
    await client.query<{ status: string; canceled_at: string | null; canceled_by: string | null }>(
      `SELECT status::text AS status, canceled_at::text, canceled_by::text FROM mdata.loads WHERE id = $1::uuid`,
      [input.load_id]
    )
  ).rows[0];
  if (after.canceled_at !== null) throw new Error("E_CANCEL_STAMP_NOT_CLEARED");

  await appendCrudAudit(
    client as never,
    actorUserId,
    "dispatch.load.cancellation_reversed",
    {
      resource_type: "dispatch.load_cancellations",
      resource_id: before.cancellation_id,
      operating_company_id: input.operating_company_id,
      load_id: input.load_id,
      load_number: before.load_number,
      reason: input.reason.trim(),
      before: { status: before.status, canceled_at: before.canceled_at, canceled_by: before.canceled_by, cancellation_status: before.cancellation_status },
      after: { status: after.status, canceled_at: after.canceled_at, canceled_by: after.canceled_by, cancellation_status: "reversed" },
      money_not_restored: "voided invoices / driver bills from the cancel cascade stay voided; re-issue through their own engines",
    },
    "warning",
    auditSource
  );
  return { load_id: input.load_id, load_number: before.load_number, cancellation_id: before.cancellation_id, before, after };
}
