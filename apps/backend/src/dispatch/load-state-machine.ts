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

const allowedTransitions: Record<DispatchStatus, DispatchStatus[]> = {
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
