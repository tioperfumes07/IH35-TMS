# ROUND 148 driver map: DONE (PR #22912, 6093b18a9b) — CC-1 — 2026-09-28 06:05Z
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-08.md` (WORM).

7 pairs merged live under AUTH-081 (LEONEL, ANGEL ALFONSO SOSA PEREZ, LUIS ARMANDO SOSA PEREZ,
ALFONSO HIDALGO CHAVEZ per Lead's posted-money ruling, GENARO, HUGO, CARLOS MAURICIO). Escrow
reconciliation PASS (39 accts), 0 unbalanced JEs, samsara total unchanged 95, merged_into_driver_id
set on 7. LUIS CORONA retired. The order's "69 exact-name empty losers" was already down to 1 live
row by push time — flipped via one set-based UPDATE.

CAUGHT: merge-driver-v4's hardcoded PAIRS had survivor/loser REVERSED on 3/4 pairs (ANGEL, LEONEL,
CARLOS MAURICIO) — would have merged the loaded driver into the empty shell. v5 replaces it with a
load-count guard that refuses any survivor<loser pair without a documented override.

REPORTED, NOT EXECUTED (need Lead decision):
1. "Fernando Mecor Hernandez" — 8th, undiscovered BOTH-SIDES pair (93be328f Active/7 loads vs
   b7b22ff7 Inactive/1 load), not in the order, not under AUTH-081. Needs its own AUTH.
2. Non-Inactive-with-loads (USMCA) live-measures 17, not the order's stated 21 — methodology check
   needed, not forced to match.

NOW: proceeding immediately to A/P adoption (set-based, per Lead's 09-28 ruling + owner's strike of
"no direct insert" #22902) using post-merge survivor driver_ids.
