/**
 * ROUND 203/205 (owner, 2026-09-28) — "white background, wrong contrast between elements... tokens
 * for surface/border/text." Same defect CC-2 found and fixed on Banking (#23053, ROUND 197): pages
 * hand-roll their own raw hex for surface/border/text instead of the ONE locked palette, so values
 * drift (e.g. TruckLineBoard.tsx used #C7D2DC for borders and #374151/#1F2937 for text instead of
 * the locked #E5E7EB/#1F2A44/#0F1219) and different boards end up with subtly different, unintended
 * contrast. Every value below is transcribed verbatim from docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md
 * (Claude+Jorge approved 2026-06-07, LOCKED) and matches BankingControlBox.tsx's own constants
 * exactly (BANKING_BOX_SURFACE/_BORDER/_TEXT_PRIMARY/_TEXT_SECONDARY/_TEXT_MUTED/_ACTIVE_BG/
 * _PAGE_BG) — one canonical source both files agree with, not a second competing definition.
 * No new colors invented; no dark-mode values added (per BankingControlBox.tsx's own REMAINING
 * note: no dark-mode token pairing exists anywhere in this codebase yet — inventing one here would
 * be exactly the "propose a new scale" violation the baseline's own instructions forbid).
 */
export const LOCKED_SURFACE = "#FFFFFF";
export const LOCKED_PAGE_BG = "#F7F8FA";
export const LOCKED_BORDER = "#E5E7EB";
export const LOCKED_TEXT_PRIMARY = "#0F1219";
export const LOCKED_TEXT_SECONDARY = "#1F2A44";
export const LOCKED_TEXT_MUTED = "#6B7280";
export const LOCKED_HEADER_TEXT = "#4B5563"; // column/section headers (page subheads), 11px/700/UPPERCASE
export const LOCKED_ACTIVE_BG = "#14314F"; // navy — rail/topbar/active-state, NAVY-NOT-BLACK LAW
