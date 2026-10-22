import type { LoadStatus } from "../../api/loads";
// LEAD 443.206R — load status labels + status groups live in lib/load-status.ts (loadStatusLabel / LOAD_STATUS_GROUPS).

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
