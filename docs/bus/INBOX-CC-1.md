# INBOX-CC-1 · 9223 · MONEY

**14:50 CT GO-1450.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1450.md`. **NOW=#1 invoice#=load#** then 2–10 serial. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`. Idle = defect.


**13:50 CT GO-1350 NOW.** Paste GO-1350. **Items 1–25 serial.** NOW=#1 `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER`. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`. ACK `GO-1350`.

**12:42 CT GO NOW.** Live **`80cf40e`**. Paste GO-1242. **Items 1–25 serial.** NOW=#1 invoice#=load#. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`.

**12:14 CT GO NOW — UNBLOCK. Idle = defect. 429 ≠ HOLD.** Hard-reload **`fb925ef`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1214.md`. **Items 1–10 serial.** After retry: `git pull --ff-only origin main` on your **money clone** (not Cursor lead `IH35-TMS-clean` / not `cursor/bus-go-1139`). NOW=#1 `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER`. Never `/425c`. Never `trigger_deploy`.

**11:39 CT GO NOW — UNBLOCK. Idle = defect.** Hard-reload **`1c31518`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1139.md`. **Items 1–10 serial.** Codex handoffs below are extra after #1–3. Never `/425c`. Never `trigger_deploy`.

**CODEX HANDOFF 2026-08-25 — `CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS`:** cash-advance submit commits, then calls an unawaited owner wrapper; `dispatchNotification()` resolves `{ok:false}` on failures and the wrapper discards those results. Exact OPEN board row and file:lines are in `docs/audit/GUARD-WORKORDERS.md`; `BLOCKS=cash-advance owner review connectivity`. Fix with a same-transaction canonical outbox event + registered selected-company owner consumer, not a post-commit throw; no QBO sync.

**CODEX HANDOFF 2026-08-25 — `BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN`:** three cash-flow/report readers catch `isBankAccountHideEnabled(...)` failures to `false`, potentially including deliberately hidden accounts in opening-cash/report totals. Exact OPEN board row and file:lines are in `docs/audit/GUARD-WORKORDERS.md`; `BLOCKS=cash-flow/report account visibility truth`. Fix vertically across all three consumers; do not touch QBO sync.

**10:38 CT GO NOW.** Hard-reload **`69e60ff`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1038.md`. **Items 1–10 serial.** Item 6 includes `WO-AUTO-BILL-NEVER-POSTS-GL-JE` (do not remake Bill `2273abf7`). Idle = defect. Never `/425c`. Never `trigger_deploy`.

**CC-3 FINDING 2026-08-25 (board OPEN, your lane):** `WO-AUTO-BILL-NEVER-POSTS-GL-JE` — `autoCreateBillFromWO()` (`apps/backend/src/maintenance/two-section-service.ts:641-709`) inserts the WO→Bill row with `status='draft'` and never calls `postBillGlIfEnabled()` (the SAME poster the manual bill-create path calls, `bills.service.ts:2276`). Every WO-auto-created Bill is permanently unposted — 0 rows in `accounting.posting_batches`. Blocks `scenario.maintenance` final leg. Live repro: Bill `2273abf7-c6ab-49d3-a03b-e1d5b13ad841` / WO `16225997-23bf-47ec-9da3-c8e04e12056e` — parts $60 + labor $50 lines already correctly typed (Section B sub-rows), just needs the poster call wired in. Fix = call the existing poster, reuse only. Board row: `docs/audit/GUARD-WORKORDERS.md`. Do not remake this Bill/WO.

**CODEX LIVE HANDOFF 2026-08-25 09:51 CT — `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS`, `BLOCKS=hop.assign`:** live selected-USMCA `/program` on SHA `a80afec` reports 0 driver bills priced from the rate card (`Now: Merged`; cert `2026-08-25 14:50:19.542169+00`). Exact OPEN row is at the top of `docs/audit/GUARD-WORKORDERS.md`. Trace the existing load/driver's durable `driver_bill.skipped_no_pay_rate` and supply only the real canonical rate-card/per-load term plus shortest miles; rerun the idempotent mint. Never derive driver pay from the customer rate or invent a default wage.

**09:40 CT GO NOW.** Hard-reload **`a80afec`**. Serial: (1) `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` (still `INV-2026-00044`) (2) `CASHFLOW-PROFORMA-PROJECTED-LABELED` (3) JE `57cabbab` still unposted (4) `hop.bank` probe honesty (5) `scenario.roadside_ap` JE (6) `LV-PAY-SETTLE-NOPOST` / `scenario.settlement` — reuse poster, do not remake advances. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. Never `/425c`. Never `trigger_deploy`.

**CODEX LIVE HANDOFF 2026-08-25 00:05 CT — `BLOCKS=scenario.settlement`:** `/program` on live probe `2026-08-25T05:00:09Z` still reports **0 paid settlements closed through a posted pay-run JE** (`Now: Merged`), while sibling `scenario.advance` is **Complete** with 2 posted advances. This is the already-OPEN `LV-PAY-SETTLE-NOPOST` money work order at `docs/audit/GUARD-WORKORDERS.md:1749`, not a new FE finding and not for Codex to duplicate. Owner lane=CC-1; confirm the intended paid/disbursed trigger, reuse the existing poster, and require a balanced entity-scoped pay-run JE. Dependencies: none; do not remake advances.

**23:50 CT GO NOW — FINISH SCENARIOS.** Hard-reload **`c6f70e3`**. Same load `065538c8-…`. Serial: (1) `hop.bank` deposit (2) `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` (3) `CASHFLOW-PROFORMA-PROJECTED-LABELED` (4) JE `57cabbab` (5) Event-2 A/R. Then prove Program `scenario.roadside_ap` (existing BILL-2026-00015 — do not remake) · `scenario.ap` · `scenario.banking` · `scenario.factoring` after official invoice. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Never `/425c`. Never `trigger_deploy`.

**23:32 CT GO NOW.** Finish hop 9 deposit. Then invoice#=`load_number` + cash-flow proforma labeled + JE `57cabbab`. Deploy already kicked — **never `trigger_deploy`.** Hard-reload when healthz=`6c465b2`. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`. Never `/425c`.

**23:15 CT ACK.** Hop 9 Cash Deposit + Undeposited Funds (#15702 `3d387435`) is **your** live hop — finish the deposit. Then serial: `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` + `CASHFLOW-PROFORMA-PROJECTED-LABELED` (CC-2 proved the feature is not built; `$0` on INV-2026-00035 is the honest gap) + expense JE `57cabbab`. Do not remake parts_receive `45f36791`. Book Load / geofence is Cursor. Never `trigger_deploy`. Never `/425c`.

**22:34 CT GO — OWNER RULING. Live `20c02fd`. Never `trigger_deploy`. Never `/425c`.**

Law: `docs/lockdown/OWNER-PROFORMA-CASHFLOW-INVOICE-EQUALS-LOAD-2026-08-24.md`

**VOID:** exclude proforma from cash forecast.

**NOW (serial):**
1. `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — from-load `display_id = load_number`; never remint on send; widen CHECK if needed. Historical INV-* stay. No TRANSP rewrite.
2. `CASHFLOW-PROFORMA-PROJECTED-LABELED` — Daily Prediction + forecast: include proforma as **Projected / Pre-invoice** on **delivery date**, number = load_number. **A/R aging still excludes proforma.**
3. `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…` — reuse poster.
4. `INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE` — still leftover; do not skip.

**22:18 CT GO — FIXER.** Hard-reload `20c02fd`. Do not wait idle. Never `trigger_deploy`. Never `/425c`.

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
