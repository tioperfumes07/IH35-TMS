// ACCT-F166 — the ONE place a load status change triggers its money side-effects.
//
// FOUND BY: CC-3's live walk on USMCA (LV-TXN-004), then verified in code rather than taken on trust.
// There are TWO endpoints that write `mdata.loads.status`, and only ONE carried the money:
//
//   PATCH /api/v1/dispatch/loads/:id/transition  (dispatch/loads.routes.ts)
//        -> postLoadRevenueLatch  AND  pingSettlementOnLoadEvent
//   PATCH /api/v1/mdata/loads/:id/status         (mdata/loads.routes.ts)
//        -> latchOnDeliveryEvidence ONLY — neither imported nor called the other two.
//
// The office UI's only status control is wired to the SECOND one:
//   Dispatch.tsx onStatusDrop -> api/loads.ts updateLoadStatus -> PATCH /api/v1/mdata/loads/:id/status
//
// So every load a dispatcher advanced on the Kanban board silently skipped revenue recognition and
// never opened a driver settlement. CC-3 proved it live on USMCA load L-20260802-0258: every step
// HTTP 200, `status='delivered'`, and then `driver_finance.driver_settlements` UNCHANGED at 0 with
// `n_tup_ins` still 11, `accounting.posting_batches` for that load = 0, and zero settlement audit
// events. Nothing failed. Nothing was reported. The money simply never happened.
//
// WHY THIS FILE EXISTS RATHER THAN A COPY-PASTE. The finding's own fix requirement says: "either
// repoint the office control, or give /mdata/loads/:id/status the same two calls. Do NOT duplicate
// the latch logic in a third place." Extracting the pair into one function satisfies both halves —
// each endpoint makes ONE call, and there is exactly one definition of what a status change means to
// the ledger. A third inline copy is how this defect was born: two endpoints that were each
// internally consistent and disagreed with each other.
//
// BEHAVIOUR IS PRESERVED EXACTLY, not redesigned:
//   • the revenue latch still fires ONLY for delivered_pending_docs / completed_docs_received
//     (DISP-01's two-event latch — earn at delivery, bill at POD), and is still flag-gated inside
//     postLoadRevenueLatch itself, so a disabled flag remains a no-op;
//   • the settlement ping still fires on EVERY status change, because it is the ping that decides
//     which events matter — that decision belongs to settlements-load-bookended.service.ts, not here;
//   • both remain non-fatal. A failing latch must not roll back a legitimate dispatch status change:
//     the operational truth (this load was delivered) is not invalidated by a ledger hiccup, and
//     blocking the board on a posting error would be a worse defect than the one being fixed. Both
//     failures are logged with the same warn keys as before so existing log searches keep working.

import { postLoadRevenueLatch } from "./revrec-delivery-posting/poster.service.js";
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

/** Statuses at which DISP-01's two-event revenue latch fires. */
const REVENUE_LATCH_STATUSES = new Set(["delivered_pending_docs", "completed_docs_received"]);

export type LoadStatusMoneyEffectsInput = {
  client: DbClient;
  operatingCompanyId: string;
  loadId: string;
  /** The status the load is moving TO. */
  targetStatus: string;
  actorUserId: string;
};

/**
 * Apply the money side-effects of a load status change: the two-event revenue latch and the
 * settlement ping. Call this from EVERY endpoint that writes `mdata.loads.status`.
 *
 * Non-fatal by contract — see the header. Returns what it attempted so a caller (or a test) can
 * assert the wiring without reaching into the log.
 */
export async function applyLoadStatusMoneyEffects(
  input: LoadStatusMoneyEffectsInput
): Promise<{ revenueLatchAttempted: boolean; settlementPingAttempted: boolean }> {
  const { client, operatingCompanyId, loadId, targetStatus, actorUserId } = input;

  const revenueLatchAttempted = REVENUE_LATCH_STATUSES.has(targetStatus);
  if (revenueLatchAttempted) {
    try {
      await postLoadRevenueLatch({
        operating_company_id: operatingCompanyId,
        load_id: loadId,
        target_status: targetStatus,
        entry_date_iso: companyBusinessDate(),
        actor_user_id: actorUserId,
      });
    } catch (err) {
      console.warn({ err, load_id: loadId, targetStatus }, "disp_01_revrec_latch_failed");
    }
  }

  try {
    await pingSettlementOnLoadEvent(client, {
      loadId,
      operatingCompanyId,
      dispatchTargetStatus: targetStatus,
      actorUserId,
    });
  } catch (err) {
    console.warn({ err }, "dispatch_load_settlement_ping_failed");
  }

  return { revenueLatchAttempted, settlementPingAttempted: true };
}
