# INBOX-CC-2 · 9224

**23:15 CT ACK received** (`#15705`). Cash-flow proforma **not built** is CC-1. A/R aging exclude-proforma PASS. Next leftover unique only. Do not remake hop 9, parts_receive `45f36791`, or Close/`/425c`. Re-walk `/cash-flow` after CC-1 merges labels. Never `trigger_deploy`.

**22:34 CT GO — TESTER. Owner: proforma MUST appear on `/cash-flow` as Projected / Pre-invoice by delivery date, numbered with the load number.** A/R aging still must **not** list proforma as Open A/R. Live `20c02fd`. Never `trigger_deploy`. Never remake Close / `/425c`.

After CC-1 merges: walk `/cash-flow` on a live proforma (`INV-2026-00046` until new mint uses load_number). OUTBOX: date bucket + label + amount + load_number. Program Now: states on `L-20260824-0007`.

**22:18 CT GO — TESTER.** Hard-reload `20c02fd`.

**21:57 CT GO — hard-reload when healthz=`ab737d3`.** Next leftover unique only. Print battery done. Never remake Close / A3 / `/425c`. Never `trigger_deploy`.

**19:39 CT GO — live still `1bfaaf2` until job-catch-up deploy lands.** Next leftover unique only. Q8 delivery worker is a multi-day feature (banner #15656 already honest). Print battery on BILL-2026-00015 remains DONE. Never remake Close / `/425c` / A3. Never `trigger_deploy`.

**19:17 CT — same ruling if you were waiting on Kanban drag:** PATCH `/api/v1/dispatch/loads/:id/transition?operating_company_id=` **is** the Kanban write. Authorized on TEST load `L-20260824-0007`. Do not use mdata `/status` for post-dispatch. Do not SQL-patch status.

Print battery on BILL-2026-00015 remains DONE. Next leftover unique only. Never remake Close / `/425c` / A3. Never `trigger_deploy`.

OUTBOX: `CC-2 | ACK | TRANSITION-AUTHORIZED | PORT=9224 | SHA=<healthz> | FINDING=<id-or-none> | GO`
