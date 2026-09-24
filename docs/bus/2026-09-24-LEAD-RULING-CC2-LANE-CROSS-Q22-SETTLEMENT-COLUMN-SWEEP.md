# LEAD RULING — Q22 (CC-2 lane cross on `scripts/verify-settlement-ref-beside-load.mjs`)

`scripts/verify-*.mjs` is CC-1's lane per `docs/bus/LANES.md` line 10. This guard's own header
comment says "CC-2 authors this guard because CC-2 authors `<SettlementRefCell>`" — a true, but
stale, self-attribution from before `LANES.md` was written; the enforced mechanism today is
`verify-lane-ownership.mjs` reading `LANES.md`, not a comment inside the guard file itself.

Q22 (`docs/bus/00-WORK-QUEUE.md`, claimed by CC-2 2026-09-24T01:06:00Z: "Settlement / Presettlement
column on EVERY accounting, financial and dispatch surface") explicitly assigns CC-2 its own
`cc2_driverfinance_settlements_fuel` bucket inside this exact file's
`LOAD_NUMBER_SURFACE_INVENTORY` (4 files: `SettlementsPage.tsx`, `SettlementsTable.tsx`,
`SettlementsCompanyDriverTab.tsx`, `PendingSettlementDeductionsPanel.tsx`) — the sweep's own
design already anticipates each owning seat registering its own converted surfaces here as they
land (see the file's own top-of-file comment: "each seat extends SURFACES as their own conversions
land"). Converting CC-2's bucket without touching this file is not possible — the registration IS
the guard's enforcement mechanism (a converted-but-unregistered surface is invisible to CI and can
silently regress later).

Scope actually touched, all additive:
- 4 new entries appended to the `SURFACES` array (CC-2's bucket only — zero edits to any other
  seat's existing entries, verified: `git diff` shows only additions to `SURFACES`).
- 4 `// CONVERTED (SURFACES)` comment annotations on CC-2's own `LOAD_NUMBER_SURFACE_INVENTORY`
  bucket entries, matching the exact convention already used for Cursor's/CC-1's converted entries
  in the same file.
- Zero changes to the guard's check logic, `SETTLEMENT_CELL_RE`, or any other seat's registrations.

Two of the four surfaces (`SettlementsTable.tsx`, `SettlementsCompanyDriverTab.tsx`) needed zero
code changes at all — read in full, both already satisfy the law (the first via the owner's own
2026-09-11 "COLUMN-ORDERING LAW" for that exact file; the second via an already-present
`settlementLabel(tour)` group header over its legs sub-table) and are registered here with the
same "already satisfied this law before it existed" treatment `RevenueRecognitionPage.tsx` got
above. The other two (`SettlementsPage.tsx`'s Open Driver Bills panel,
`PendingSettlementDeductionsPanel.tsx`) got a real `SettlementReferenceCell`/`useSettlementReferences`
column and a `settlementLabel()` rewire respectively — both in CC-2's own frontend files, not a
lane-cross concern on their own.

Posted to `docs/bus/OUTBOX-CC-1.md` per the no-handoffs law's cross-declaration requirement.
