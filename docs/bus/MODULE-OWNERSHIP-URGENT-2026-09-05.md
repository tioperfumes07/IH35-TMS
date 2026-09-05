# MODULE OWNERSHIP — URGENT SET (owner-agreed 2026-09-05)

Owner named the urgent modules: **dispatch · accounting · settlements · cash flow · customers · vendors · maintenance · driver profile**.
One coder per module. Each coder CLOSES their module completely. FAST-MERGE (4-min) always. Neon-verify money. One guard per fix. NEVER POST Book Load. Seeds via service fns only, HARD FLOOR pickup >= 2026-08-07.

Cursor = lead + deploy + the one cross-cutting vertical (settlements/load-costs FE). Telematics stays with Codex (Rule 49). Money never spreads: FE vs BE split on shared verticals (Cursor FE settlement surfaces, CC-1 BE read models) so no file collision.

| Module (urgent) | Owner | Current next step |
|---|---|---|
| Dispatch (board, round trips, planners, book load) | **CC-2** (verify-live seat) | Verify L.4a board live on Chrome; L.4c Round Trips timeline; 2.2 design tokens; planners lists |
| Accounting read models (bills, invoices, GL) | **CC-1** | settlement-lines read model (S.1); cash flow statement |
| Settlements + Escrow (BE) | **CC-1** | driver_settlement_deductions void (3-branch); S.1 read model unblocks detail |
| Cash flow | **CC-1** | operating/investing/financing from GL, incurred vs paid |
| Customers + Vendors | **CC-3** | roll-up read model (open AR/AP, load count, last activity), landing filters, dash-never-zero |
| Maintenance | **Codex** | done 3/3 |
| Telematics/Samsara | **Codex** | STEP-3 re-scope migration; LIVE COUNT 16 units/17-20 drivers; roster UI |
| Driver Profile | **CC-1** (deductions/escrow) + **Cascade** (Load History filters/dates/export) | deductions BY DRIVER + escrow view; Load History filter bar + PDF export |
| Lists/Reports/Planners | **Cascade/Devin** | WAVE-4 LIVE-VERIFY 8 pages on Chrome (FE deployed); planners paginate/sort/filter/export |
| Settlements/Load-Costs FE (cross-cutting) | **Cursor** | Load Costs done; settlement detail FE wiring on CC-1's S.1 read model |

## Per-coder copy-paste blocks
See OUTBOX-CURSOR.md census + this file. Deadlines rolling 2h per step; DONE line = seat|STEP-N DONE|sha|live sha|measurements|NEXT.
