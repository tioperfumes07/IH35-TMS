/**
 * LEAD 443.206R (owner law 2026-09-28 "ALL LOAD BOARD VIEWS ARE ONE SERVICE") — THE one place the frontend names a load
 * status or a set of load statuses. Register C5: STATUS_LABEL had no 'voided' key (rendered undefined), 5 renderers printed
 * the raw enum with replace(/_/g, " "), 4 private label maps disagreed; register B11: the same status sets were copied as
 * literals into roundTripsLegs, DispatchKanban, DispatchOverview, Drivers and constants. Every one now imports from here.
 * Guard: scripts/verify-fe-load-labels-and-status-sets.mjs.
 */

/** Every value of mdata.load_status_enum (incl. 'voided'). */
export const LOAD_STATUS_VALUES = [
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
  "voided",
] as const;

export type LoadStatusValue = (typeof LOAD_STATUS_VALUES)[number];

const LOAD_STATUS_LABELS: Record<LoadStatusValue, string> = {
  draft: "Draft",
  booked: "Booked",
  planned: "Planned",
  unassigned: "Unassigned",
  assigned: "Assigned",
  assigned_not_dispatched: "Assigned (not dispatched)",
  dispatched: "Dispatched",
  at_pickup: "At Pickup",
  in_transit: "In Transit",
  at_delivery: "At Delivery",
  delivered: "Delivered",
  delivered_pending_docs: "Delivered (pending docs)",
  completed_docs_received: "Docs received",
  invoiced: "Invoiced",
  paid: "Paid",
  closed: "Closed",
  cancelled: "Cancelled",
  abandoned: "Abandoned",
  driver_walkoff: "Driver walk-off",
  driver_no_show: "Driver no-show",
  voided: "Voided",
};

export function isLoadStatus(status: string | null | undefined): status is LoadStatusValue {
  return typeof status === "string" && (LOAD_STATUS_VALUES as readonly string[]).includes(status);
}

/** THE label for a load status. An unknown value (a status added server-side before this list) is shown humanized, never undefined. */
export function loadStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  if (isLoadStatus(status)) return LOAD_STATUS_LABELS[status];
  return status.replace(/_/g, " ");
}

/**
 * DISPATCH WORK — the board set's status half (backend canonical-active-load-set.ts DISPATCH_WORK_LOAD_STATUSES / views.live_loads
 * open_dispatch): booked through at_delivery. Every board's "live" status list is this array.
 */
export const DISPATCH_WORK_STATUSES = [
  "booked",
  "planned",
  "assigned",
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
] as const satisfies readonly LoadStatusValue[];

/** Delivered, docs pending — views.live_loads pre_settlement. */
export const DELIVERED_STATUSES = ["delivered", "delivered_pending_docs", "completed_docs_received"] as const satisfies readonly LoadStatusValue[];

/** The billing tail — follows the receivable. */
export const BILLED_STATUSES = ["invoiced", "paid", "closed"] as const satisfies readonly LoadStatusValue[];

/** Delivered and past (money / paperwork tail). */
export const BACKLOG_STATUSES = [...DELIVERED_STATUSES, ...BILLED_STATUSES] as const;

/** Terminal exits — the load did not run (or was voided). */
export const TERMINAL_EXIT_STATUSES = ["cancelled", "abandoned", "driver_walkoff", "driver_no_show", "voided"] as const satisfies readonly LoadStatusValue[];

/** A truck carrying it right now (dispatched through at_delivery). */
export const ON_TRUCK_STATUSES = ["dispatched", "at_pickup", "in_transit", "at_delivery"] as const satisfies readonly LoadStatusValue[];

/** The status groups a grouped board renders, in order (List / Kanban grouping; every value appears once). */
export const LOAD_STATUS_GROUPS: Array<{ key: string; title: string; collapsedByDefault?: boolean; statuses: LoadStatusValue[] }> = [
  { key: "pending", title: "Pending Assignment", statuses: ["draft", "booked", "planned", "unassigned"] },
  { key: "assigned", title: "Assigned", statuses: ["assigned", "assigned_not_dispatched", "dispatched"] },
  { key: "in_transit", title: "In Transit", statuses: ["at_pickup", "in_transit", "at_delivery"] },
  { key: "delivered", title: "Delivered", statuses: [...DELIVERED_STATUSES] },
  { key: "completed", title: "Completed", statuses: [...BILLED_STATUSES] },
  { key: "cancelled", title: "Cancelled", statuses: [...TERMINAL_EXIT_STATUSES], collapsedByDefault: true },
];

/**
 * The same sets in the DISPATCH API vocabulary (GET /api/v1/dispatch/loads?status= — the dispatch machine folds at_pickup into
 * dispatched and at_delivery into in_transit). A caller that wants the whole board passes NO status (the load service default).
 */
export const DISPATCH_API_ROLLING_STATUSES = ["dispatched", "in_transit"] as const;
export const DISPATCH_API_TRUCK_COMMITTED_STATUSES = ["assigned_not_dispatched", "dispatched", "in_transit", "delivered_pending_docs"] as const;

/**
 * THE draft definition (register B9): a load is a draft when its status is 'draft' OR it is a quick-save draft — the List pill
 * and the sidebar badge both read this; the sidebar's quick-save-only count was a second definition.
 */
export function isDraftLoad(load: { status?: string | null; is_quicksave_draft?: boolean | null }): boolean {
  return load.status === "draft" || load.is_quicksave_draft === true;
}
