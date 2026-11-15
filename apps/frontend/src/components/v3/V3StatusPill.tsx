/**
 * The V3 status pill, as drawn on every approved board (docs/design/v3/*.dc.html):
 *   font 600 11px Inter · padding 2px 7px · border-radius 10px · tone background + tone ink.
 * Measured on Dispatch-LoadHistory.dc.html: Dispatched / In transit = #EFF6FF on #1D4ED8, Delivered · docs = #FFFBEB on
 * #B45309, Invoiced = #ECFDF3 on #15803D, Assigned = #F1F5F9 on #475569.
 */
import type { CSSProperties, ReactNode } from "react";

export type V3PillTone = "blue" | "amber" | "green" | "slate" | "red";

export const V3_PILL_TONES: Record<V3PillTone, { bg: string; ink: string }> = {
  blue: { bg: "#EFF6FF", ink: "#1D4ED8" },
  amber: { bg: "#FFFBEB", ink: "#B45309" },
  green: { bg: "#ECFDF3", ink: "#15803D" },
  slate: { bg: "#F1F5F9", ink: "#475569" },
  red: { bg: "#FEF2F2", ink: "#B91C1C" },
};

/** Load status → tone (blue moving, amber docs owed, green billed/closed, red cancelled, slate the rest). */
export function loadStatusTone(status: string | null | undefined): V3PillTone {
  switch (String(status ?? "")) {
    case "dispatched":
    case "in_transit":
    case "at_pickup":
    case "at_delivery":
      return "blue";
    case "delivered":
    case "delivered_pending_docs":
      return "amber";
    case "invoiced":
    case "paid":
    case "closed":
    case "completed_docs_received":
      return "green";
    case "cancelled":
      return "red";
    default:
      return "slate";
  }
}

export function V3StatusPill({ tone, children, testId }: { tone: V3PillTone; children: ReactNode; testId?: string }) {
  const t = V3_PILL_TONES[tone];
  const style: CSSProperties = {
    // The design's pill is a plain inline <span> (no display) inside the <td>.
    display: "inline",
    background: t.bg,
    color: t.ink,
    font: "600 11px Inter, ui-sans-serif, system-ui, sans-serif",
    lineHeight: "normal",
    padding: "2px 7px",
    borderRadius: 10,
    whiteSpace: "nowrap",
  };
  return (
    <span style={style} data-testid={testId}>
      {children}
    </span>
  );
}

/** A record link inside a V3 board table: #1D4ED8, 600, no underline until hover (design: <a style="color:#1D4ED8;font-weight:600">). */
export const V3_TABLE_LINK_CLASS =
  "font-semibold text-[#1D4ED8] no-underline hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B7280] focus-visible:ring-offset-1";

/** V3 board header actions (every .dc.html header): 28px · 0 12px · radius 6 · 600 12px Inter. */
export const V3_HEADER_BTN: CSSProperties = {
  height: 28,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 6,
  font: "600 12px Inter, ui-sans-serif, system-ui, sans-serif",
  lineHeight: "normal",
  background: "#fff",
  color: "#111827",
  border: "1px solid #DDE1E7",
  cursor: "pointer",
  textDecoration: "none",
};
/** The navy primary header action. */
export const V3_HEADER_BTN_PRIMARY: CSSProperties = { ...V3_HEADER_BTN, background: "#13233F", color: "#fff", border: "none" };
