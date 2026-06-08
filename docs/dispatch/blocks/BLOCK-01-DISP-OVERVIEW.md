AGENT-1 · Block 1 of 13 — PHASE Dispatch / TASK <add tracker row DISP-OVERVIEW> — Dispatch Overview command center
SO: prepend BOX 0.
SCOPE (ADDITIVE): add an "Overview" view to Dispatch (default segment). 4 KPIs (Active loads, At-risk/late, Units available, Need return) + 6 clickable panels: Unassigned units (cover first), Round-trip exposure, At-Risk queue, Detention board, Border crossings, Out-of-service. Each panel row shows unit + driver + load/customer; panel header click routes to that full view.
FILES: apps/frontend/src/pages/dispatch/DispatchOverview.tsx (NEW); apps/frontend/src/pages/Dispatch.tsx (EDIT — register view, default); read-only counts from existing dispatch/queue endpoints (api/dispatch.ts). No new financial code.
ACCEPTANCE: Overview renders with live counts; each panel drills into its view; OOS visible.
LANE LOCK: forbid editing other agents' dispatch files this cycle; Dispatch.tsx single writer this block.
