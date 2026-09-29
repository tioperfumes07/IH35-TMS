# CURSOR — ROUND 273 — UNBLOCK THE OTHER SEATS
# Claude Lead · 09-29-2026 · Owner: "IF CURSOR IS DONE, IT CAN TAKE ANY WORK FROM CC1, 2, OR 3."

**Obey `claude/00-SEAT-CONTRACT.md`.** R259 and P0 are verified live (`git_sha 4e84c519a9`). You are now the unblocker seat. Your register #3–#10 click-proof comes AFTER these two items.

## ITEM 1 — CC-3 cannot push TruckLine because of a parity gap that is not its code
`verify-void-predicate-map-current.mjs` fails on missing UI-surface leaf mappings for
`WriteCheckForm.tsx` and `SettlementCreatorDrawer.tsx`. Neither file is in CC-3's diff, and CC-3 has
correctly declined to fix another lane's registration.

Register the missing leaf mappings properly — the real void predicate for each surface, not a stub to
silence the guard. Then confirm `git ls-remote origin claude/truckline-schedule-conflict-detector` is
non-empty once CC-3 pushes. Paste the guard PASS and the remote ref.

**Note:** CC-3 also reports its `round157d-settlement-screens` branch is 57 files / −3,579 lines against
main, deleting unrelated guards (`verify-check-routes-mounted.mjs`,
`verify-gate-exception-sets-never-grow.mjs`). That is stale rebase drift, not a feature. **Do not let that
branch merge in that shape.** Say so on the branch.

## ITEM 2 — CC-2 has three finished branches it cannot push
`cc2/r245-p0-check-number-reset` (3 commits), `cc2/r216-b8-detention-notify-two-phase` (2),
`cc2/r218-opening-balance-coord-and-guard` (4). All clean trees, all blocked by live-data guards in
`accounting/`, none of it CC-2's code.

Two rulings already granted — implement them:
- **`NO_CLEARING_PILEUP`**: exclude in-transit factoring advances from the calculation. Threshold stays.
  Of $427,887.92 gross, only $39,108 (15 rows) is the real defect; $276,248.28 is normal
  advance-received-not-yet-bank-matched timing lag. A guard that counts money in transit as a pileup is
  red forever.
- **`verify-open-tour-posts-nothing`**: CC-1 has PR #23153 rewriting it to assert the opposite invariant,
  per Seat Contract Section 3. Do not duplicate that work — coordinate, then confirm the three branches
  clear once it lands.

## PROOF REQUIRED
Guard PASS output pasted. The three CC-2 branches on origin. CC-3's TruckLine ref on origin. Deploy
triggered on `srv-d7rpem7avr4c73fhp4n0` with the id pasted.

Do not bypass a guard. Do not edit a migration ledger. Do not edit an applied migration — you just fixed
that exact defect; do not recreate it.
