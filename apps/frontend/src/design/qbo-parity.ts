/**
 * C-18 + D47..D54 — ONE QuickBooks-parity typography/control token pass (owner register 2026-09-30).
 * Do not invent new palette colors. Every value reuses the locked house tokens
 * (`docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md`, ROUND 150 palette, tableBodyRule / tableColumnRule).
 *
 * D47 date · D48 number · D49 banking action size · D50 row YES / column NO ·
 * D51 header one step larger · D52 filter control size · D53 print/export icons ·
 * D54 banking actions Add / Match / Record transfer · C-18 surface/edge/row contrast.
 */

/** C-18 — perceivable surface / edge / divider (not near-white on #F4F6F8). */
export const QBO_SURFACE = {
  /** Page canvas — ROUND 150. */
  canvas: "#F4F6F8",
  /** Card / pane fill. */
  surface: "#FFFFFF",
  /** Locked 1px edge (GLOBAL-TYPE-SIZE-BASELINE). */
  border: "#E5E7EB",
  /** Row / section divider — tableBodyRule (--line), not oklch near-white. */
  divider: "#D8DEE6",
  /** Header / group rule — tableColumnRule (--line2). */
  dividerStrong: "#C7D2DC",
  rowStripe: "#FAFBFC",
  rowHover: "#EEF2F7",
  rowSelected: "#EAECF1",
  shadow: "0 1px 2px rgba(15,23,42,0.06)",
} as const;

/** Tailwind / class strings for C-18 surfaces (shared by master-detail + lists). */
export const QBO_SURFACE_CLASS = {
  pane: "rounded-sm border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
  rowBorder: "border-b border-[#D8DEE6]",
  rowStripe: "even:bg-[#FAFBFC]",
  rowHover: "hover:bg-[#EEF2F7]",
  rowSelected: "bg-[#EAECF1]",
} as const;

/**
 * D47 — date display policy (QuickBooks screenshots):
 * - transaction / roster lists → short `M/D/YY` (e.g. 9/14/26)
 * - banking / statements / forms → padded `MM/DD/YYYY` (e.g. 07/31/2026)
 * Storage stays ISO YYYY-MM-DD.
 */
export const QBO_DATE = {
  listPlaceholder: "M/D/YY",
  bankingPlaceholder: "MM/DD/YYYY",
  listFormat: "M/D/YY" as const,
  bankingFormat: "MM/DD/YYYY" as const,
} as const;

/**
 * D48 — money cell chrome. Amount strings still come from `lib/money.ts` (`$5,500.00`).
 * Every money column MUST use this class (right-aligned + tabular figures).
 */
export const QBO_MONEY_CELL_CLASS = "text-right tabular-nums";

/** D49 — Banking Action column / date text: body 12px, not the ultra 11px hairline. */
export const QBO_BANKING_ACTION_TEXT_CLASS = "text-xs leading-5 text-[#1A2233]";

/**
 * D50 — QuickBooks / owner ruling 2026-09-30: row separators YES, vertical body column rules NO.
 * Header/group bands keep COMPLETE-OUTLINE (all four sides). Body never draws borderRight.
 */
export const QBO_TABLE_RULES = {
  /** Default list + Load Costs body — horizontal row rule only. */
  list: "row" as const,
  /** Reserved label; body grid column rules are retired by QBO-ROWS-NOT-COLUMNS. */
  grid: "retired-body-columns" as const,
} as const;

/**
 * D51 — column header text is one step LARGER than row text (QBO-HEADER-OUTRANKS-ROW).
 * Matches ParityTable: Math.max(panelHeader ?? 11, rowFont + 1).
 */
export function qboHeaderFontPx(rowFontPx: number, panelHeaderPx = 11): number {
  return Math.max(panelHeaderPx, rowFontPx + 1);
}

/**
 * D52 — multi-select / filter control at QuickBooks sizes.
 * Live measured bare input was 131×33 with border 0px. House filter is h-10 (40px) + real border + min-width.
 */
export const QBO_FILTER_CONTROL_SIZE_CLASS =
  "h-10 min-w-[10rem] text-xs border border-[#E5E7EB] bg-white rounded-sm";

/** D53 — Print + Export sit right of the pager, beside the gear (QuickBooks toolbar position). */
export const QBO_TOOLBAR_ICON_SLOT = "parity-qbo-toolbar-icons";

/**
 * D54 — Banking action set the owner used for 25+ years in QuickBooks.
 * Labels only — posters stay acceptBankReconMatch / categorize / createTransfer.
 */
export const QBO_BANKING_ACTIONS = {
  add: "Add",
  match: "Match",
  recordTransfer: "Record transfer",
} as const;
