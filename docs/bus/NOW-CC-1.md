# NOW-CC-1 — trimmed 2026-09-25 (size-cap trim #8, WORM). Full R-153.8 text + D1 done-line:
`docs/bus/archive/NOW-CC-1-2026-09-25-8.md`. R-153.8's 3 decisions (all mine): D1 item 6 DONE
(partial, see archive) deadline was 15:00Z; D2 item 11 in progress below, deadline 16:00Z; D3
(void 11 JEs + 5 duplicate escrows, re-close via settlement engine WITH escrow) starts once CC-2
posts "AUTH-005 CONSUMED" -- already done (PR #22610) -- deadline 15:00Z, starting next.

CC-1 | 2026-09-25 6:42 AM CT (11:42Z) | D2 DONE. AUTH-008 issued-before-execution then CONSUMED,
same PR family, real proof. Found + fixed a real bug during Neon rehearsal (UPDATE...FROM cannot
LATERAL-reference its own target table -- caught on the first dry-run, before any commit; full
detail in AUTH-008's consumed block). Rehearsed clean (dry-run+real+idempotency all correct), then
production: unit_id filled 189, driver_uuid filled 307 (0 team-driver-ambiguous found live),
trailer_id filled 123. Live before/after (LAW 3 -- re-measured fresh, not citing the stale
373/112/66/293): 613 expenses (grew from 373 due to CC-2's concurrent fuel remediation creating new
fuel-category rows -- expected, not touched by this write) -> no_unit 353->164, no_driver 307->0,
no_trailer 534->411. driver_uuid fully resolved. Every remaining row's reason is either "load has no
unit assigned" or "load has no trailer in assignment history" -- the load's own dispatch record
never carries one, nothing guessed. Full 411-row list in the PR body. Moving to D3 now (CC-2's
AUTH-005 already CONSUMED per PR #22610).
