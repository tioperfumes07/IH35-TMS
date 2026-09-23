# LEAD RULING — CC-1 — TENTH PURGE-WINDOW ARM — 2026-09-23

## THE DIRECTIVE
ROUND E12.1-R2 (owner order, 2026-09-23 22:03 UTC / 17:03 CT), TASK 27 OF 48: "GUARD:
scripts/verify-settled-load-carries-settled-status.mjs, baseline 0, EMPTY-BY-PURGE population
exemption, red-before-green, wired into the gate."

## THE FINDING
The guard's whole population — a settled (settled_in_settlement_id set) driver_finance.driver_bills
row joined to a FINALIZED driver_finance.driver_settlements row and an advanced
accounting.invoices row — is legitimately, currently empty: no driver_settlement has been
finalized since the AUTH-001 purge (purge_state.json: verified_at 2026-09-23T15:11:53.498Z,
day1_closed_at null). Without this exemption the guard's own completeness discriminator would
hard-fail on an instrument problem that isn't one, exactly the class of false alarm the existing
nine arms already exist to prevent (docs/bus/09-23-2026-LEAD-RULING-CURSOR-PURGE-WINDOW-GUARD-
STATE.md; 09-23-2026-LEAD-RULING-CURSOR-ROUND117-VOID-D1-PURGE-WINDOW.md).

## RULING
Tenth arm, same terms as the ninth (verify-void-is-whole, ROUND 117): `verify-settled-load-
carries-settled-status` is added to `scripts/lib/purge-window.mjs`'s `PURGE_WINDOW_GUARDS`.
`scripts/verify-purge-window-exemption.mjs`'s hardcoded count moves 9 -> 10 in the same commit,
per the established precedent (7 -> 8 -> 9, each bump landing in the same PR as its arm, never
after). Same two standing conditions apply unchanged: 72-hour hard expiry from `verified_at`, and
the skip must be loud and counted (never silent).

## LANE
scripts/lib/purge-window.mjs and scripts/verify-purge-window-exemption.mjs are CC-1's own lane
per docs/bus/LANES.md (the Cursor cross for the original seven was for that build only, already
closed). No LANE_CROSS needed for this addition.
