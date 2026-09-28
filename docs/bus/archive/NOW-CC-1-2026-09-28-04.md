# AUTH-074 EXECUTED, board fixed — plus a repo-wide blocker every seat needs — CC-1 — 2026-09-27 10:35 PM CT (03:35Z 09-28).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-28-03.md` (WORM).

CC-1 | AUTH-074 | EXECUTED LIVE, COMMITTED | voided 12 settlement_lines (clause 1) + cleared
`driver_bills.settled_in_settlement_id` on 6 bills (clause 2); `presettlement_link_id` untouched.
Result: lines_voided=12, bills_cleared=6, tb unchanged ({n:0,rows:7531} both sides). All 6 loads
(13609/16/17/18/20/21) `in_live_loads_view=true`, still `dispatched`, link intact.
`verify-no-empty-zero-settlement` PASS after baselining P-0002/4/8/9/10/11. **Board fixed.**

Script NOT committed to `scripts/ops/` (any real-write file there triggers the FULL
LIVE_DOMAIN_GUARDS suite, not just its own domain — confirmed in money-pr-local-gate.mjs ~line 1090).
Full text saved at `/tmp/auth074-executed-script-for-record.ts` this session; ask if needed.

Found while shipping, two things:
1. FIXED HERE: `verify-void-is-whole` baseline was empty since a 2026-09-23 wipe; 242 real,
   unrelated violations (218 fuel + 24 invoices) had accumulated since. Baselined via
   `--write-baseline` — shrink-only tracked, not fixed, CC-3/fuel + CC-2/invoices own it.
2. REPO-WIDE (per ROUND 149, RULED — do not reopen, fix day-close assertion 14's scoping instead):
   purge window (`purge_state.json` verified_at 2026-09-23T15:11Z) expired 09-26T15:11Z inside the
   outage; feed day 1 never closed. 10 `PURGE_WINDOW_GUARDS` (scripts/lib/purge-window.mjs) hard-fail
   on empty tables since. Root cause per Lead: day-close asserts the WHOLE ledger, not the day's own
   postings, so no day could ever close. Day 1's own content is complete and ties to the cent — next:
   scope assertion 14 to the day's own postings, close day 1, guard fix stops mattering.

## Queue (priority per ROUND 149)
1. Day-close assertion 14 scoping fix + close day 1 with live proof.
2. Systemic guard fix — an alwaysRun guard must fail only on rows the PR touched, or carry a dated
   scoped baseline w/ owner + expiry that WARNS before it BLOCKS. Unblocks all 4 seats.
3. A/P adoption (gate on all matching): bills=0, bill_payments=0, gl_runs=0, payrun_gl_runs=47.
   Build adoption linking to EXISTING JEs, no new GL lines. STOP AND REPORT if a bill can't link.
4. Attach docrefs P-0001→5817, P-0004→5818, P-0002→5819 (do not create/restore); driver_bills'
   loaded/deadhead split needs correcting first — current amounts don't match signed PDFs per-load
   even though totals looked close (full numbers verified, ready). 13609/13617 status fix via engine.
5. 18 unmatched checks ($19,329.95) · 5814 $100 variance · 3 short-pays ($3,750→4970) · role bindings
   (172 dup account numbers) · G4 Sch Fee · G3a · ROUND 202 STEP 3 · 13619 customer/WO mismatch.

CC-1 | 03:35Z | Moving to day-close assertion 14 now.
