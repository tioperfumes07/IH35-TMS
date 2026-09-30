# PASTE — HARD WAKE · ROUND 303 · 2026-09-30 · OWNER SCOPE CHANGE

`git pull --ff-only origin main` FIRST. Then read your own NOW file. Idle after ACK is a defect.

OWNER, VERBATIM, TODAY:
  "No body is supposed to be working on money only creating engines and visual changes and
   upgrades. To maintenance and dispatch customers and vendors and driver profiles modules"

ALLOWED: engines, and visual changes/upgrades.
ALLOWED MODULES, only these five: MAINTENANCE · DISPATCH · CUSTOMERS · VENDORS · DRIVER PROFILES
PAUSED, not cancelled, nothing reverted: reconciliation and the MATCHED side · A/R and payment
applications · the Faro receipt chain · A/P vs unpaid bills · escrow GL mirror · factoring
reserve GL · the 931 uncategorized and GL routing · cash GL binding · QBO · bank-feed posting ·
Banking screens including the redesign boards · settlements, driver pay, deductions, invoices,
bills, expense posting.
THE TEST: if the OUTPUT is a journal entry, posting, reconciliation, invoice or settlement
figure -> money -> paused. If the output is an operational fact, a screen or an alert -> continue.
Full detail: docs/bus/2026-09-30-OWNER-SCOPE-CHANGE-MONEY-STOPS-ALL-SEATS.md

---

## CC-1
```
CC-1 · ROUND 303 · read docs/bus/NOW-CC-1.md
A-35/A-36/A-37/A-38 money items PAUSED. Your 5 unapplied migrations: leave them, do not ask again.
TOP: A-40 wo_type "tire" routed by source_type (ruling merged, the [WARN] is answered).
Then A-41 work order wizard audit (report before changing), A-42 both-direction WO linkage,
A-43 report date / date in shop / expected release.
ACK: CC-1 | ACK ROUND 303 | A-40 tire by source_type | GO
```

## CC-2
```
CC-2 · ROUND 303 · read docs/bus/NOW-CC-2.md
All money items PAUSED. B-31 stays a finding; the Faro remittance is with the owner, do not chase.
YOUR WHOLE ROUND: B-43 finish the INTEGRITY ENGINE (owner calls it essential) + B-44 complaints
against a driver. B-29 has never run on real data -- its 5 units are coder test artifacts.
Re-measure on the 16 REAL units. Every flag carries its evidence and period.
ACK: CC-2 | ACK ROUND 303 | B-43 integrity engine | GO
```

## CC-3
```
CC-3 · ROUND 303 · read docs/bus/NOW-CC-3.md
Nothing of yours is paused. Five merges in one round -- best throughput today.
TOP: T-37 the PM cron writes a work order against sample unit T-TESTMTDP79YF in USMCA on every
tick (schedule 756b5701-9ed2-4402-b6d6-086fd133af98, is_active TRUE, next_due_odometer 1).
Code fix now; the one-row deactivation needs owner AUTH.
THEN T-40: dispatch.stop_arrivals has 0 rows EVER. Arrival detection is built and has never run
because its only caller is the webhook that has never fired. Move it to the poll path, like T-30.
ACK: CC-3 | ACK ROUND 303 | T-37 then T-40 | GO
```

## CURSOR
```
CURSOR · ROUND 303 · read docs/bus/NOW-CURSOR.md
C-51 Banking + C-53 reconciliation screen PAUSED (money). Boards wait, nothing reverted.
TOP: C-57 DRIVER PROFILE MODULE -- asked for three times, still not built. Driver HUB is alerts
and requests; driver PROFILE is /drivers/profiles. Integrity KPI + complaints KPI, tiles across
not bars down, lines on rows never columns.
THEN C-58 customers/vendors regular + master-detail, C-59 maintenance visuals, C-60 side-docked
alerts with no layout shift, C-61 universal control sizes.
ACK: CURSOR | ACK ROUND 303 | C-57 driver profile | GO
```

## CODEX
```
CODEX · ROUND 303 · read docs/bus/NOW-CODEX.md
Guards and CI are infrastructure, not money -- you continue. Do not author a guard whose SUBJECT
is a posting, reconciliation, invoice or settlement figure while money is paused.
TOP: X-38 land X-16 or name the blocker in one line -- three rounds of "NOT DONE" is a deferral.
X-39 finish the third column: runs locally / runs in required CI / runs NOWHERE.
X-40 consolidate the pg-client hang class (ruling on file, I crossed your lane: ad6a9c2ef3).
ACK: CODEX | ACK ROUND 303 | X-38 land or block | GO
```
