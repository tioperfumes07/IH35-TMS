/**
 * QBO-parity sizing tokens (A3). Non-financial UI only.
 *
 * Measured live from QBO: create/edit side panels ≈ 576–582px (~29–30% of
 * viewport); New-Customer-style forms = centered modal ~700–800px; Expense /
 * Bill / Bill-payment create use this drawer (owner creator-chrome lock).
 * Fields are compact (~36–40px).
 */
export const paritySizing = {
  /** Create/edit right-drawer width (~30% viewport). */
  drawerWidthPx: 576,
  /**
   * C7 create-drawer width. Owner-specified 480px for the shared `<Modal variant="drawer">` that
   * every "+ Create"/"+ Book" surface opens in. Narrower than the 576px ParityDrawer on purpose:
   * a create form is a single column of fields, and the list it was launched from must stay
   * readable behind it.
   */
  createDrawerWidthPx: 480,
  /** Wider drawer variant. */
  drawerWidthWidePx: 700,
  /** Centered modal card width (New Customer etc.). */
  modalCardWidthPx: 760,
  /** Compact form field height inside drawers (QBO ~36–40px). */
  fieldHeightPx: 38,
  /** Shared chrome inset — matches px-4 / py-3 on Modal + ParityDrawer. */
  chromePadXPx: 16,
  chromePadYPx: 12,
} as const;

/** Tailwind field height token — prefer this over ad-hoc h-10/h-12 in chrome shells. */
export const PARITY_FIELD_HEIGHT_CLASS = "h-[38px] min-h-[38px]";

/** Tailwind width classes: full-bleed on mobile, bounded on desktop. */
export const PARITY_DRAWER_WIDTH = "w-full sm:w-[576px]";
/** C7 shared create-drawer: full-bleed on mobile, 480px from `sm` up. */
export const PARITY_CREATE_DRAWER_WIDTH = "w-full sm:w-[480px]";
export const PARITY_DRAWER_WIDTH_WIDE = "w-full sm:w-[700px]";
export const PARITY_MODAL_WIDTH = "w-full sm:w-[760px]";
