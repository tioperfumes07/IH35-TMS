# BLOCK-02 (of 29, Tier 1.5) — Driver Escrow: ledger, accrual, per-driver balance, and the >=90-day post-separation return

Status: **HELD — build-and-hold behind a default-OFF flag.** Reviewed against `docs/dispatch/BLOCK-02-of-29-TIER1.5-DRIVER-ESCROW.txt`
(the original block spec) and the live codebase. Locked decisions honored:
`driver-escrow-is-liability`, `audit-fix-decisions-2026-07-04` ("recovery PAY-FIRST then escrow"),
`enterprise-feature-decisions-2026-07-05`.

## 0. Repo-reconnaissance finding — most of BLOCK-02 already exists

Per the mandatory pre-code recon (this spec's own standing order), the escrow ledger + accrual + per-driver
balance are **already built and live** (not gated by anything in this PR):

| Spec requirement | Already exists as |
|---|---|
| Escrow ledger (deposit/withdrawal/adjustment, running balance) | `accounting.escrow_accounts` + `accounting.escrow_postings` (migration `0234`, Block-23). Balance-conserving via a DB trigger (`sum(postings) => balance_cents`); JE-backed via `accounting.createJournalEntry`. |
| Deposit on settlement finalization | `apps/backend/src/payroll/driver-settlement.service.ts:482-514` — `postSettlement()` unconditionally calls `openEscrow()` + `depositEscrow()` whenever a `driver_bond_deduction` line exists on the settlement (Dr net-pay / Cr escrow-liability, via the existing bill+payment net-pay mechanics). |
| Per-driver escrow sub-ledger account (GL) | `apps/backend/src/accounting/driver-subaccount-provision.service.ts` — auto-provisions **"\<Driver Name\> — Driver Escrow (hired MM/DD/YYYY)"** under a year-agnostic **"Driver Escrow"** sub-parent, itself under the top-level **"Damage Claim Escrow" (QBO-1150040187, Liability)** — STOP-DECISION #1 (locked, year-agnostic naming so it survives across years without re-parenting). |
| Per-driver running balance | `accounting.escrow_accounts.balance_cents`, one row per `(operating_company_id, holder_id=driver_id, purpose='driver_bond')` (`UNIQUE` constraint from `0234`) — this **is** the per-driver balance. |
| Reconciliation (sum-of-parts = GL) | Guaranteed structurally, not by a separate reconciliation job: the trigger keeps `escrow_accounts.balance_cents` exactly equal to `sum(escrow_postings deltas)`, and each posting carries `linked_journal_entry_id` back to the real GL entry. `verify-escrow-amount-conservation.mjs` guards this invariant. |

**What was genuinely missing** (the actual scope of this PR): the **>=90-day post-separation RETURN
path** — nothing in the codebase tracked a driver's separation (resign/fire/termination) date, gated a
return on it, or computed the net-of-damage-deductions payout. That is the only new build here.

A parallel, OLDER, apparently-dead table pair (`driver_finance.escrow_balances` / `driver_finance.escrow_ledger`,
from migration `202606120600`, D1 settlement-approval) exists but is **never written to** by any current
code path (only read by the driver operations-depth history panel, which therefore always renders empty).
This is a known split-brain (flagged in memory as a recurring pattern across the settlement domain) —
**out of scope to fix here**; BLOCK-02 builds strictly on the LIVE Block-23 ledger, not the dead one.

## 1. Scope actually built in this PR

1. **`driver_finance.driver_escrow_separations`** (new table, migration
   `202607111000_block02_driver_escrow_separation_return.sql`, HELD) — tracks, per driver:
   - `separation_date` — captured from `mdata.drivers.deactivated_at` at the moment `status='Terminated'`
     (the locked status/deactivated_at consistency invariant, migration `202606161300`: a deactivated
     driver is always `Inactive` or `Terminated`; BLOCK-02 requires **`Terminated`** specifically — an
     `Inactive` driver on leave is not a separation).
   - `eligible_release_date` — a `GENERATED ALWAYS AS (separation_date + 90) STORED` column, so the
     90-day gate can never drift from the date it was computed against.
   - `escrow_balance_at_separation_cents` — a snapshot for audit (the live balance is re-read at release
     time, not trusted from the snapshot).
   - `outstanding_damage_claims_cents` / `released_amount_cents` / `retained_for_damages_cents` — filled
     in at release time (see §2).
   - `status`: `pending -> released` (or `waived`, reserved for a future manual override — not built here).
   - `released_posting_id` -> `accounting.escrow_postings.id` — the **reverse link**: from the GL posting
     back to the separation record back to the driver.
   FORCE RLS (entity-scoped), void-not-delete (`is_active`/`voided_at`, no `DELETE` grant), append-mostly
   (status/release columns are the only post-insert writes, all from the release service function).

2. **`recordDriverEscrowSeparation()`** (`apps/backend/src/driver-finance/escrow-separation.service.ts`) —
   call this once a driver is actually terminated. Idempotent (a partial unique index prevents a second
   open record while one is still `pending`). No-ops when the driver has no `driver_bond` escrow account
   (nothing was ever withheld — nothing to return).

3. **`releaseDriverEscrowSeparation()`** — the return path itself:
   - Flag-gated: `DRIVER_ESCROW_SEPARATION_RETURN_ENABLED` (default OFF). OFF => zero writes
     (`{result: "skipped_flag_off"}`), checked before any lock/read/insert — same pattern as FIN-18's
     `postSettlementToGl()`.
   - Owner-only (money-moving action; matches the void/cancel-governance posture for anything that
     releases funds).
   - Gate: refuses release before `now() >= eligible_release_date` (>=90 days post-separation, exactly
     as locked). Returns `{result: "not_eligible", days_remaining}` otherwise — never partially releases.
   - **Net-of-damage-deductions computation** (`escrow-separation.math.ts::computeNetEscrowReturn`, pure,
     unit-tested): `outstanding_damage_claims_cents` = `SUM(remaining_balance_cents)` over
     `driver_finance.driver_settlement_deductions` rows for this driver with
     `deduction_type='escrow_load_abandonment'` and a still-unrecovered balance. This is the **CPA-locked
     "pay-first-then-escrow" fallback** (memory `audit-fix-decisions-2026-07-04`): those are exactly the
     damage-claim deductions that ongoing pay-recovery could **not** fully collect before the driver
     separated — the only case escrow is meant to backstop.
   - `net_release_cents = balance - min(outstanding_damage_claims_cents, balance)` is released to the
     driver via the **EXISTING, unmodified** `releaseEscrow()` (Block-23) — `Dr Driver Escrow (liability) /
     Cr Cash (cash_clearing)`. **Zero new GL math** — this PR does not touch `accounting.escrow_postings`'
     schema, CHECK constraints, or trigger at all.

4. **Per-driver escrow balance convenience read** — `getEscrowAccountForHolder()` +
   `GET /api/v1/accounting/escrow/holder/:holder_type/:holder_id/:purpose` (added to the existing
   Block-23 `accounting/escrow` service/routes). Read-only; filters the same `escrow_accounts` row Block-23
   already maintains — not a new balance source, just a direct per-driver lookup the original spec's
   `GET /api/drivers/:id/escrow/balance` endpoint asked for.

5. **HTTP surface** (`apps/backend/src/driver-finance/escrow-separation.routes.ts`, registered in
   `index.ts`):
   - `GET /api/v1/driver-finance/escrow-separations/driver/:driver_id` — forward link (driver -> separation + status).
   - `GET /api/v1/driver-finance/escrow-separations` — Owner/Accountant queue of separations whose 90-day
     hold has elapsed (or is still counting down — `eligible_now` flag on each row).
   - `POST /api/v1/driver-finance/escrow-separations` — record a separation (Owner/Administrator).
   - `POST /api/v1/driver-finance/escrow-separations/:id/release` — execute the return (Owner-only).

## 2. Forward + reverse linkage (Law of Total Connectivity)

```
mdata.drivers (driver_id, status='Terminated', deactivated_at)
      |  forward
      v
driver_finance.driver_escrow_separations (separation_date, eligible_release_date, status)
      |  forward                                    ^ reverse (driver_id column, direct)
      v                                             |
accounting.escrow_accounts (holder_id=driver_id, purpose='driver_bond', balance_cents)
      |  forward (releaseEscrow)                    ^ reverse (holder_id = driver_id)
      v
accounting.escrow_postings (posting_type='release', source_type='manual', source_id=separation.id)
      |  forward                                    ^ reverse (released_posting_id column, direct)
      v
accounting.journal_entries (linked_journal_entry_id) -> journal_entry_postings (Dr escrow-liability / Cr cash)
```

Every hop is a direct FK or an explicitly-stored id — no string-matching, no orphaned reads.

## 3. Deferred CPA decision — NOT solo-decided (constitution §1.4/§1.6 + hardline rule)

When `retained_for_damages_cents > 0` (the driver's escrow balance is insufficient — or exactly
sufficient — to satisfy an outstanding damage claim that pay-recovery never fully collected), this build
**records the amount for visibility** (`driver_escrow_separations.retained_for_damages_cents`) but does
**NOT** auto-post a forfeiture/write-off JE for it. Reducing the escrow liability by that amount requires
crediting *something* (an income/recovery account) — the schema already reserves a role_key for exactly
this (`'damage_recovery'` in `catalogs.account_role_bindings`, seeded by migration `202607080310` alongside
the other `*_recovery` roles used by the FIN-18 settlement-posting engine's
`bucketRecoveryRoleKey()` convention) but it currently has **zero consumers** — no poster has ever wired it.
Whether BLOCK-02's forfeiture should be the first consumer of that role, and whether the credit should be
booked as of the release date or backdated to when pay-recovery gave up, is a CPA/Jorge policy call, not an
agent's to make solo. **Recommendation for the follow-up decision:** wire `forfeitEscrow()` (mirroring
`releaseEscrow()`, crediting `damage_recovery` instead of `cash_clearing`, reusing `createJournalEntry`
unchanged) once confirmed — a small, additive follow-up, not a rebuild.

## 4. Verification

- `cd apps/backend && npx tsc -b --pretty false` (backend compiles clean).
- `npx vitest run apps/backend/src/driver-finance/__tests__/escrow-separation-math.test.ts apps/backend/src/driver-finance/__tests__/escrow-separation-release.test.ts`
- Migration validated locally (idempotent — applied twice, second run a no-op); `has_table_privilege('ih35_app', 'driver_finance.driver_escrow_separations', 'DELETE')` is `false`.
- `node scripts/verify-driver-escrow-separation-90day-gate.mjs` — static guard: the release function must
  check the flag before any write and must gate on `eligible_release_date`.
- Flag `DRIVER_ESCROW_SEPARATION_RETURN_ENABLED` stays OFF until Jorge/CPA sign-off; this migration is
  registered in `db/migrations/.held-migrations.json` and carries the `DO NOT RUN ON PROD` marker.

## 5. Explicitly out of scope (flagged, not silently skipped)

- Auto-posting the damage-claim forfeiture JE (see §3 — deferred CPA decision).
- Reconciling/retiring the dead `driver_finance.escrow_balances`/`escrow_ledger` pair (D1) — separate,
  pre-existing split-brain, not introduced by this PR.
- A `waived` manual-override workflow for the separation record (schema reserves the status value; no
  service function implements it yet).
- Frontend UI (driver detail "Escrow" tab, admin `/admin/escrow` overview) — the original spec flags this
  as **preview-required** before any UI code; this PR is backend/schema/design only, per the financial
  build-and-hold instruction.
