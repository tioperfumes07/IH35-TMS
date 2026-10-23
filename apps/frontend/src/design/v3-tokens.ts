/**
 * ROUND 443.250 — ONE design system tokens (owner 10-22 6:00 PM CT).
 * Single source for every V3 screen and every tab restyle. No per-page hex.
 */
export const V3 = {
  shell: "#13233F",
  data: "#1E3A5F",
  slate: "#94A3B8",
  slateLt: "#CBD5E1",
  ink: "#111827",
  muted: "#5B6576",
  border: "#DDE1E7",
  borderSoft: "#ECEEF2",
  page: "#F4F3EF",
  surface: "#FFFFFF",
  headerBg: "#F7F8FA",
  green: "#15803D",
  red: "#B91C1C",
  amber: "#B45309",
  link: "#1D4ED8",
  live: "#22C55E",
  font: "Inter, ui-sans-serif, system-ui, sans-serif",
} as const;

/** Expense groups in owner order for two-sided cash views. */
export const V3_EXPENSE_GROUPS = [
  "finance & lease",
  "driver bills",
  "diesel",
  "maintenance",
  "insurance",
  "other",
] as const;

export type V3ExpenseGroup = (typeof V3_EXPENSE_GROUPS)[number];

export const V3_KPI = {
  labelPx: 10,
  valuePx: 18,
  subPx: 11,
} as const;

export const V3_TABLE = {
  rowPadY: 7,
  fontPx: 12,
  headerPx: 11,
} as const;

/**
 * ROUND 443.254 / 443.250 — same design system for overlays (modals, drawers,
 * pop-ups, wizards, toasts). Convert existing surfaces as each module is touched.
 */
export const V3_OVERLAY = {
  backdrop: "rgba(19, 35, 63, 0.45)",
  panelBg: V3.surface,
  panelBorder: V3.border,
  panelRadiusPx: 2,
  panelShadow: "0 8px 24px rgba(19, 35, 63, 0.18)",
  headerBg: V3.headerBg,
  headerBorder: V3.border,
  titlePx: 14,
  titleWeight: 600,
  titleColor: V3.ink,
  bodyPx: 12,
  bodyColor: V3.ink,
  mutedColor: V3.muted,
  zModal: 50,
  zDrawer: 40,
  zToast: 60,
  zPopover: 45,
} as const;

export const V3_MODAL = {
  ...V3_OVERLAY,
  maxWidthPx: 560,
  padPx: 16,
} as const;

export const V3_DRAWER = {
  ...V3_OVERLAY,
  widthPx: 420,
  padPx: 16,
} as const;

export const V3_TOAST = {
  bg: V3.shell,
  text: "#FFFFFF",
  ok: V3.green,
  err: V3.red,
  warn: V3.amber,
  fontPx: 12,
  radiusPx: 2,
  z: V3_OVERLAY.zToast,
} as const;

export const V3_WIZARD = {
  ...V3_MODAL,
  maxWidthPx: 720,
  stepLabelPx: 11,
} as const;
