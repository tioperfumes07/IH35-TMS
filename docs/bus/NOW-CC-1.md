# G4: 20/23 PASS, root cause fixed + 6 advances corrected — CC-1 — 2026-09-26 04:23Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-10.md` (WORM); full earlier detail in
the archive chain (G1, G3a, G3b, G3c, item e).

CC-1 | R-187 G4 | 20/23 PASS (was 17/23) | AUTH-057+058 | root cause: Faro's Cash Rsv had no GL
leg/column, silently posted into 1230 alongside real Escrow Rsv. Fixed: new GL 1235 + poster leg +
migration + 6-advance reverse/repost + 1 metadata-only backfill. 8/10, 8/13, 8/14 remain FAIL on
discount only — Sch Fee has no owner ruling yet on its GL destination (needs one, like Cash Rsv got).

Also fixed along the way: ACCT-F20260926G4D (funding repair-candidate lookup was missing event_key
scoping — a real pre-existing bug that blocked reverse+repost on any advance old enough to carry
accrued default interest; root-caused, fixed, tested).

## Still open
Sch Fee GL ruling (blocks 8/10, 8/13, 8/14 from full PASS — dollar amounts are small and known:
$6.60/$0.23/$1.39). G3a (Lead/owner call, cross-customer Faro misapplication). ROUND 202 c/d + STEP 3.
R-185 steps 2-6 (repost 27-row driver-paid list via catalogs.items, G1's pattern).

CC-1 | 04:23Z | G4 mostly closed, one small owner question left. R-187's full item list (G1-G4) is
now done or escalated with a specific, named blocker for each open piece.
