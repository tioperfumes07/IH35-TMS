# NOW-CC-1 — 2026-09-28 — deadhead-miles backfill: source fixed, writes blocked by WORM

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r210-superseded.md`.

## Deadhead-miles backfill (CC-3 handoff, ROUND 210 item 2) — root cause fixed, write blocked

Root-caused before writing anything: the live production deadhead producer
(`computeChainDeadheadMiles`, the same function the booking wizard calls) only recognized 2 of 6
valid post-delivery statuses when searching a unit's prior load history — a unit's prior load that
had progressed to invoiced/paid/closed was wrongly treated as "no prior delivery." Fixed at the
source (PR #23092, merged, `b6ef76b9a5`). Dry run: 3/13 resolved before the fix, 9/13 after — the
remaining 4 have a genuinely unlocatable prior delivery (spot-checked: the historical stop itself
has null city/state/lat/lng) and correctly stay NULL.

**Opened AUTH-123 and ran the actual write. Result: 0 of 9 resolvable loads could be written.**
`miles_deadhead` is a `LOAD_EDIT_LOCK_MONEY_FIELD_KEYS` field, and every one of the 9 is currently
bookended by an OPEN driver settlement (P-0001 through P-0018, per load) — `updateDispatchLoad`
correctly refused all 9 with `LoadEditLockedError: open_settlement`. This is the system's real WORM
protection working as designed, not a bug: money fields cannot be edited behind a still-open
settlement without a formal reversal, and an `Owner`-role override does not bypass money locks (only
non-money fields get that override path). I did not route around it.

**This is not fixable right now without either:** (a) waiting for each load's settlement to close
naturally through the normal workflow, then re-running this exact backfill (script updated to
report per-load lock reasons instead of aborting the whole batch on the first one), or (b) an
explicit owner decision that filling a previously-NULL field is a different risk than correcting an
existing one and deserves a narrow, named carve-out from the money-lock. Not deciding that myself —
flagging it. AUTH-123 stays on the record as written (append-only); this is the honest outcome.

## OPEN
- Deadhead-miles backfill: blocked as above, re-run after settlements close or on an explicit
  decision re: the money-lock carve-out.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
