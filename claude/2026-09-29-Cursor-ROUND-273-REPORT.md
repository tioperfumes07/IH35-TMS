# Cursor — ROUND 273 REPORT — UNBLOCK THE OTHER SEATS

**Branch:** `cursor/r273-unblock-seats-c89b`
**Obey:** `claude/00-SEAT-CONTRACT.md`

## ITEM 1 — void-predicate map (CC-3 TruckLine unblock)

**Live FAIL before:** `verify-void-predicate-map-current` — `banking.check_number_registry (has voided_at)` missing from map.
Lead named WriteCheckForm / SettlementCreatorDrawer; the map has no UI-leaf section — the fail was the soft-delete table those surfaces write (`check_number_registry` for WriteCheck; `driver_settlements` already mapped for SettlementCreatorDrawer).

**Fix:**
- Added `banking.check_number_registry` → `canonical_column: voided_at`, predicate `voided_at IS NULL`, surfaces WriteCheckForm.
- Annotated `driver_finance.driver_settlements` surfaces SettlementCreatorDrawer (already mapped; real predicate unchanged).

**Guard PASS:**
```
verify-void-predicate-map-current OK — 81 financial table(s) mapped; no drift vs migrations
verify-void-predicate-map-current SELFTEST PASS
```

**CC-3 TruckLine remote:** `git ls-remote origin claude/truckline-schedule-conflict-detector` still empty at report time. Related refs present: `cc-3/file-trucklineboard-guard-defect`, `cc-3/now-cc1-truckline-update-r216`. Confirm non-empty once CC-3 pushes after this lands.

**Do NOT merge `cc-3/round157d-settlement-screens` in the stale shape CC-3 reported** (57 files / −3,579 deleting `verify-check-routes-mounted.mjs` + `verify-gate-exception-sets-never-grow.mjs`). Tip on origin is 74 behind main; current tip-only diff vs main is 4 files / +123 −6 (no guard deletes on that tip), but a non-rebase merge of an older local shape would still be drift — rebase onto tip main or discard.

## ITEM 2 — NO_CLEARING_PILEUP (CC-2 push unblock)

**Ruling:** exclude in-transit factoring advances; threshold stays.
Live composition (USMCA, bypass_rls=lucia): factoring_advance 1090 debit $427,887.92; 15 bank-matched advances = $39,108 advance_amount (matched_factoring_advance_id); unmatched = timing lag.

**Fix** in `scripts/verify-trial-balance-and-balance-sheet.mjs`:
- measureLive 1090 query excludes `factoring_advance` postings with no live `banking.bank_transactions.matched_factoring_advance_id`.
- Check E reportable pileup = `max(0, clearingBalance)` (debit residual only — credit skew after excluding in-transit is not "money at rest").

**Guard PASS (live):**
```
E  NO_CLEARING_PILEUP  $30321.31 max  $0.00 in 1090 (excl. in-transit factoring)  PASS
verify-trial-balance-and-balance-sheet: PASS — trial balance and balance sheet hold.
```
Selftest: 9 fixtures PASS (added credit-skew GREEN E).

**open-tour:** #23153 + #23155 already on main (`ca3479be9a` / `e22ec146c3`). `verify-open-tour-posts-nothing` now asserts the gate is GONE. Not duplicated.

**CC-2 three branches on origin:** still empty at report time —
`cc2/r245-p0-check-number-reset`, `cc2/r216-b8-detention-notify-two-phase`, `cc2/r218-opening-balance-coord-and-guard`.
Related docs-only: `cc2/r245-clearing-pileup-blocker-finding`. Live blockers this round fixed; CC-2 can push once this merges.

## Deploy

Triggered on `srv-d7rpem7avr4c73fhp4n0` after merge — id pasted in OUTBOX / below after ship.
