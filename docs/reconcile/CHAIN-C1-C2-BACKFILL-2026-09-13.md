# Load-to-cash chain — C1/C2/C3 (Cursor, 2026-09-13)

Claude Lead master register rows C1–C5. Owner law (2026-09-12): "the instant a load is booked, a bill
must be created automatically for that driver for that load. that load must automatically be assigned
to a pre-settlement/settlement/tour." Guard: `scripts/verify-load-to-cash-chain.mjs`.
USMCA only. Neon `br-fancy-credit-akjnd07a`.

## The hooks (C3 — named by file:line)

**LINK 1 — driver bill on assignment**
- `ensureDriverBillArtifactsForLoad` — `apps/backend/src/dispatch/book-load.service.ts:1091`
  → `createDriverBillArtifacts` (`:682`). Returns `not_applicable` when the load has no seated driver
  (`driver_finance.driver_bills.driver_id` is NOT NULL — a bill for no driver is impossible).
- Wired into every seat-a-driver path: `bookLoadInTransaction` (`book-load.service.ts:2654`), the office
  PATCH (`mdata/loads.routes.ts` → `ensureDriverBillArtifactsForLoad`), quick-assign
  (`dispatch/quick-assign.service.ts`), inline quicksave (`dispatch/assignments/quicksave.service.ts`),
  planner reschedule (`dispatch/planner.service.ts`), manual reassign
  (`dispatch/dispatch-refinements.service.ts`). This convergence landed 2026-09-11.

**LINK 2 — pre-settlement/tour link**
- At booking: `linkLoadToPresettlementAtBookingInClientTx` — `dispatch/presettlement-link.service.ts:624`.
- Post-booking assignment (REG-008 shared gate): `linkLoadToPresettlementAfterAssignmentInClientTx`
  (`:695`), called from the same quick-assign/quicksave/planner/reassign paths. NB opens a tour,
  TR/SB join it; trip_type unknown → deferred review row, never guessed.

## Why they did not fire for the flagged loads

- **C1 (13554, 13573, 13579, 13580)** — booked/assigned 2026-09-05…07, BEFORE the driver-bill mint was
  converged into every assignment path (2026-09-11). They are the pre-wiring backlog. Going forward the
  hook fires on assignment; these were simply never re-touched. **FIXED: minted via the real hook**
  (`scripts/ops/cursor-2026-09-13-chain-backfill-c1-c2.ts`) — 3 open $0 tracking bills (unpriced) +
  13579 priced. LINK 1 now 0 driver-having loads without a bill.
- **C2 (11 loads)** — these were NOT a hook miss: each was already on a tour with a pre-settlement.
  Two UNATTRIBUTED script batches then CANCELLED those settlements and cleared
  `loads.presettlement_link_id`: `audit.row_changes` shows 2026-09-12 **01:21:49Z** (S-2026-0013,
  S-2026-0021, both from `open`) and **01:46:49Z** (S-2026-0018/0020/0028/0030, all from `closed`) —
  every row with a BLANK `changed_by_role` and no `session_id` (a script/ops action; an owner in-app
  cancel stamps role=`Owner`). None ever posted a JE (`posted_at` NULL, `voided_at` NULL — open/closed
  PRE-settlements, not posted pay-runs).
- **13502, 13505, 13507 (driverless)** — reached `delivered_pending_docs` with NO driver ever seated.
  The mint hook correctly returns `not_applicable`, and no driver means no tour. This is a DATA anomaly
  (a load should not deliver with no driver); it needs the owner to seat the real driver — it cannot be
  fabricated. Surfaced as a guard REPORT.

## C2 fix, split by TRUE prior state (read from audit, never guessed)

**C2a — RESTORE (done).** The 4 that were owner-CLOSED before the erroneous script cancel are restored
to `closed` and their still-orphaned loads re-pointed. `uq_driver_settlements_one_open_per_driver` is
PARTIAL on `status='open'`, so restoring to `closed` cannot collide. Reversing an unattributed script
cancel of a never-posted, owner-closed pre-settlement is the root-cause fix, not a new close.

| settlement | prior | tour | loads re-pointed |
|---|---|---|---|
| S-2026-0018 | closed | e7e07e3c | 13564 |
| S-2026-0020 | closed | bb7cd9d2 | 13570 |
| S-2026-0028 | closed | f6e7c3b2 | 13580, 13589 |
| S-2026-0030 | closed | 8a80b8c3 | 13586 |

**C2b — OWNER DECISION (flagged, NOT written).** These 6 driver-having loads cannot be auto-linked:

- **S-2026-0013** (loads 13561, 13527, 13567) and **S-2026-0021** (loads 13571, 13574) were `open` when
  the script cancelled them, and their drivers have since opened NEWER tours (S-2026-5807 for driver
  4ff53886; S-2026-5806 for 3e138476). Restoring to `open` would put two open settlements on one driver
  (constraint violation); restoring to `closed` would be an owner CLOSE of a tour the owner never closed.
- **13526** — orphan tour e3e6ea55, never had a pre-settlement; its driver already holds one open.

These are baselined in the guard (`OWNER_PENDING_UNLINKED`) so they surface as a REPORT, not fake-red.
Owner path: in-app CLOSE S-2026-0013 / S-2026-0021 (making them historical, then the loads re-attach),
or fold the loads into the drivers' current tours if they truly belong there.

## C4 / C5 (verified, already resolved)

- **C4 — 13595** (`3ef5e613`): `audit.row_changes` shows the Lead's test drag `dispatched→in_transit`
  (2026-09-12 21:40:48Z) was already reverted `in_transit→dispatched` at 23:52:05Z. Now `dispatched`. DONE.
- **C5 — 13593** (`5c56a69b`): reads `dispatched` live (matches the Lead's 16:30 CT read; the 18:15
  planner `in_transit` render is not the persisted state). No anomaly. Its NB+SB pair (13588/13593) is
  the driver's current open tour S-2026-5807.

## Guard corrections (C3)

`scripts/verify-load-to-cash-chain.mjs`: (1) scoped to USMCA `operating_company_id` — the first draft
counted frozen Transportation `L-2026…` loads as cross-entity false positives; (2) LINK 1 hard-fails
only on driver-HAVING loads (owner law "a bill for that driver"), driverless-delivered loads reported
separately; (3) LINK 2 owner-pending baseline; (4) `set_config(bypass_rls,…,false)` — the `true`
(transaction-local) form was lost under pg autocommit and made every read RLS-filter to 0.
