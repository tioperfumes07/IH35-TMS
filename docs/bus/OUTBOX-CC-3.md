# ★ OUTBOX-CC-3 · LIVE TOP · 2026-09-01 bus diet

FORCE NOW | READ INBOX-CC-3 | NOW=COL-02 → COL-03 → CTL-01/02/03 Live FAIL | Recipe C | isolated worktree | GO

Seat replies BELOW this line only (one-liners).

CC-3 | 2026-09-01 02:13Z | GO-MECH-0901 serial — 4 PRs landed this pass | GO

1. #19101 INSURANCE-POLICY-BILL-PARAM-FIX (was ACCT-F10261, renumbered — collided with an already-merged, unrelated Cursor PR of the same number, caught before push). Merged bc81467ab7.
2. #19102 schema-parity-baseline regen (self-heal, 1 of the 74 verify-static wall names cleared). Merged 5e94f941c7.
3. #19113 UI CONTROL LAW + COLUMN LAW (SORT-01/02, AUTO-FIT, REORDER, FILTER LAW) + button-size sweep — satisfies COL-02/COL-03/FLT-01(size half)/CTL-01-03(initial). Merged b45cac7c1d.
4. #19124 CTL-01 live gap fix — live-Chrome (hard-reload, measured DOM) found CollapsedListFilters.tsx's own Filters toggle was still a raw ad-hoc h-8/text-[12px] button, invisible to verify-ui-control-law.mjs's own ratchet because its regex `[^>]*` broke on the `=>` inside an onClick arrow-function ahead of className. Fixed both the component (now `<Button>`) and the guard regex (tolerates `=>`, narrowed height match to h-6..h-9 so BankingHome's legitimate h-16 dashboard tiles aren't false-flagged). The improved regex surfaced one more real, live offender (CreateWorkOrderModal.tsx's green Save/Create buttons) — fixed in the same commit. Guard 12/12 selftest, ratchet still 0/0. Merged 548d603449.

Also this pass: found + cleaned a stale, uncommitted regression in the shared main checkout (book-load.service.ts field-rename) and recurring core.bare=true corruption (3rd+ occurrence) — see GUARD-WORKORDERS 00:53/01:15/01:20 entries. Discovered the main checkout is ACTIVELY shared in real time with other seats' live git processes (CC-1, Codex push commands observed running concurrently) — root-causing the session's whole corruption pattern; moved all my work to dedicated worktrees per-branch from that point on.

Cross-check: origin/devin/ctl-01-02-03-pass claims "CTL-01/02/03 all PASS at fe=f34f8e1" but that branch's own register CSV still says NOT INDEPENDENTLY VERIFIED and touches none of the files this PR fixes — not a contradiction I'm picking a side on, just noting both exist; my finding is a concrete measured live DOM class, not a guess.

REMAINING (not started, queued per owner's serial order): CUS-01–07 (Customers module — dead stub tabs, false "0.0/100 At Risk" score, hardcoded em-dashes, missing empty states, dual competing tab sets). COL-01 systemwide sortable sweep still PARTIAL (alert boards). FLT-01's "real combo box" (typeahead/keyboard-nav) half still open — only proportion/sizing shipped.

CC-3 | 2026-09-01 02:38Z | GO-MECH-0901 continued -- 2 more PRs (FLT-01 + COL-01) | GO

5. #19133 FLT-01 Profitability FilterBar fix -- CUS-01..07 re-checked first (6 of 7 already fixed
   by another seat's "CUST-01" series -- CUS-03/04/05/06/07 all done; CUS-02 adequately addressed
   with honest empty states; CUS-01, two competing customer pages with almost entirely
   non-overlapping tab sets, flagged as a structural product decision, not touched). Then found +
   fixed FilterBar.tsx's Equipment filter (raw select -> SelectCombobox drop-in) and its Export
   button (ad-hoc min-h-11 -> shared Button). Merged a96860e731.
6. #19146 COL-01 alert-board location sort -- live Chrome (At-Risk/Late Queue) found 3 of 7 column
   headers had no sort control at all; traced Delivery/Risk-state/ETA-signal: Delivery maps to a
   real plain DB column (delivery_city/next_stop_city/stop_city per board) with NO sort key wired
   anywhere; Risk-state/ETA-signal (and Detention's billable_minutes/live_accrued_amount_cents/
   operational_state/billing_state) are computed in JS after the query runs, no backing column to
   sort by -- documented as a separate, larger, financial-adjacent gap, not fixed here. Added
   "location" to the shared dispatchAlertOrderBy sort enum across all 3 alert boards (At-Risk,
   Late Arrivals, Detention) + hardened the helper with a safe event_at fallback (a route missing
   a requested key used to silently emit "undefined ASC NULLS LAST" SQL). New unit test (4/4).
   Merged bfe380f698.

Both gate-clean (money-pr-local-gate PASS), tsc clean both apps, existing test suites unaffected
(1 pre-existing, unrelated DetentionBoardPage.test.tsx failure confirmed via git-stash before/after
comparison, not caused by this change). Live-Chrome re-verification of both fixes' actual rendered
effect is owed post-deploy for each -- FLT-01 not yet re-walked live after its own deploy; COL-01
walked live BEFORE the fix (that's how the gap was found), not yet re-walked after.
