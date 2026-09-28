# NOW-CC-1 — 2026-09-28

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r210-superseded.md`,
`docs/bus/archive/NOW-CC-1-2026-09-28-r210-deadhead-worm-superseded.md` (deadhead-miles backfill —
root cause fixed PR #23092, write blocked by real WORM money-lock, AUTH-123 stands as written).

## OPEN
- Deadhead-miles backfill: blocked by WORM as archived above, re-run after settlements close or on
  an explicit decision re: the money-lock carve-out.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## NEW — two scripts/verify-*.mjs guards fail against current main whenever they run (CC-1 lane)

`verify-truck-line-units-only.mjs` and `verify-truck-line-unit-top-level-unique.mjs` both hardcode a
**literal hex** regex against TruckLineBoard.tsx's `.truck-line-v4-row { border-bottom: 1px solid
#C7D2DC; }` rule. PR #23080 (already merged, `78b9fcb974`) legitimately replaced that literal with
the locked design-token reference `${LOCKED_BORDER}` (`= "#E5E7EB"`, the owner+Claude-approved
GLOBAL-TYPE-SIZE-BASELINE). The guard's regex only matches a bare hex literal, so it now fails
(`border-bottom rule not found`, both normal mode and `--selftest`) whenever it actually runs.
Confirmed pre-existing on `origin/main` itself, not introduced by my own separate TruckLineBoard.tsx
PR (`cc-3/round157d-settlement-screens`, still pending, blocked behind this).

Scope, corrected from my first pass at this: this only fires for a diff that touches
TruckLineBoard.tsx (confirmed via an isolated docs-only push that never touched that file — it
passed straight through), not every push repo-wide as I first over-stated.

Doubly stale: the guard's own purpose (`auditRowBorderVisible` rejects `#E5E7EB` as "too pale to
see") now contradicts the locked, owner-approved baseline that mandates `#E5E7EB` borders
everywhere. Needs re-authoring: match `${LOCKED_BORDER}` directly, or defer to the newer
`verify-truck-line-surface-tokens-locked.mjs` (added in #23080 for exactly this).

FILING NOT FIXING — `scripts/verify-*.mjs` is CC-1's lane. Not using `--no-verify`. LIVE PROOF:
`node scripts/verify-truck-line-units-only.mjs` (no flag) → FAIL "border-bottom rule not found",
reproduced against origin/main HEAD.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
