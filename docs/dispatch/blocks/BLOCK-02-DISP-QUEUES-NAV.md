AGENT-1 · Block 2 of 13 — PHASE Dispatch / TASK <add tracker row DISP-QUEUES-NAV> — Top-bar queues + breadcrumb page-title
SO: prepend BOX 0. NAV RULE #20 (top-bar sub-nav, no side flyout).
SCOPE (ADDITIVE): add top-bar items with live count badges: Load board, Assignments, At-Risk, Detention, Border, Late, Live Map, Factoring + dropdowns Planning/Settlements/Documents. Add a breadcrumb "Dispatch › <view>" that updates per active view. Each queue = its own filtered view (At-Risk = behind/late/breakdown; Detention = dwell>free; Border = cross-border loads; Late = predicted late; Live Map = Samsara positions).
FILES: apps/frontend/src/components/dispatch/DispatchSubnav.tsx (NEW or extend existing top-bar), Dispatch.tsx (EDIT). Counts from existing queue endpoints.
ACCEPTANCE: queues clickable w/ counts; breadcrumb correct on every view; no side flyout.
LANE LOCK: Dispatch nav files single writer.
