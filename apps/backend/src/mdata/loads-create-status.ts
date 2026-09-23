// mdata/loads.routes.ts POST /api/v1/mdata/loads — status validation for the CREATE path.
//
// LEAD RULING 2026-09-23 (docs/bus/09-23-2026-LEAD-RULING-CC-1-STATUS-VOCABULARY-DO-NOT-SQUASH.md):
// "DO NOT MAP. DO NOT SQUASH." A create call must VALIDATE the requested status against mode
// (reject illegally, never silently coerce), extending DispatchStatus where genuinely needed
// rather than dropping/squashing source values. This is the load-bearing implementation of that
// law for this route: `loadStatusSchema` (21 members) is wider than `DispatchStatus` (10 members,
// dispatch/load-state-machine.ts) — the enum `createLoadWithFullSideEffects` actually consumes.
//
// The rule here is deliberately NARROWER than dispatch/load-state-machine.ts's own
// `fromMdataStatus` (which is a TOTAL function — it maps every one of the 21 values, including
// "delivered"/"invoiced"/"paid"/"closed", because it exists to DISPLAY/categorize an EXISTING
// load's already-recorded status for a board/filter, never to decide whether a brand-new load
// SHOULD be allowed to spring into existence already in that state). Reusing `fromMdataStatus`
// directly for CREATE would silently accept a create request for an already-"delivered" load and
// coerce it into "delivered_pending_docs" without ever telling the caller their literal request
// wasn't honored — exactly the "invents a defect / hides a real one" failure mode the ruling
// named. So CREATE gets its own, smaller allow-list: only the statuses a load can legitimately
// be born in through THIS route (an office manual-entry create, not a historical-backfill
// import) are accepted; everything else is REJECTED and NAMED, never mapped.
//
// Grounds for the allow-list (verified against createLoadWithFullSideEffects's own body, not
// guessed): the canonical create path (book-load.service.ts) only ever inserts mdata status
// 'draft' (save_mode="draft"), 'dispatched' (save_mode="book_dispatch" with a full crew), or
// toMdataStatus(<any DispatchStatus>) — which itself never returns "booked"/"planned"/"assigned"/
// "at_pickup"/"at_delivery"/"delivered"/"invoiced"/"paid"/"closed" (see toMdataStatus's own body).
// Those 9 mdata values are PATCH-only transitions in every other part of this app (see
// allowedStatusTransitions in loads.routes.ts, and load-state-machine.ts's own forwardTransitions)
// — never an initial value anywhere else in the codebase either. Rejecting them at create keeps
// this route's behavior consistent with every sibling create path instead of inventing a
// third, novel meaning for "create a load that's already invoiced."
import { fromMdataStatus, type DispatchStatus } from "../dispatch/load-state-machine.js";

/** The exact 21-member wire vocabulary loads.routes.ts's own loadStatusSchema accepts. */
export type WideLoadStatus =
  | "draft"
  | "booked"
  | "planned"
  | "unassigned"
  | "assigned"
  | "assigned_not_dispatched"
  | "dispatched"
  | "at_pickup"
  | "in_transit"
  | "at_delivery"
  | "delivered"
  | "delivered_pending_docs"
  | "completed_docs_received"
  | "invoiced"
  | "paid"
  | "closed"
  | "cancelled"
  | "abandoned"
  | "driver_walkoff"
  | "driver_no_show";

/**
 * Statuses a brand-new load may legitimately be CREATED in through this route. Anything not in
 * this set is a real, named rejection (422 status_not_creatable), never a silent squash into the
 * nearest bucket. "draft"/"booked"/"planned" all fold to DispatchStatus "unassigned" via
 * fromMdataStatus — that fold is safe here (unlike the rejected members below) because all three
 * already mean the identical thing on the create path today: an unbooked, uncommitted load record
 * with no crew yet. Nothing about that specific fold erases evidence or invents a defect.
 */
const CREATE_LEGAL_STATUSES: ReadonlySet<WideLoadStatus> = new Set([
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
]);

export type CreateStatusPlan =
  | { ok: true; saveMode: "draft" | "book_dispatch"; dispatchStatus: DispatchStatus }
  | { ok: false; rejectedStatus: WideLoadStatus };

/**
 * Resolve a CREATE request's requested status into a (save_mode, DispatchStatus) plan for
 * createLoadWithFullSideEffects, or a named rejection. Pure function — no I/O, no default
 * fallback on an illegal value (the caller must surface `rejectedStatus` as a 422, never proceed
 * with a guessed substitute).
 */
export function planCreateStatus(requested: WideLoadStatus): CreateStatusPlan {
  if (!CREATE_LEGAL_STATUSES.has(requested)) {
    return { ok: false, rejectedStatus: requested };
  }
  const saveMode: "draft" | "book_dispatch" = requested === "draft" ? "draft" : "book_dispatch";
  const dispatchStatus = fromMdataStatus(requested);
  return { ok: true, saveMode, dispatchStatus };
}
