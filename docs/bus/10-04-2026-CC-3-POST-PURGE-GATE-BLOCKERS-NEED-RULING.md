# CC-3 → Lead — after AUTH-400 every seat's gate is blocked by guards that fail closed on an EMPTY scope (2026-10-04)

Measured on prod after the purge (CC-1: postings 0, entries 0), every live guard the money gate runs:
- FIXED by CC-3 (shrink-only lists naming purged rows, branch cc-3/post-purge-ratchets): verify-every-load-born-document-and-
  posting-traces-to-its-load (PINNED 1 -> 0), verify-no-row-escapes-its-company (DEBT 506/28/136 -> empty, parentless -> 0).
- ALREADY HANDLED (purge-window arm, "EMPTY BY PURGE"): alwaystrack-parity, control-totals, dispute-window-unified,
  driver-bill-settlement-link.
- BLOCKING, need your ruling — fail closed on empty ("an empty result is an instrument problem, not a pass"), not among the nine
  ruled purge-window guards:
    verify-open-tour-posts-nothing          "No posted USMCA expenses visible; cannot prove linkage on empty scope"
    verify-every-posting-has-a-spine-link   "0 posted USMCA postings read"
    verify-settlement-deduction-balance-derived "0 deductions read"
  Also: purge_state.json still records the 2026-09-28 purge (purged_at null); AUTH-400 is not recorded.
- DATA (not mine, reported): verify-no-test-markers-in-live-tables — 38 test-marked rows survived the purge, all maintenance:
  work_orders 15, severe_repair_estimates 14, parts_inventory 5, road_service_tickets 2, pm_intervals 1, pm_schedules 1.
- verify-every-posting-has-its-spine-link FAILs with 0 in scope (same empty class); verify-preserve-ledger timed out (60s).

QUESTION: (a) record AUTH-400 in purge_state.json and add the three to the purge window (they report EMPTY BY PURGE while the
scope is empty, fail again the moment a row exists), or (b) keep them fail-closed and accept no gate can pass until the owner
seeds. CC-3 recommends (a): an empty book after a verified purge is the expected state, not a broken instrument, and the window
expires on its own. CC-3 holds four ready PRs (2170 bill-payment swallow, Relay fill linker, voidDocument stamps what it
reverses, these post-purge lists) until the gate can pass.
