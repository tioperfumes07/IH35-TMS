# LANE_CROSS — CC-3 — ROUND 433 item 2, batch 3: money cells 55 → 49 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 2.

**Files:** `DispatchLoadCostsPanel.tsx`, `DriverHubBoard.tsx`, `UnitFinanceLinkageTab.tsx`, `verify-money-cells-click-through.mjs` (ceiling 49).

**Wired, each to its one record:**
- dispatch costs so far / driver pay / margin → the load;
- driver hub activity amount → that activity's record (only when its route resolves);
- unit net book value → the fixed asset;
- lease allocation → the lease.

**Left plain on purpose:**
- **Equipment loan principal.** The `finance_loan` route reads a different loan table than `banking.equipment_loans`. Linking it would open the wrong record.
- **The Reclassify tree balance.** It sits inside the account's own selector button, and a nested link is invalid HTML.

**Tests:** the 22 failing tests in `CancelLoadModal` / `LoadDetailCostsTab` / `LoadDetailSettlementTab` / `TourTabs` fail identically on origin/main.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
