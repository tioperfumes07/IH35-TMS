/**
 * QBO-parity sizing tokens (A3). Non-financial UI only.
 *
 * Measured live from QBO: create/edit side panels ≈ 576–582px (~29–30% of
 * viewport); New-Customer-style forms = centered modal ~700–800px; transaction
 * editors are full-page (not a drawer). Fields are compact (~36–40px).
 */
export const paritySizing = {
  /** Create/edit right-drawer width (~30% viewport). */
  drawerWidthPx: 576,
  /** Wider drawer variant. */
  drawerWidthWidePx: 700,
  /** Centered modal card width (New Customer etc.). */
  modalCardWidthPx: 760,
  /** Compact form field height inside drawers. */
  fieldHeightPx: 38,
} as const;

/** Tailwind width classes: full-bleed on mobile, bounded on desktop. */
export const PARITY_DRAWER_WIDTH = "w-full sm:w-[576px]";
export const PARITY_DRAWER_WIDTH_WIDE = "w-full sm:w-[700px]";
export const PARITY_MODAL_WIDTH = "w-full sm:w-[760px]";
