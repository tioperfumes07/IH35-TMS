# ROUND 174 progress — CC-1 — 2026-09-25 4:40 PM CT (21:40Z). Deadline 09-26 06:00 UTC.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-26.md` (WORM).

## STOP acknowledged — AUTH-033 (load 13570) WITHDRAWN, no double-book happened
Claude-Lead caught it live: advance 35269c66 (CA-2026-TIE-5801, $200.00) already has BOTH legs
posted — issuance Dr 1245 $200.00 (JE c8e25275, "CA issuance backfill CA-2026-TIE-5801",
2026-09-24) and recovery Cr 1245 $200.00 (JE ad91e791, "Settlement S-5801 — cash-advance recovery",
2026-09-10). Net $0 for this advance already. My own "does a JE exist" check (in the withdrawn
script and in my own live queries) filtered `source_transaction_type = 'driver_advance'`; the real
value on these backfilled rows is `'driver_cash_advance'` — a naming mismatch in my own read, not a
real gap. No production write ever happened under AUTH-033 — its one real attempt failed atomically
on a genuine, separate bug (below) and rolled back before this false gap was caught. AUTH-033
marked WITHDRAWN with the full note (docs/bus/OWNER-AUTHORIZATIONS.md), the script hard-refuses
immediately now, PR #22736.

Re-measured 1245's full live net while in there: $2,477.95, not $0. Traces to entries unrelated to
13570 — unpaired $201.99 debit on settlement 5769, an extra unpaired $200.00 debit on settlement
S-5800, and the 374ab2d5/0379e154 reversal pair reading as a standalone +$201.99 (possibly correct
bookkeeping, possibly a query-filter artifact on my end — not chased further, full row dump already
sent, AUTH-030/R-176 owns this reconciliation).

## Real bug found + fixed along the way: ACCT-F2026092584 (PR #22730)
`resolveAccountForCategory` (used by buildCashAdvanceLines/buildDriverAdvanceLines) ignored any
client the caller already held and always opened a SECOND connection via `withLuciaBypass`, which
runs its own `SET LOCAL ROLE ih35_app` — invisible in the real app (which has that role), but fatal
for any one-shot script using the `~/.ih35-gate.env` credential's "in-client" workaround pattern
for a driver_advance/cash_advance posting. Fixed with a backward-compatible optional `client` param
(14 other call sites unaffected, tests updated + a new regression test added). This is why my
AUTH-033 attempt failed loudly instead of silently succeeding wrong — good, since it turned out to
be the wrong fix anyway.

## Also fixed forward: ACCT-F2026092583 (merged) — typecheck-merge-result was red on all of main
PR #22718 put the expense item/qty/rate/UOM fields on the wrong type (`BillDetailLine` instead of
`ExpenseDetailLine`), breaking `typecheck-merge-result` for every PR since. Fixed and merged
(#22726) before my own PRs could pass CI.

## Baseline (step 1, still holds) — all 7 gates PASS, parity 34/34
`tools/gates2.sh` + `tools/build2.py` (real 19-doc Sep list). All 7 LIVE PASS. Load 13579's
"duplicate/wrong load" flag verified CLEAN by hand (stale build2.py artifact, not a real defect).

## Pivoting now per Lead's explicit order: R-159 wire-fee split, then back to September
21 days FAIL with discount +10.00 / wire -10.00 each (9/21 passes per `verify-feed-day.mjs --all`).
8/10 also carries escrow +30.90 / discount +16.60, and 8/12 carries escrow +25.50 — measuring both
before fixing. Will issue the next free AUTH (re-confirming the live highest number first — it's
moved fast today) once I have a script and a DRY_RUN.

CC-1 | 4:40 PM CT (21:40Z) | AUTH-033 withdrawn, no harm done, one real shared-code bug found+fixed
along the way. Moving to R-159 now.
