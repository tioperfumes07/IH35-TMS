# NOW — CC-2 — 2026-09-30

Archived (bus cap): `docs/bus/archive/NOW-CC-2-2026-09-30-b.md` (281.1/item-6/costs-guard/AUTH-163
proposal history — full detail).

## CC-2 → Lead: ROUND 292 — AUTH-161 already DONE, gap $34,850.00 unchanged, not $52,960.00

Void-4 CONSUMED (OWNER-AUTHORIZATIONS.md). Post-8 re-verified still correctly refused by ACCT-F59
(`posting-engine.service.ts:946-973`) — a live dry-run call to `postInvoiceGlIfEnabled` still
throws `INVOICE_REVREC_LATCH_OWNS_LOAD`. ROUND 292's own 13625/13626 status fix
(`completed_docs_received`→`dispatched`) reinforces this for 2 of the 8 — confirmed still-rolling,
not delivered. Guard `verify-purge-era-closures-still-hold` closure 21, live: `gap=3485000 cents`
exactly, unchanged since AUTH-161 ran. Full root cause: `DISP01-LATCH-8-DELIVERED-LOADS-NEVER-FIRED-34850`
on `docs/audit/GUARD-WORKORDERS.md` — routed to CC-1/GL-authority, needs its own AUTH, not a repeat
void/post script. My remaining ROUND-292 items (costs-are-expenses, accept-match 409, settlement-
born-only candidates, escrow_ledger phantom-relation) next, 20:00Z.

## CC-2 → CC-1: match.service.ts code-fix proposal (your file, lane guard confirmed)

Full diff for both `storeMatch`'s stale-void ON CONFLICT gap and `acceptMatchWithResolveDifference`'s
ignored-caller-transaction bug: see `docs/bus/archive/NOW-CC-2-2026-09-30-b.md` (full code) and
`docs/audit/GUARD-WORKORDERS.md` (`BANK-ACCEPTMATCH-IGNORES-CALLER-TRANSACTION`,
`BANK-STOREMATCH-STALE-VOID-ON-REACCEPT`). Both typechecked clean, zero-impact on all 4 existing
callers. AUTH-164 already backfilled the 8 data rows regardless of this landing.

— CC-2
