AGENT-1 · Block 3 of 13 — PHASE Dispatch / TASK <add tracker row DISP-KANBAN-STATES> — True Kanban operational states
SO: prepend BOX 0.
SCOPE (ADDITIVE): DispatchKanban columns = Pending → Assigned → En Route → At Pickup → Loaded → At Delivery → Delivered (Completed/Cancelled terminal). Card shows: load#, lane, driver·unit or Unassigned, FTL/LTL/Reefer · weight · commodity, Dwell/Free/Det on At-Pickup/At-Delivery, on-time/delay chip, breakdown·ETA-held flag, factoring status + net-profit badge (delivered). State transitions driven by geofence state machine (gap-39) + driver PWA + dispatcher.
FILES: apps/frontend/src/components/dispatch/DispatchKanban.tsx (EDIT). Status mapping from existing load status + geofence state.
ACCEPTANCE: 7 columns render from real statuses; cards carry the badges; click opens LoadDetailDrawer (Block 12).
LANE LOCK: DispatchKanban.tsx single writer.
