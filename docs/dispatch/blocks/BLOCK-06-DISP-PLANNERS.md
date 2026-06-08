AGENT-2 · Block 6 of 13 — PHASE Dispatch / TASK <add tracker row DISP-PLANNERS> — Driver + Truck + Loads planners in Dispatch
SO: prepend BOX 0.
SCOPE (ADDITIVE): mirror Safety › Workforce Planning › Driver Scheduler (/safety/driver-scheduler) — driver × calendar-date leave grid, Driver + Unit frozen cols, range 7/14/30/40 (default 30). Add into Dispatch (same data source as Safety — reuse, do not fork): Driver Planner (leave/PTO/off/emergency-with-expected-return; "+ Request time off" → existing Leave Requests; balances → Leave Balances), Truck Planner (assigned/available/reserved-hold/in-shop, same grid+range), Loads Planner (Gantt: each load a bar spanning pickup→delivery across the same date columns). All three share one range/timeline.
FILES: apps/frontend/src/pages/dispatch/planners/{DriverPlanner,TruckPlanner,LoadsPlanner}.tsx (NEW) reusing Safety scheduler grid component + driver-finance leave APIs.
ACCEPTANCE: grids match Safety scheduler; range toggle works; Loads bars span multi-day; clicks open driver/unit/load drawers.
LANE LOCK: planner files; do NOT edit Safety scheduler source (reuse only).
