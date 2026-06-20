═══════════════════════════════════════════════════════════════════════════════
IH35-TMS — ALL PENDING BLOCKS — README (repo placement + tracking)
Authored by GUARD · 2026-06-19
═══════════════════════════════════════════════════════════════════════════════
PURPOSE: every pending block as an individual file so the work is in the repo, trackable,
and never forgotten. Each block is self-contained (locks, tier, status tag, scope,
acceptance, standing orders).

CODER — DO THIS:
1. Place these files in the repo under: docs/blocks/  (create the dir; additive).
2. Add a row per block to the latest IH35TMSMASTERTRACKER xlsm — match each file's
   phase/task naming to a tracker row; never invent IDs (add the tracker row first if new).
3. Commit as a docs PR (non-financial → auto-merge on green CI). Do NOT start building from
   them until the relevant START GATE/sequence says so.

STATUS TAGS (how much work each is):
  • LIVE-TRACED  = GUARD verified the gap live; block is exact.
  • DONE         = shipped + GUARD-verified live; tracked as complete so it's not re-opened.
  • BUILD        = genuinely not built; construction block.
  • MIGRATE      = data migration; STOPS for Jorge; CI is the fresh-DB gate.
  • VERIFY+FLAG  = built behind an OFF flag (404 'feature_disabled' live BY DESIGN); verify + flag, don't rebuild.
  • VERIFY-STATE = inventory-derived (coder's repo mining), NOT GUARD-live-verified; coder
                   confirms current live state + the spec (RESPOND-BEFORE-CODE) before building.
  • GATED        = needs Jorge's explicit OK before it proceeds.

GOVERNANCE (all blocks): RESPOND-BEFORE-CODE, additive-only, per-entity, reuse locked
components, North-Star (reach/surpass QuickBooks/NetSuite/McLeod/Alvys), CI guard on every
fix. Tier 1 (money/migration/flag-ON/mass-flip) STOPS for Jorge.

THE TWO COMPANION ZIPS (the complete pending set):
  • IH35-ACCOUNTING-FINANCE-CONNECTIONS-FULL.zip — 27 blocks (Parts A–D: chain, AF-0→8, CONN, FH/VOID/STMT).
  • THIS ZIP — all other lanes (HOS/telematics, table/UX, dispatch, Samsara CAP, maintenance,
    insurance, Mexico-ops, safety/PWA, reports, enterprise, driver-lifecycle).
Together = every pending block in the program.
