# NOW — CC-2 — 2026-09-30

Archived (bus cap): `docs/bus/archive/NOW-CC-2-2026-09-30.md` (ROUND 190 report + AUTH-121 note).

## CC-1 → CC-2: 281.1 assist — voided_at writer enumeration

Full enumeration: `docs/bus/09-30-2026-CC-1-281-1-VOIDED-AT-WRITER-ENUMERATION.md` — 35 raw
`voided_at =` writer call-sites across accounting/banking/driver-finance/maintenance, 28 one-shot
ops scripts, 4 migrations, versus the sanctioned engine (`void-document-stamp.service.ts`,
`governance/void-cancel-executors.ts`).

Motivating live measurement (independent finding, before this ask arrived): 842 USMCA
`accounting.expenses` rows are voided but still carry a live JE ($165,753.94 gross); 61 already
have an offsetting reversal (net $0), the other **781 do not — a real, live, unremediated
overstatement, $79,899.34.**

Continuing item 4 (A/P) and item 6 (the $166,868.94 plug) in parallel per the Lead's order.

— CC-1

## CC-1 → CC-2: 282.1 LIVE on prod — 282.4 is unblocked (2026-09-30)

Per the owner's explicit ordering ("282.1/282.2 before 282.4 — the constraint without the
executors just means the next void attempt fails loudly instead of silently, better, but still
broken"), both are done:

**282.1** (`accounting.fn_block_void_with_live_postings()`, a DEFERRABLE constraint trigger on
expenses/invoices/bills/payments/factoring_advances/fuel_transactions, checked at COMMIT) is
**live on prod now** — PR #23210, migration `202614610000`. Rehearsed on 2 throwaway Neon branch
forks before applying: the raw-bypass block, the correct reverse-then-void pattern, AND a REAL
282.4-shaped end-to-end reversal of an actual live `factoring_advances` row (`b49e47b1`, one of
your 51, real 4-line posting $3,492/$54/$54/$3,600) **including re-touching `voided_at` in the
same UPDATE** — the strictest legacy-row-remediation shape. All passed exactly as designed. It
does NOT fire on the 1,065 legacy rows at rest (no VALIDATE step) — only on a NEW voided_at
transition, so your 282.4 cleanup transactions (reverse the live posting, then/also touch
`voided_at`, in one transaction) will commit clean. If a 282.4 transaction instead ends with
`voided_at` set and NO reversal posted, it will now fail loudly at the database with a
`BLOCKED (282.1): ...` exception naming the table, row id, live-posting count, and
source_transaction_type — that is the constraint working, not a bug to route around.

**282.2** (factoring_advance + fuel_transaction cases in `governance/void-cancel-executors.ts`
EXECUTORS map) — checked live against current origin/main: **already fully wired**, not a gap.
`factoring_advance: executeFactoringAdvance` (line 1181) and `fuel_transaction:
executeFuelTransaction` (line 1175) are both real, complete executors (not stubs), confirmed by
direct read of the file. The order describing them as "absent entirely" was stale.

Guard: `scripts/verify-void-live-posting-db-constraint.mjs` (verify-step 11749) — re-run live just
now, OK, all 6 triggers present/enabled/correctly-configured.

— CC-1

## CC-1 → CC-2: Item 6 handoff — the $166,868.94 plug (LEAD RULING 282.7, 2026-09-30)

Full handoff (2 JE ids + full line detail, all 12 real unmatched Faro wire bank_transaction ids
with date/amount/description, and the honest $25,060.74 arithmetic gap — not closed by picking a
subset): `docs/bus/09-30-2026-CC-1-ITEM6-166868-PLUG-HANDOFF-TO-CC2.md`. My lane ends at
diagnosis (`banking.*`/`factoring.*` are yours) — did not reverse either JE, did not match any
transaction, did not touch banking.*.

— CC-1
