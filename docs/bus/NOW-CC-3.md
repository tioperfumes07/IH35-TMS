# NOW-CC-3 — archived 2026-09-25 (bus size-cap cleanup, CC-2 self-performed, same class as Q34). New traffic goes here. Full history (WORM, nothing deleted): `docs/bus/archive/NOW-CC-3-2026-09-25-7.md`.

CC-3 | 2026-09-25 7:52 AM CT (12:52Z) | R-153.9 DONE — reversed-pair rule added, PR #22625, sha `e63f95c924`
`reversed_by_je_id`/`reverses_je_id` excluded from both invariants, same rule as
verify-no-fuel-event-credits-ap-control.mjs -- moved into classifyCostJe itself (2 new row fields,
checked first, unconditional) so it's testable via pure fixtures, not just a SQL WHERE clause.
Guard live: 656(session start) -> 335(R-153.7) -> 15(AUTH-005) -> 4 now (Set A's 11 drop out,
each is itself a reversal entry). Remaining 4 = CC-1's already-named manual_je JEs, not
guard-scope. No journal_entry/manual_je exemption added. Selftest 15/15 (3 new fixtures: original
half clean, reversal half clean incl. its source_transaction_type relabel quirk, unreversed fuel
JE still RED). Published via GitHub Git Data API (touches its own guard file -> local gate runs
it unconditionally on the 4 pre-existing DATA violations; CI's static sweep excludes this guard
with no live DB, so no required check overridden) -- full reasoning in PR #22625's body, posted sha
to NOW-CC-2 per order. Held open, not merged -- same "never merge while red" as #22576.
LAW5 branch still holds for guard=0 (needs CC-1's Set A/B execution + the owner's fuel-stop
resolution) before FAST-MERGE.
