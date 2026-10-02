/**
 * Load status state machine — canonical transition table for dispatch + revenue recognition.
 *
 * EXEMPT from `scripts/verify-delivered-status-single-source.mjs`: this file must enumerate every
 * mdata.load_status_enum member (including legacy `delivered` aliases) for translation and transitions.
 * Delivery-evidence predicate for filters/queues lives in delivery-evidence-status.ts only.
 */
import { z } from "zod";

export const dispatchStatusSchema = z.enum([
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
  "completed_docs_received",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

export type DispatchStatus = z.infer<typeof dispatchStatusSchema>;

export function fromMdataStatus(status: string): DispatchStatus {
  // These are real pre-dispatch members of mdata.load_status_enum. Keep the aliases explicit so an
  // unknown/corrupt value cannot inherit the same authority through a catch-all default.
  if (status === "draft" || status === "booked" || status === "planned") return "unassigned";
  if (status === "assigned") return "assigned_not_dispatched";
  if (status === "at_pickup") return "dispatched";
  if (status === "at_delivery") return "in_transit";
  if (status === "delivered") return "delivered_pending_docs";
  if (status === "invoiced" || status === "paid" || status === "closed") return "completed_docs_received";
  if (status === "cancelled") return "cancelled";
  if (status === "unassigned") return "unassigned";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  throw new RangeError(`Unknown mdata load status: ${status}`);
}

export function toMdataStatus(status: DispatchStatus): string {
  if (status === "unassigned") return "draft";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "cancelled";
}

// Forward edges — the lifecycle's natural progression.
const forwardTransitions: Record<DispatchStatus, DispatchStatus[]> = {
  unassigned: ["assigned_not_dispatched", "cancelled"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled"],
  dispatched: ["in_transit", "driver_no_show", "driver_walkoff", "cancelled"],
  in_transit: ["delivered_pending_docs", "abandoned", "driver_walkoff", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "cancelled"],
  completed_docs_received: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};

/**
 * ZONE 1 reversible back-edges (owner ruling 2026-09-12: "a draggable column should be able to be
 * sent back etc."). These operational statuses can move BACKWARD as freely as forward — a dispatcher
 * who mis-drags a card must be able to undo it. A reverse move REQUIRES a reason (enforced at the
 * route) and posts NOTHING: none of these targets stamp stop actuals, mint driver bills, emit escrow
 * events, or fire the revenue latch (those all live at delivered_pending_docs and beyond).
 *
 * ZONE 2 (delivered_pending_docs, completed_docs_received) is DELIBERATELY excluded here. Those
 * statuses fired the two-event revenue latch (DR Unbilled/CR Line-Haul at delivery, DR A/R/CR
 * Unbilled at POD); moving backward out of either must run the existing reversing-entry poster
 * (Owner+Administrator, maker≠checker) — that is money-lane work that reuses the GL poster, not new
 * GL math invented here. Until that path is wired, Zone 2 stays forward-only rather than orphaning a
 * posted JE. Terminal exits (cancelled/abandoned/driver_walkoff/driver_no_show) are never reversible.
 */
export const REVERSIBLE_BACK_EDGES: ReadonlyArray<readonly [DispatchStatus, DispatchStatus]> = [
  ["assigned_not_dispatched", "unassigned"],
  ["dispatched", "assigned_not_dispatched"],
  ["in_transit", "dispatched"],
];

const allowedTransitions: Record<DispatchStatus, DispatchStatus[]> = (() => {
  const merged = Object.fromEntries(
    (Object.entries(forwardTransitions) as [DispatchStatus, DispatchStatus[]][]).map(([from, tos]) => [
      from,
      [...tos],
    ])
  ) as Record<DispatchStatus, DispatchStatus[]>;
  for (const [from, to] of REVERSIBLE_BACK_EDGES) {
    if (!merged[from].includes(to)) merged[from].push(to);
  }
  return merged;
})();

/**
 * True when a target status is a ZONE 1 backward move from the current status (see REVERSIBLE_BACK_EDGES).
 * The /transition route uses this to require a reason and to record `dispatch.load.status_reversed`,
 * distinguishing an intentional undo from a forward progression.
 */
export function isReverseTransition(currentMdataStatus: string, targetStatus: DispatchStatus): boolean {
  const from = fromMdataStatus(currentMdataStatus);
  return REVERSIBLE_BACK_EDGES.some(([f, t]) => f === from && t === targetStatus);
}

export function validateLoadStatusTransition(
  currentMdataStatus: string,
  targetStatus: DispatchStatus
): { ok: true } | { ok: false; from: DispatchStatus; to: DispatchStatus } {
  const currentStatus = fromMdataStatus(currentMdataStatus);
  if (!allowedTransitions[currentStatus].includes(targetStatus)) {
    return { ok: false, from: currentStatus, to: targetStatus };
  }
  return { ok: true };
}

/**
 * CC-3 queue 2b (2026-10-02) — the FULL mdata.load_status_enum transition table, owned here so ONE module holds every
 * transition rule. It is the canonical dispatch machine above, expressed over the full enum, plus the two things the
 * dispatch machine does not model: same-bucket granular steps (booked -> planned, dispatched -> at_pickup, ...) and the
 * billing tail (delivered* -> invoiced -> paid -> closed, driven by load-billing-lifecycle.service.ts).
 * It used to live in mdata/loads.routes.ts and had drifted 14 edges from the dispatch machine (no reverse edges,
 * no draft -> assigned_not_dispatched, no dispatched -> in_transit, booked/planned -> driver_no_show allowed);
 * verify-load-status-machines-agree.mjs recomputes the agreement and fails on any drift.
 */
export const MDATA_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  draft: ["booked", "planned", "unassigned", "cancelled", "assigned_not_dispatched"],
  booked: ["planned", "unassigned", "assigned", "assigned_not_dispatched", "cancelled"],
  planned: ["unassigned", "assigned", "assigned_not_dispatched", "cancelled"],
  unassigned: ["booked", "planned", "assigned", "assigned_not_dispatched", "cancelled"],
  assigned: ["assigned_not_dispatched", "dispatched", "driver_no_show", "cancelled", "draft"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled", "draft"],
  dispatched: ["at_pickup", "driver_no_show", "driver_walkoff", "cancelled", "assigned_not_dispatched", "in_transit"],
  at_pickup: ["in_transit", "driver_walkoff", "cancelled", "assigned_not_dispatched", "driver_no_show"],
  in_transit: ["at_delivery", "abandoned", "driver_walkoff", "cancelled", "dispatched", "delivered_pending_docs"],
  at_delivery: ["delivered", "delivered_pending_docs", "cancelled", "dispatched", "abandoned", "driver_walkoff"],
  delivered: ["delivered_pending_docs", "completed_docs_received", "invoiced", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "invoiced", "cancelled"],
  completed_docs_received: ["invoiced", "closed"],
  invoiced: ["paid", "closed"],
  paid: ["closed"],
  closed: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};


/** true when a load can no longer transition forward (cancelled / completed / abandoned / walkoff / no-show). */
export function isTerminalLoadStatus(currentMdataStatus: string): boolean {
  return allowedTransitions[fromMdataStatus(currentMdataStatus)].length === 0;
}

/**
 * Owner order 2026-09-05 (spec §1, "Silent no-op is a defect"): the /transition endpoint's 400 for
 * an invalid transition carried no human-readable guidance, only the bare `from`/`to` status codes
 * -- a dispatcher dragging a `draft` load straight into the Dispatched Kanban lane saw
 * "invalid_transition" with no instruction that the load must go through Assigned first. Exposes the
 * from-state's own legal next steps so a route/toast can say WHY, not just THAT.
 */
export function allowedNextStatuses(currentMdataStatus: string): DispatchStatus[] {
  return allowedTransitions[fromMdataStatus(currentMdataStatus)];
}

const STATUS_LABEL: Record<DispatchStatus, string> = {
  unassigned: "Unassigned",
  assigned_not_dispatched: "Assigned",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered_pending_docs: "Delivered (pending docs)",
  completed_docs_received: "Completed",
  cancelled: "Cancelled",
  abandoned: "Abandoned",
  driver_walkoff: "Driver walkoff",
  driver_no_show: "Driver no-show",
};

/** Builds the human-readable reason for an invalid-transition 400 (see allowedNextStatuses above). */
export function describeInvalidTransition(from: DispatchStatus, to: DispatchStatus): string {
  const next = allowedTransitions[from];
  if (next.length === 0) {
    return `${STATUS_LABEL[from]} is a final state — it cannot move to ${STATUS_LABEL[to]}.`;
  }
  const options = next.map((s) => STATUS_LABEL[s]).join(" or ");
  return `Cannot move directly from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]} — move it to ${options} first.`;
}

/**
 * Guards raw driver-PWA stop arrival/departure writes to `mdata.loads.status`.
 *
 * `at_pickup`/`at_delivery` are stop micro-states that both live inside the `dispatched`/`in_transit`
 * lifecycle stages, so an idempotent move within the same stage (from === to) is allowed. Any other
 * move must be a legal forward transition. This blocks resurrecting a terminal load (e.g. a driver
 * PWA tapping "arrived" on a CANCELLED load) without altering the allowed-transition table.
 */
export function validateLoadStopStatusWrite(
  currentMdataStatus: string,
  targetMdataStatus: string
): { ok: true } | { ok: false; from: DispatchStatus; to: DispatchStatus } {
  const from = fromMdataStatus(currentMdataStatus);
  const to = fromMdataStatus(targetMdataStatus);
  if (to === from || allowedTransitions[from].includes(to)) {
    return { ok: true };
  }
  return { ok: false, from, to };
}
