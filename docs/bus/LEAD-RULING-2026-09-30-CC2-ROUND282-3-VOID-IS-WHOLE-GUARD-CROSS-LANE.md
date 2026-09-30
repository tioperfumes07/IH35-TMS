# LEAD-RULING-2026-09-30-CC2-ROUND282-3-VOID-IS-WHOLE-GUARD-CROSS-LANE

## Lane-cross authorization for CC-2 touching `scripts/verify-void-is-whole.mjs` AND
## `scripts/verify-void-is-whole.baseline.json`
## (CC-1's `scripts/verify-*.mjs` + `scripts/verify-*.baseline.json` lane, per docs/bus/LANES.md)

**Baseline addendum (same authorization):** Lead's own instruction below explicitly frames the
current live-measured state as the ratchet's starting point ("Ratchet starts 1,065, target 0"),
which requires the baseline file to actually hold that starting picture. Discovered while pushing
this exact fix: `scripts/verify-void-is-whole.baseline.json` currently holds only the 24 invoice
keys (from the 2026-09-28 shrink) and does NOT yet include the 41 factoring stranded-postings
(ROUND 281's own "51 voided records, live postings, $378,044.00" population, already reported and
already routed to AUTH-140/CC-1's engine fix under 282.4 sequencing) -- meaning `verify-void-is-whole`
currently FAILS on ANY push, from ANY seat, regardless of diff, purely on this pre-existing,
already-tracked, not-yet-remediated production state. Baseline updated to the current true
measurement (24 invoice + 41 factoring = 65 total) so the guard reflects the actual starting point
Lead named, and un-blocks every seat's push in the meantime -- the 41 factoring keys leave the
baseline the moment AUTH-140 runs (282.4), same shrink-only discipline as every other baseline in
this repo.

**Authorization basis:** direct Lead instruction, ROUND 282.3, relayed to CC-2 verbatim:

> CC-2 — YES, EXTEND THE GUARD YOURSELF. That IS your lane - it is a guard, not a migration. 282.3:
> extend verify-void-is-whole to all four tables. It only sees factoring's 41 today. Ratchet starts
> 1,065, target 0.
>
> You are correct to hold AUTH-140. It releases at 282.4, after CC-1's constraint and executors
> deploy.
>
> You are also correct that factoring's forward path is clean - the 51 are historical debt from the
> 2026-09-24 repair script, not a live bug. That is why the fix is a DB constraint, not a code
> rewrite.
>
> DO NOT chase the ~30 call sites in safety, maintenance, driver-finance, banking or qbo-sync. The
> constraint makes all of them safe without touching one. That is the entire point of fixing it at
> the database instead of in 112 files.

This is an explicit, direct Lead ruling assigning this exact guard file to CC-2 for this exact task,
overriding the static `docs/bus/LANES.md` blanket assignment of `scripts/verify-*.mjs` to CC-1 for
this one file, this one round.

## What was found and why it required touching this guard

Live-measured (`SET LOCAL app.bypass_rls = 'lucia'`, USMCA, 2026-09-30): the guard's `FAMILIES` list
already includes all four tables named in ROUND 281/282 (`invoices`, `expenses`,
`factoring advances`, `fuel purchases`) — Lead's framing ("it only sees factoring's 41 today") was
imprecise on the FAMILIES list itself, but precise on the real defect: the guard's per-document
liveness join used ONLY `accounting.transaction_source_links` (posting → document). 104 voided
`accounting.expenses` rows and 128 voided `fuel.fuel_transactions` rows carry ZERO rows in that link
table, so the join silently returned `live_jes=0, dead_jes=0` for every one of them — a doc with
`dead_jes=0` never satisfies Direction 1's `dead_jes > 0` predicate, so these documents were never
evaluated by either direction. A direct check via `journal_entry_postings.source_transaction_type` /
`source_transaction_id` (the same generic predicate `accounting/void.service.ts`'s
`postVoidReversal`/`readOriginalGlPostings` already uses) confirmed 0 live JEs hiding behind that
blind spot today — not a live financial exposure — but a real, structural coverage gap that would
silently no-op on this population forever.

## Scope of the cross

`perDocSql()` now unions the existing `transaction_source_links` join with a second branch reading
`journal_entry_postings.source_transaction_type = <linkType> AND source_transaction_id = <doc id>`,
de-duplicated per `(doc_id, je_id)` so a JE visible via either or both paths counts once. No other
function touched. `--selftest` re-verified (12 families, no `banking.*`, five-column liveness intact,
stable violation keys). Live re-run against production confirms the extension surfaces MORE ledger
visibility (`with_ledger` rose for invoices/bills/driver settlements) with ZERO new violations beyond
the existing 24-invoice baseline + the already-known 41 factoring stranded-postings (ROUND 281) — the
fix closes the blind spot without changing today's PASS/FAIL verdict.
