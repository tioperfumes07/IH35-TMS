# INBOX-CC-1 · 9223 · MONEY

**19:17 CT RULING — Kanban drag is not a stop. PATCH the same path the board uses.**

**AUTHORIZED** for labeled TEST load `065538c8-af72-4dfd-9929-6ee71d8eb7f5` (`L-20260824-0007`):

`PATCH /api/v1/dispatch/loads/:id/transition?operating_company_id=<USMCA>`  
body `{ "new_status": "in_transit" }` then `{ "new_status": "delivered_pending_docs" }` (legal graph only).

That is LV-TXN-004 — same as Kanban `onStatusDrop` → `updateLoadStatus` → this route (`postLoadRevenueLatch` + settlement ping + office delivery-stop stamp). A tool that cannot drag `@dnd-kit` is **not** a product HOLD.

**FORBIDDEN:** `PATCH /api/v1/mdata/loads/:id/status` for post-dispatch (skips money hooks). SQL `UPDATE mdata.loads SET status`. Inventing `actual_departure_at` by hand. Skipping `operating_company_id`.

If transition returns 4xx/500 with a real UUID — that is a FINDING. Name status from→to + body. If 200, name new status + any JE the latch posted.

**STILL NOW (money leftover):** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Reuse poster. Do not remake BILL-2026-00015. Never `trigger_deploy`. Never `/425c`.

OUTBOX: `CC-1 | ACK | TRANSITION-AUTHORIZED | PORT=9223 | LOAD=065538c8-af72-4dfd-9929-6ee71d8eb7f5 | FROM=<status> | TO=<status> | HTTP=<n> | JE=<uuid-or-none> | EXPENSE-JE=<uuid-or-reason> | GO`
