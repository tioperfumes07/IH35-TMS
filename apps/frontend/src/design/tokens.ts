export const colors = {
  // §7 LOCKED palette (CLAUDE.md §7) — the canonical accent/emphasis tokens. Active states
  // (active tab, active sort, active page, selection, card emphasis) use navy/slate — NEVER blue/
  // purple/pink. These supersede the package's #185fa5 accent (§7 governs). Guarded by
  // verify:section7-palette-maintenance.
  navy: "#1F2A44",
  navyDk: "#0F1729",
  slate: "#334155",
  slateLt: "#64748B",
  accentTint: "#EAECF1", // §7 active-state light tint (selected row / active fill) — replaces light-blue
  topbarBg: "#1F2A44",
  sidebarBg: "#1F2A44",
  sidebarBorder: "#2A3242",
  sidebarTextMuted: "#9CA3AF",
  sidebarTextActive: "#FFFFFF",
  sidebarActiveBorder: "#3B82F6",
  bodyBg: "#F7F8FA",
  cardBg: "#FFFFFF",
  cardBorder: "#E5E7EB",
  cardBorderStrong: "#D1D5DB",
  pageHeading: "#0F1219",
  bodyText: "#1F2937",
  mutedText: "#6B7280",
  tinyLabel: "#9CA3AF",
  // GLOBAL-TYPE-SIZE-BASELINE.md: section labels stay 11px/700/UPPERCASE/#4B5563.
  // Owner 2026-09-03: TABLE header rows use navy fill + white type so they differentiate
  // from the white card. Type scale unchanged. Do not use this pair on buttons/chips/tabs.
  columnHeader: "#4B5563",
  tableHeaderBg: "#14314F",
  tableHeaderText: "#FFFFFF",
  safety: { strong: "#DC2626", soft: "#FEE2E2" },
  maintenance: { strong: "#6B7280", soft: "#F3F4F6" },
  dispatch: { strong: "#2563EB", soft: "#DBEAFE" },
  fuel: { strong: "#CA8A04", soft: "#FEF3C7" },
  drivers: { strong: "#16A34A", soft: "#DCFCE7" },
  fleet: { strong: "#7C3AED", soft: "#EDE9FE" },
  accounting: { strong: "#374151", soft: "#F3F4F6" },
  crit: { strong: "#DC2626", soft: "#FEE2E2" },
  warn: { strong: "#CA8A04", soft: "#FEF3C7" },
  info: { strong: "#2563EB", soft: "#DBEAFE" },
  positive: { strong: "#16A34A", soft: "#DCFCE7" },
  pwaBg: "#0F1219",
  pwaCardBg: "#1A2030",
  pwaCardBorder: "#2A3242",
  pwaText: "#E5E7EB",
  pwaTextMuted: "#9CA3AF",
} as const;

export const typography = {
  fontSerif: "'Source Serif Pro', 'Charter', Georgia, serif",
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  pageHeading: 22,
  pageSubtitle: 12,
  sectionSubhead: 11,
  tabItem: 12,
  bodyText: 13,
  bodyTextSmall: 12,
  tableRow: 11,
  kpiLabel: 9,
  kpiNumber: 14,
  statusBadge: 10,
  panelHeader: 11,
  tightUpper: "0.6px",
  looseUpper: "0.8px",
} as const;

export const spacing = {
  topbarHeight: 48,
  topbarPaddingY: 12,
  topbarPaddingX: 18,
  sidebarWidth: 80,
  sidebarItemHeight: 56,
  sidebarItemPaddingY: 8,
  pageContentPadding: 24,
  kpiCardHeight: 30,
  kpiCardPaddingX: 12,
  kpiCardGap: 6,
  subAreaTileHeight: 60,
  subAreaTilePadding: 10,
  subAreaTileGap: 8,
  subAreaTileBorderLeft: 3,
  panelHeaderHeight: 20,
  panelDataRowHeight: 22,
  panelPaddingX: 12,
  panelPaddingY: 10,
  panelBorderTop: 2,
  tableRowHeight: 24,
  tableHeaderHeight: 26,
  tableCellPaddingX: 8,
  // UI CONTROL LAW (owner ruling 2026-09-01) — one height for every "md" button regardless of
  // variant, matching filterControlHeight/FILTER_CONTROL_SIZE_CLASS so a button and a filter in
  // the same toolbar row read as one row. Was 32/28/24 (three different button heights — the
  // direct, file-level cause of the owner's "three different box sizes" report on the accounting
  // toolbar) — corrected here, not a fresh invention. buttonHeightSmall (icon/sm variant) also
  // raised: 24px sat exactly ON the WCAG 2.2 SC 2.5.8 floor with zero margin.
  buttonHeightPrimary: 36,
  buttonHeightSecondary: 36,
  buttonHeightSmall: 32,
  buttonPaddingX: 12,
  radiusCard: 4,
  radiusPill: 2,
  radiusButton: 4,
  sectionGap: 16,
  panelGap: 12,
  /** FILTER LAW (COLUMN LAW 2026-09-01) — the one control height every list-toolbar filter shares:
   * the search box (TableSearch), every combobox filter (components/Combobox.tsx's own trigger
   * box), and the Range popover's button/date/number inputs (UniversalListToolbar). Before this,
   * TableSearch was h-8 sitting next to a h-9 Combobox in the SAME row — a real, visible size
   * mismatch across every list page, not a cosmetic nit. Change this ONE number, not per-file
   * h-8/h-9 literals, if the app's control scale ever needs to move. */
  filterControlHeight: 36,
} as const;

/** FILTER LAW — the literal Tailwind class pairing every filter-row control (search box, combobox
 * trigger, range popover fields) must share. A plain string constant (not a computed style) so
 * Tailwind's static class scanner still finds it; the underlying number is `spacing.filterControlHeight`. */
export const FILTER_CONTROL_SIZE_CLASS = "h-9 text-xs";

/** UI CONTROL LAW (owner ruling 2026-09-01, docs/bus/UI-CONTROL-LAW-SPEC-2026-09-01.md) — the
 * app's ONE button scale. "md" (the size used everywhere a page renders a real action button —
 * Create, Void, Clear, Export, gear) matches FILTER_CONTROL_SIZE_CLASS's own height/font so a
 * button and a filter in the same toolbar read as one row. "iconSm" (icon-only / compact buttons)
 * is a second, smaller tier — raised from the pre-ruling h-6 (24px, exactly on the WCAG 2.2
 * SC 2.5.8 floor with zero margin) to h-8 (32px). */
export const BUTTON_MD_SIZE_CLASS = "h-9 px-3 text-xs font-medium";
export const BUTTON_ICON_SM_SIZE_CLASS = "h-8 text-xs font-medium";

/** UI CONTROL LAW — one size for every toolbar icon app-wide (Search, SlidersHorizontal, the
 * gear, etc.). The gear was the owner's own cited example of a control smaller than its
 * neighbours; this is the neighbours' actual size, standardized as the target rather than left
 * ambiguous. NOT the same as a control's HIT TARGET (BUTTON_ICON_SM_SIZE_CLASS above, or a
 * checkbox's wrapper) — a 16px glyph inside a 32px+ clickable button is the correct, intentional
 * combination per the owner's own ruling ("two different measurements and both must hold"). */
export const TOOLBAR_ICON_SIZE_CLASS = "h-4 w-4";

/** UI CONTROL LAW — the minimum clickable wrapper for a control whose own visual box is smaller
 * than the WCAG 2.2 SC 2.5.8 24x24 CSS px floor (a native checkbox, a small glyph). Wrap the
 * small visual element in a `min-h-6 min-w-6` (24px) flex-centered container; the wrapper is the
 * hit target, the child stays its native/small visual size. */
export const MIN_HIT_TARGET_CLASS = "flex min-h-6 min-w-6 items-center justify-center";

export const z = {
  dropdown: 30,
  modal: 50,
  toast: 60,
} as const;
