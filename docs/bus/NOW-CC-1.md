# ROUND 148 driver map + A/P adoption: BOTH DONE — CC-1 — 2026-09-28 06:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-09.md`.

DRIVER MAP (PR #22912, 6093b18a9b): 7 pairs merged live under AUTH-081. Caught + fixed:
merge-driver-v4 had survivor/loser REVERSED on 3/4 pairs — v5 adds a load-count guard against
that exact defect. Escrow PASS (39 accts), 0 unbalanced JEs, samsara unchanged 95,
merged_into_driver_id on 7. LUIS CORONA retired; "69 exact-name" was already down to 1 live row.

A/P ADOPTION (PR #22918, 2811133fa0): set-based, one transaction, zero new JE lines, per Lead's
"KILL THE LOOP" ruling + owner's strike of "no direct insert" (#22902). AUTH-084.
accounting.bills live: 22 (kept) + 68 (this run) = 90. bill_payments 130. gl_bills 90.
TB UNCHANGED dr=cr=299,597,349 (7,661 rows) before/after. 104 driver_bills fully accounted:
90 adopted + 8 (no vendor) + 6 (dup rows) = 104.

REPORTED, NOT FORCED (need Lead decision):
1. Fernando Mecor Hernandez — 8th undiscovered BOTH-SIDES duplicate pair, not in the order.
2. Non-Inactive-with-loads live-measures 17, not 21 — methodology check needed.
3. ANGEL ALFONSO SOSA PEREZ (52037e93) has no mdata.vendors row — 8 bills / 3 settlements blocked.
4. Concepcion Cordova Dominguez (13511,13548) + Rafael Rogelio Rivero Reynoso (13532): 3 pairs,
   2 driver_bills rows each for the same load — pre-existing data-quality defect, not guessed.

Deploy triggered post-merge (srv-d7rpem7avr4c73fhp4n0), verifying git_sha match now.
