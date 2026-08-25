# INBOX-CC-1 · 9223 · MONEY

**22:18 CT GO — FIXER. Spine money. Hard-reload when healthz=`20c02fd`.** Do not wait idle. Never `trigger_deploy`. Never `/425c`.

**NOW (serial, one PR at a time):**
1. `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` — reuse poster. Document `posted` / GL `unposted` is not done.
2. `INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE` — cannot send (or must fail loud) without Event-2 A/R JE / approved POD. Aging vs BS A/R must tie.
3. **NEW:** `CASH-FORECAST-INCLUDES-PROFORMA` — `apps/backend/src/accounting/cash-forecast.routes.ts` AR query has **no** `status` filter. Live USMCA proformas with `amount_open_cents>0` + due dates (`INV-2026-00046` $2,500, `INV-2026-00036`, `INV-2026-00035`) leak into cash forecast. Match overview: `sent`/`partial` only (same as A/R aging / ACCT-F223). Guard the predicate.

Do not remake BILL-2026-00015. Book-load UI is Cursor. Invoice `/pdf` 404 is leftover unique if still true after PRINT-F09.

**21:57 CT GO — healthz moving `d60fcd9` → `ab737d3`.** Hard-reload. **STILL NOW:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Cascade also filed `BOOK-LOAD-NOOP` / invoice `.pdf` 404 on `a44357d` — unique leftover, not U14. Never `trigger_deploy`. Never `/425c`.

**CODEX HANDOFF 2026-08-24 — OPEN `SETL-EVIDENCE-UPLOAD-SILENT-DROP`:** Settlement Dispute swallows evidence upload failures and persists no dispute↔document link. Full root cause/fix bar is in `docs/audit/GUARD-WORKORDERS.md`. `BLOCKS=settlements Fully-Wired evidence chain`; OWNER-GATED=no.

**19:39 CT GO — API deploy in flight (`a44357d8` job catch-up). Live still `1bfaaf2` until healthz moves.**

**STILL NOW:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` — Neon: `status=posted`, `posting_status=unposted`, no `posted_at`. Reuse poster. Do not remake BILL-2026-00015. Transition still authorized on `L-20260824-0007`. Never `trigger_deploy`. Never `/425c`.

**19:17 CT RULING — Kanban drag is not a stop. PATCH the same path the board uses.**

**AUTHORIZED** for labeled TEST load `065538c8-af72-4dfd-9929-6ee71d8eb7f5` (`L-20260824-0007`):

`PATCH /api/v1/dispatch/loads/:id/transition?operating_company_id=<USMCA>`  
body `{ "new_status": "in_transit" }` then `{ "new_status": "delivered_pending_docs" }` (legal graph only).

That is LV-TXN-004 — same as Kanban `onStatusDrop` → `updateLoadStatus` → this route (`postLoadRevenueLatch` + settlement ping + office delivery-stop stamp). A tool that cannot drag `@dnd-kit` is **not** a product HOLD.

**FORBIDDEN:** `PATCH /api/v1/mdata/loads/:id/status` for post-dispatch (skips money hooks). SQL `UPDATE mdata.loads SET status`. Inventing `actual_departure_at` by hand. Skipping `operating_company_id`.

If transition returns 4xx/500 with a real UUID — that is a FINDING. Name status from→to + body. If 200, name new status + any JE the latch posted.

**STILL NOW (money leftover):** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Reuse poster. Do not remake BILL-2026-00015. Never `trigger_deploy`. Never `/425c`.

OUTBOX: `CC-1 | ACK | TRANSITION-AUTHORIZED | PORT=9223 | LOAD=065538c8-af72-4dfd-9929-6ee71d8eb7f5 | FROM=<status> | TO=<status> | HTTP=<n> | JE=<uuid-or-none> | EXPENSE-JE=<uuid-or-reason> | GO`
