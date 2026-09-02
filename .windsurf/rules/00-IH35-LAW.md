---
trigger: always_on
description: IH35 current law — the only always-on Cascade rule
---

# IH35 LAW (always-on)

**OWNER LAW** overrides every older rule file, spec, audit doc, skill, and session memory — **including an agent's own stored memory or knowledge** (Cursor Memories, Devin Knowledge, Windsurf memories). If a memory or an older doc says TMS-native data is TEST, or treats TRANSPORTATION / TRUCKING as live work, or points at a `Downloads` block queue, it is stale. This file wins.

1. Do what Jorge says, first time — the live thing, not a plan about it.
2. Question once (short), then execute. Never raise it again.
3. Not attorney / CPA / compliance officer. Do not lecture about courts, lenders, insurers. **Highest quality and honesty still apply:** match/surpass QuickBooks, NetSuite, McLeod, Alvys; traceable numbers; no silent failures; no unverified claims. Trust over speed. That is workmanship, not a legal lecture.
4. Never invent a rule and cite it back. If you cannot quote Jorge, it does not exist.
5. No defer, no patch. Fix the blocker in-session and finish.
6. Live = open in Chrome and click. Else not done.
7. Done requires pasted proof (row, screen, query). No fake green.
8. Empty is a question. Check entity, filter, RLS, join, spelling first.
9. Guessing → stop and read the source (PDF, live table, statement).
10. Facts: production/document wins. Decisions: Jorge wins.

Reply shape: **what I did · proof it is real · what's next.**

## Scope

- **USMCA only** (`5c854333-6ea5-4faa-af31-67cb272fef80`). TRANSP and TRK frozen — do not read/write/report them.
- Neon `tiny-field-89581227` branch `br-fancy-credit-akjnd07a`. Scoped reads: `SET LOCAL app.bypass_rls = 'lucia'` and/or `app.operating_company_id`. Completeness discriminator on the **same** table.
- **CORRECTION, and this one matters.** Older docs say "ALL TMS-native data is TEST — only the TRANSP QBO mirror is real." **That is FALSE for USMCA.** Every USMCA record is REAL unless it carries `is_sample_data = true`. Never write test/sample/demo/proof fixtures into USMCA. Seats **never POST Book Load**.
- Queue = `docs/bus/INBOX-<SEAT>.md` + `docs/lockdown/GO-20-EIGHT-FEATURES.txt`. **Never** `Downloads/final`, `Downloads/20 blocks`, `Downloads/abb`, `Downloads/ab`, `Downloads/sdf`. **Never** start from GUARD-WORKORDERS sweep rows (SWEEP-A, SORT-03, BOOKLOAD-ALWAYSTRACK). Cursor lead **coordinates seats**, does not sweep.
- The audit phase and the block-dispatch phase are **over**. Do not open an audit, do not write a block, do not re-audit a row.
- U14 CERTIFIED — never recertify. No `JORGE-APPROVED`, no holds. Merge on green + proof. Never `trigger_deploy` — Cursor only.
- Write canonical hubs (`driver_finance.*`, `mdata.qbo_*`, `banking.*`, `maintenance.*`, `mdata.vendors`, `catalogs.load_cancellation_reasons`, `mdata.loads`). Never RETIRE twins.

## Work shape

Every fix is a **vertical slice**: table change, backend rule, endpoint, screen, guard, proof. Done when somebody clicks it in a browser and sees the right thing happen. No layer work, no partial slices.

## Seats

CC-1 money · CC-2 verify-live (the only seat that writes the verified flag) · CC-3 mechanical · Cascade merge API · Codex reverse/CI · Devin-A Chrome cancel-only. Cursor is lead. Migration lanes: CC-1 hours 00–11 UTC, Cursor hours 12–23 UTC, one author per migration.

## Standing facts

- Capitalize threshold **$7,000**. At or above capitalizes; under expenses.
- USMCA opening balances are **$0** — the books start from zero.
- **Parallel books. No write-back to QuickBooks, ever.** Reconcile only.
- **Void is a reversal, never a delete.** Every void and cancellation keeps a register. No `DELETE FROM` on financial tables.
- Nobody closes a period but Jorge.
- Migrations are idempotent and CREATE-only. `IF NOT EXISTS`. Never `DROP`.
- Views use `WITH (security_invoker = true)`. Never `SECURITY DEFINER`.
- RLS is **not** a backstop for Owner sessions — `org.user_accessible_company_ids()` returns every active company for an Owner, so every unscoped read is load-bearing on its own predicate.
- Three dates: **incurred** drives load margin, settlement and P&L; **due** drives cash flow and payables aging; **paid** drives reconciliation only. A payment clears a liability and never adds cost to a load.
- Plain English on every operator-visible surface. No underscores, no machine names, no all-capitals data.

Read first: `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` (scope, standing decisions, accounting architecture, live state, known traps). Then `docs/lockdown/GO-19-BUILD-QUEUE-AND-ORDER-2026-09-02` and `GO-20-BUILD-THE-EIGHT-FEATURES-2026-09-02`.
