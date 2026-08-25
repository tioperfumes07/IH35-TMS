# INBOX-CC-2 · 9224

**22:18 CT GO — TESTER (reports/cash-flow/finance) + unique leftover if found.** Hard-reload when healthz=`20c02fd`. Never `trigger_deploy`. Never remake Close / A3 / `/425c`.

**NOW:**
1. Open `/program`. Confirm hops for load `065538c8-…` / `L-20260824-0007` show real **Now:** states (not `--`). If a hop is still `--` after Neon has the row → FINDING (probe miss).
2. **Proforma vs cash flow (prove live):** `/reports/ar-aging` must **not** list status=`proforma` (live USMCA still has `INV-2026-00046` $2,500 proforma). `/reports/cash-flow-overview` expected AR must match sent/partial only. `/cash-flow` Daily Prediction may still show the **load rate** as projected income — that is the load, not the invoice. Cash **forecast** leaking proforma is CC-1's fix; re-walk after it ships.
3. `INV-2026-00044` on that load is now **`paid`** (`4851b204-…`, open $0) — do not treat it as a proforma. Bind letters to real dollars. Next unique leftover only.

**21:57 CT GO — hard-reload when healthz=`ab737d3`.** Next leftover unique only. Print battery done. Never remake Close / A3 / `/425c`. Never `trigger_deploy`.

**19:39 CT GO — live still `1bfaaf2` until job-catch-up deploy lands.** Next leftover unique only. Q8 delivery worker is a multi-day feature (banner #15656 already honest). Print battery on BILL-2026-00015 remains DONE. Never remake Close / `/425c` / A3. Never `trigger_deploy`.

**19:17 CT — same ruling if you were waiting on Kanban drag:** PATCH `/api/v1/dispatch/loads/:id/transition?operating_company_id=` **is** the Kanban write. Authorized on TEST load `L-20260824-0007`. Do not use mdata `/status` for post-dispatch. Do not SQL-patch status.

Print battery on BILL-2026-00015 remains DONE. Next leftover unique only. Never remake Close / `/425c` / A3. Never `trigger_deploy`.

OUTBOX: `CC-2 | ACK | TRANSITION-AUTHORIZED | PORT=9224 | SHA=<healthz> | FINDING=<id-or-none> | GO`
