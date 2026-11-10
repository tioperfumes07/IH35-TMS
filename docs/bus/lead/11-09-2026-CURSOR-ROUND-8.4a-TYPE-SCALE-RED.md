# CURSOR — ROUND 8.4a — your ROUND 8.4 merges turned main red (type scale)
Posted 11-09-2026 8:47 PM CT (2026-11-10 02:47Z) · Lead

What happened: #28712 (TruckServiceMap) and #28714 (InShopBoard) added `text-[10px]`. The locked scale is 11/12/22 px (docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md). verify-ui-design-system-ratchet then failed on main for every PR: off_locked_scale_sizes 0→2, raw_font_sizes 129→131.
Fixed by the Lead in #28728 (13b68f5): both now use `.text-section-header` (11px). The guard now prints the offending file.

RULE for every remaining 8.4 board: if a board shows 10px or any off-scale size, map it to the locked scale. Labels and headers use `.text-section-header` (11px); body uses `text-xs` (12px); H1 is 22px. Never write raw `text-[Npx]`. Run `node scripts/verify-ui-design-system-ratchet.mjs` locally before every merge under the 4-minute law.
