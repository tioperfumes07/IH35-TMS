AGENT-2 · Block 9 of 13 — PHASE Dispatch / TASK <add tracker row DISP-PROFITABILITY> — Instant load profitability + Trip Profitability
SO: prepend BOX 0. CITES docs/specs/LOAD-PROFITABILITY-AT-DELIVERY.md (+ existing GAP-73 margin work — reconcile, don't duplicate).
SCOPE (ADDITIVE): Net = Customer Rate − Driver pay (delivery-date basis VQ5) − Fuel (load fuel events) − Maint/Repair (WO costs for unit during trip) − Insurance allocation (premium ÷ active units ÷ days) − Factoring fee − Accessorials. Show: net-profit badge on delivered Kanban cards; full breakdown in LoadDetailDrawer Settlement tab; Trip Profitability view (Company Settlement Report — per trip = NB + border + SB roll-up). Read-only; all from existing tables; no new financial code. Reconcile with GAP-73 MarginPill/load_margin_snapshots.
FILES: dispatch Trip Profitability view (NEW), Settlement tab breakdown (coordinate Block 12), reuse lane-profitability.service.ts + settlement-summary.routes.ts.
ACCEPTANCE: profit computes at delivery; badge on card; Settlement tab breakdown; Trip view rolls up NB+SB.
LANE LOCK: profitability/report files; drawer tab via Block 12 writer.
