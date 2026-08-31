import type { LoadStatus } from "../../api/loads";

export const DISPATCH_STATUS_GROUPS: Array<{
  key: string;
  title: string;
  collapsedByDefault?: boolean;
  statuses: LoadStatus[];
}> = [
  { key: "pending", title: "Pending Assignment", statuses: ["draft", "booked", "planned"] },
  { key: "assigned", title: "Assigned", statuses: ["assigned", "dispatched"] },
  { key: "in_transit", title: "In Transit", statuses: ["at_pickup", "in_transit", "at_delivery"] },
  { key: "delivered", title: "Delivered", statuses: ["delivered"] },
  { key: "completed", title: "Completed", statuses: ["invoiced", "paid", "closed"] },
  { key: "cancelled", title: "Cancelled", statuses: ["cancelled", "abandoned"], collapsedByDefault: true },
];

export const STATUS_LABEL: Record<LoadStatus, string> = {
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
};

// §7 palette: the load `flag_code` used to render as a color-emoji circle (green/blue/yellow/orange/
// red/purple/black/white, via a FLAG_EMOJI_BY_CODE map) — forbidden on two counts: emoji in table/board
// chrome, and several of
// those hues (blue/purple) are explicitly off the locked navy/slate/red palette (CLAUDE.md §7: "No
// purple/blue/pink"). Rather than recolor a subset and leave the rest, a set flag now renders as a
// small locked-navy letter-tag badge; the flag identity (still load-bearing dispatcher-set data) is
// carried by the tag letter + the `title` tooltip/aria-label, not by hue. Only RED keeps the locked
// --red (#dc2626) accent (an explicitly allowed §7 hex). GRAY means "no flag set" and renders nothing
// (matches how an unflagged load reads today — the old white-circle emoji was effectively invisible).
export const FLAG_LABEL_BY_CODE: Record<string, string> = {
  GRAY: "Gray flag",
  GREEN: "Green flag",
  BLUE: "Blue flag",
  YELLOW: "Yellow flag",
  ORANGE: "Orange flag",
  RED: "Red flag",
  PURPLE: "Purple flag",
  BLACK: "Black flag",
};

export const FLAG_TAG_BY_CODE: Record<string, string> = {
  GREEN: "G",
  BLUE: "B",
  YELLOW: "Y",
  ORANGE: "O",
  RED: "R",
  PURPLE: "P",
  BLACK: "K",
};

export function hasVisibleFlag(flagCode: string | null | undefined): boolean {
  return Boolean(flagCode && flagCode !== "GRAY" && FLAG_TAG_BY_CODE[flagCode]);
}

export function flagDotColor(flagCode: string | null | undefined): string {
  return flagCode === "RED" ? "#DC2626" : "#1F2A44";
}

export function flagDotLabel(flagCode: string | null | undefined): string {
  return (flagCode && FLAG_LABEL_BY_CODE[flagCode]) || FLAG_LABEL_BY_CODE.GRAY;
}

export function flagDotTag(flagCode: string | null | undefined): string {
  return (flagCode && FLAG_TAG_BY_CODE[flagCode]) || "?";
}

export function formatMoneyCents(valueCents: number | null | undefined, currency?: string | null) {
  // No-load rows (truck-centric "Awaiting assignment") have no rate/currency — render an em dash.
  // Never call Intl.NumberFormat with a null amount or a missing currency code (both throw and
  // crashed the whole List/Table grid via the error boundary).
  if (valueCents == null || Number.isNaN(Number(valueCents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(valueCents) / 100);
}

export function formatMoneyDollars(valueDollars: number | null | undefined, currency?: string | null) {
  if (valueDollars == null || Number.isNaN(Number(valueDollars))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(valueDollars));
}

export function toRouteSummary(pickup?: string | null, delivery?: string | null) {
  const from = pickup || "Unknown origin";
  const to = delivery || "Unknown destination";
  return `${from} -> ${to}`;
}

export function canDragLoad(status: LoadStatus) {
  return status !== "cancelled" && status !== "closed" && status !== "paid" && status !== "invoiced";
}

export function normalizeStatusToColumnKey(status: LoadStatus): string {
  const group = DISPATCH_STATUS_GROUPS.find((entry) => entry.statuses.includes(status));
  return group?.key ?? "pending";
}
