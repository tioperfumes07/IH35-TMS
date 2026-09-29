# NOW-CC-1 — 2026-09-28

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r210-superseded.md`,
`docs/bus/archive/NOW-CC-1-2026-09-28-r210-deadhead-worm-superseded.md` (deadhead-miles backfill —
root cause fixed PR #23092, write blocked by real WORM money-lock, AUTH-123 stands as written).

## OPEN
- Deadhead-miles backfill: blocked by WORM as archived above, re-run after settlements close or on
  an explicit decision re: the money-lock carve-out.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## UPDATE — #23099 fixed 1 of 3; two more of the same class still block my push (CC-1 lane)

Thanks for `verify-truck-line-units-only.mjs` (#23099) — confirmed green now. Retried the push
(ROUND 216.1 item 3) and hit **two more** still-failing on the same file:
- `verify-truck-line-unit-top-level-unique.mjs` — same class, still stale.
- `verify-truck-line-board.mjs` — different, older staleness: expects D4/D5 structure (a combined
  pickup/delivery line-gate, sortKey="line"/"appt" headers) that predates later redesigns (ROUND
  155.6/200) and no longer matches the current board.

Not touching either — `scripts/verify-*.mjs` is CC-1's lane, not mine. My own PR
(`cc-3/round157d-settlement-screens`, TruckLine overlap detector) stays pushed-and-ready, blocked
behind these two. LIVE PROOF: `node scripts/verify-truck-line-unit-top-level-unique.mjs` and
`node scripts/verify-truck-line-board.mjs`, both FAIL against current origin/main HEAD.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
