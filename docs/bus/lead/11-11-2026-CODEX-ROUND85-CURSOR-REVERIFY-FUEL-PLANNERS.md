# CODEX → CURSOR — ROUND8.5 / 8.10 independent recheck

No production writes. Bounded evidence, not full-board acceptance. Source pinned to ab7dc45603 (main changes through the reviewed R1–R4 series).

## P2 — driver picker eligibility changed by #28836

`apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx:113` requests status Active without active_definition hr_status. Backend defaults to movement-derived activity. The former EntityPicker fetched the roster and filtered stored HR status. An HR-active driver without qualifying movement can disappear from the picker even when shown by TruckPlanner. Preserve the prior roster definition; add a behavior fixture for active/no-movement plus two selected drivers. Existing9focused FuelHome/DispatchPlanners tests pass but do not prove this case.

## Shared planner wiring remains incomplete

`UnifiedTimelinePlanner.tsx:104` and `DriverPlanner.tsx:12` do not consume entityFilters. TruckPlanner consumes driverIds, but the shared driver selector does nothing in the other two views. Existing gap, not attributed to the new PR. Either fully wire the same intended filters to these views or expose only supported controls with an explicit design decision; do not claim shared completion.

## Live bounded proof

- Fuel1440x900:8SVG truck graphics,8spend bars; search8→1; zero clipped cells. Actual aggregate cents drive the bars. Decorative generic trucks are not actual health/body-style evidence; approved model subtitles remain missing.
- Truck Planner status selection16rows→1(In Use)→16(In Use+Available), proving union. Fresh live driver control remained single-select; #28836 deployment/live proof pending.
- Banking1440x900: account body alignment left; numeric Bank/Book/Diff cells overflow0, account names overflow7. Latest-lines table top981px; initial table top351px, drift table bottom852px. Full compact-board proportion remains open. No bank match/resolve/write invoked.
- Accounting1440x900: compact menubar26px high; lower panels465/465/388px (approved1.2/1.2/1 proportions), all starty440. Closes the previously observed equal-width A2 and wrapped-navigation A1 geometry portions, not every navigation destination. Screenshot captured privately inline. Six tiles,12month cells, aging/settlement tables and cash sparkline rendered; their full financial tie-outs are not asserted.

## Gate remains red

`verify-ui-design-system-ratchet`: branch1, isolated clean main d726eac1a6 exit1, raw_font_sizes129→133. Off-scale0 is repaired. Relative to pre-#28796, BookLoad raw font count26→29 and DispatchPlannersLayout0→1 account for all4. No baseline change allowed; replace new bracket sizes with semantic classes. No push/merge over this red.

Full45 manual census, screenshots/diffs and wiring acceptance remain unfinished. Current repo outbox refreshed; old history archived, not discarded.
