/**
 * C-16 / C-03 / C-17 — master-detail split + surface tokens (Customers / Vendors / Drivers).
 * Lead measured live 2026-09-30: master 440px (20.8%) vs detail 1662px (78.6%) — too narrow.
 * Owner: "the master data showing on the left side should be wider".
 *
 * Token, not a magic number. Min keeps the list usable; max keeps detail readable.
 * Surfaces reuse C-18 `QBO_SURFACE` (#E5E7EB / #FFFFFF / house shadow) — no new palette.
 */
import { QBO_SURFACE_CLASS } from "./qbo-parity";

export const MASTER_DETAIL = {
  /**
   * Tailwind width utilities for the master (list) pane at xl+.
   * Explicit `xl:w-[Npx]` required — MD-WIDTH-0 / #20910 (0px pane when only min/max).
   * C-16: 640px default (was 440 = 20.8%); min 480 · max 760.
   */
  masterPaneClass:
    "w-full shrink-0 xl:w-[640px] xl:min-w-[480px] xl:max-w-[760px]",
  /** Detail pane grows into remaining width. */
  detailPaneClass: "min-w-0 flex-1",
  /** Flex gap between master and detail. */
  gapClass: "gap-3",
  /** Outer shell: stack on narrow, row on xl+. */
  shellClass: "flex flex-col gap-3 xl:flex-row",
  /** Shell / pane surface — C-03 / C-18. */
  surfaceClass: QBO_SURFACE_CLASS.pane,
  /** Perceivable row separator (C-04 / C-18 — not near-white oklch). */
  rowBorderClass: QBO_SURFACE_CLASS.rowBorder,
  rowHoverClass: QBO_SURFACE_CLASS.rowHover,
  rowStripeClass: QBO_SURFACE_CLASS.rowStripe,
  rowSelectedClass: QBO_SURFACE_CLASS.rowSelected,
  /** C-01 inactive segmented pill tint — never rgba(0,0,0,0). */
  segmentInactiveClass: "bg-[#F3F4F6] text-[#1F2A44] hover:bg-[#E5E7EB]",
  segmentActiveClass: "bg-[#1F2A44] text-white",
} as const;
