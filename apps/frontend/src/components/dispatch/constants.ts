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
  assigned: "Assigned",
  dispatched: "Dispatched",
  at_pickup: "At Pickup",
  in_transit: "In Transit",
  at_delivery: "At Delivery",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  closed: "Closed",
  cancelled: "Cancelled",
  abandoned: "Abandoned",
};

export const FLAG_EMOJI_BY_CODE: Record<string, string> = {
  GRAY: "⚪",
  GREEN: "🟢",
  BLUE: "🔵",
  YELLOW: "🟡",
  ORANGE: "🟠",
  RED: "🔴",
  PURPLE: "🟣",
  BLACK: "⚫",
};

export function formatMoneyCents(valueCents: number | null | undefined, currency?: string | null) {
  // No-load rows (truck-centric "Awaiting assignment") have no rate/currency — render an em dash.
  // Never call Intl.NumberFormat with a null amount or a missing currency code (both throw and
  // crashed the whole List/Table grid via the error boundary).
  if (valueCents == null || Number.isNaN(Number(valueCents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(Number(valueCents) / 100);
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
