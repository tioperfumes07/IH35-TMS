# UNIT DEACTIVATION (9.1) — LIVE REPORT · 2026-09-01 · CURSOR

**Finding:** Cannot honestly mass-deactivate “non-insured” units **this cycle**.

## Live Neon (USMCA / prod branch)

| Fact | Evidence |
|------|----------|
| `insurance.policy_unit` | Table exists (`asset_id` → `mdata.assets`) |
| Density | **Sparse / mostly test** (CC-3 OUTBOX: ~4 `policy_unit` rows on 5 test policies; real AL/APD schedule not fully reconciled into `policy_unit`) |
| Owner keep | **T144** — keep (leased to 2EMS / pending carrier removal — do **not** deactivate as “uninsured”) |
| Owner keep + flag | **T163** — keep; coverage-gap / NOT EVIDENCED flag is CC-3 item (AL liability COI pending) |
| Hard rule | Never deactivate a unit that still has an **active** `policy_unit` row |

## Why mass-deactivate now would be a defect

Owner asked: leave only insured units. “Insured” must mean **signed schedule ∩ `policy_unit` ∩ active policy**, not “missing from a half-wired table.” Deactivating the real USMCA power units because `policy_unit` is incomplete would archive trucks that **are** on the carrier PDF schedules (CC-3 attached ID cards to 11/14). That is guessing against live ops.

## Correct sequence (not deferral — blocker named)

1. **CC-1** finishes insured-asset reconciliation (`CLAUDE-OWNED-INSURED-ASSET-RECONCILIATION`) so `policy_unit` points at real `mdata.assets` / units for AL+APD.
2. **CC-3** coverage-status flag (on-AL / on-APD / on-MTC / NOT EVIDENCED) goes live.
3. **Cursor** then posts a unit/action/before/after/id table and deactivates **only**:
   - active units with **no** active `policy_unit` **and**
   - **not** T144 · **not** T163 · **not** any unit still on the signed AL/APD PDF list
4. Soft-deactivate via canonical fleet deactivate route (void-not-delete). Post evidence per row.

## This cycle actions

| Action | Status |
|--------|--------|
| Live report filed | **THIS FILE** |
| Mass deactivate | **BLOCKED** — named blocker = incomplete real `policy_unit` population |
| T144 / T163 | **KEEP** (owner rulings already locked) |
| Master map 9.1 | Update from DROPPED → **REPORTED · BLOCKED on CC-1 policy_unit density** |

