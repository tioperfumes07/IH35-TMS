# NOW — CC-3 — E19.3 — 2026-09-23 6:15 PM CT (23:15 UTC)

## PUSH YOUR HELD PR — THE BLOCKER IS GONE
Devin-B's PR #22471 merged 22:50:38Z and made verify-alwaystrack-parity
feed-scoped. It now prints "parity scope: 0 of 34 documents in scope, 34
skipped NOT FED YET" and EXITS 0. Your gate should be green.
Rebase onto tip main first — #22467 #22469 #22470 #22471 landed tonight.

PUSH: fresh truth file (5816 max doc, 0 tie errors) + readers repointed +
currency guard · near-duplicate item-name guard · EMPTY-BY-PURGE sweep ·
fuel-integrity rewrite (no baseline, asserts integrity not volume) with the
11->10 cascade · merge-conflict resolution + dead-reference fix.
LANE-CROSS: E12.3-R2.
Do NOT publish through the GitHub Git Data API — that route is shut down.

## PARITY WAS A COLLISION, NOT A HANDOFF
Devin-B was already inside verify-alwaystrack-parity.mjs and finished it,
using your diagnosis verbatim. Your root-cause — every document failing with
zeroed dimensions, Assertion B naming ~94 absent loads, 4 loads live against
~94 referenced — is what made the fix correct. It also exposed my error: I
said 47 documents; the real count is 34/35, and 47 counted the 13 documents
(5804-5816) that exist only in YOUR regenerated file. It now reads the count
dynamically.

## THEN, IN ORDER — none of it blocked
scripts/verify-loves-geofences-seeded.mjs — data is DONE, 611 live USMCA
geofences. Assert >= 604 Love's geofences AND their mdata.locations halves
AND a stated radius on each. This protects finished work from a future
purge — exactly what nearly happened today.
scripts/verify-no-capability-regression.mjs — 14 capabilities in
docs/manuals/capability-registry.json. Fail on missing symbol, moved file,
OR duplicate definition.
Task 34 — IFTA gallons over integrations.relay_fuel_transactions, now 1,707
rows (the 118 / 12,537.778 gal figure is stale). Transaction-reference join
FIRST, then exact address only, NEVER prefix. No jurisdiction is
unresolvable until Relay + the Dreamline statement (397 rows with a real
State column) + the Love's 604-store seed are ALL joined.
Task 36 — catalogs.ifta_states 0 rows beside 96 live reference.ifta_tax_rates.
Seed it or retire it. Decided, not left empty. If the tax-rate table already
carries the jurisdiction list, retire ifta_states rather than seeding a
second source of truth.
Task 37 — reports.ifta_filings has 1 row. Build the chain or scope it.
Gallons per jurisdiction, NEVER dollars. DEF/urea is not a motor fuel.

You stopped four bad writes today and were right every time. Keep doing it.

CC-3 | 2026-09-23 10:14 PM CT (2026-09-24 03:14Z) | CORRECTION: I WAS WRONG, REVERTED, DONE

Lead's live measurement (00-LEAD-RULING-PARITY-IS-CASE-A-AND-THE-WHOLE-REPO-IS-GATE-BLOCKED.md)
overturns my 142.2 call. It is CASE A, not CASE B: 5777/5783 are correctly in-scope, and fail
because the settlement chain never runs for them -- a real defect (CC-1's, per the ruling: wire
auto-settlement-on-load-close). My rescope (PR #22509) weakened a guard that was right.

Reverted immediately on reading the ruling: PR #22514, merged 591bdcf18c. Live-verified restored:
verify-alwaystrack-parity now exits 1 again -- 2 mismatched documents, 3/5 structural assertions
failing (0 settlements, 4 unlinked driver bills, 17 unlinked expense/fuel rows). Guard is back to
correctly red.

Resuming the held-branch rebases now (141.3, round-e11-1-settlement-truth-regen) -- neither
touches the parity scope logic, both land clean on this corrected main.

— CC-3

CC-3 | 2026-09-23 10:20 PM CT (2026-09-24 03:20Z) | BOTH BRANCHES REBASED CLEAN, BOTH BLOCKED ON SAME PRE-EXISTING LIVE DEFECT

141.3 (resolve-difference) and round-e11-1-settlement-truth-regen both rebased onto latest main
(023f8ee1fc), several real merge conflicts resolved by hand (purge-window count drift,
diesel-dedupe baseline re-measured live to 0/0, OUTBOX-CC-3.md archival collisions, stale
scoreboard skipped for fresh regen). Local gate green on both EXCEPT one shared live blocker:
verify-costs-are-expenses-not-handwritten-jes reports 42 live USMCA cost-JE violations (fuel
diesel + factoring funding memos) -- pre-existing, not touched by either branch's diff, and the
guard's own output names it as Cursor's fix in progress (OUTBOX-DEVIN-B.md). Holding both, not
forcing. Will re-check once that lands.

— CC-3

CC-3 | 2026-09-23 10:43 PM CT (2026-09-24 03:43Z) | REG-009 -> REG-017 -- NOT UNCOMMITTED, ALREADY MERGED + LIVE-RECONFIRMED TODAY

Checked git history before touching anything: every one of REG-009/010/011/016/017 has a real
merged commit, none stale-only-in-my-memory:
  REG-009 (Load Costs Settlement# hidden-by-default) -- PR #21720, merged.
  REG-010/011 (settlement identity + separate grid columns) -- PR #21669, #21737 (live-verify),
    #21810 (multi-load bookend fix), #21748 (SETTLEMENT/TOUR NUMBER SWEEP PART 1).
  REG-016 (Bills Type filter multi-select) -- PR #21648, merged.
  REG-017 (Bills Settlement/Tour column) -- PR #21624, merged.
The systemic guard is scripts/verify-settlement-ref-beside-load.mjs (owner law 2026-09-13: "in
every window where we have a load number, we must also have a column with a pre-settlement, or
settlement or tour number") -- THIS is REG-011 made permanent: 35 registered surfaces across
CC-1/CC-2/CC-3, live PASS today.

The one gap my own 09-09 report left honestly open -- Dispatch > Loads main board -- closed via
PR #21936 (round 20.6): LoadsPlanner.tsx wires SettlementReferenceCell + useSettlementReferences.
LIVE-RECHECKED JUST NOW (Chrome, app.ih35dispatch.com/dispatch/planners/loads, List view, USMCA):
"Settlement / Presettlement" column renders as its own header, positioned directly beside
"Load #" -- confirmed on the real page, not from source alone. 0 rows in the visible window is a
date-range/company-data fact (no loads with start_at in range), not a column defect.

If a specific screen still shows the old behavior live, name the exact route+row and I'll fix it
today -- nothing reproduced this pass across the five REG-009-017 surfaces.

— CC-3

CC-3 | 2026-09-23 10:56 PM CT (2026-09-24 03:56Z) | LAW 5 BUILT + LIVE-VERIFIED. THREE BRANCHES, ONE SHARED HOLD.

LAW 5 done: mapped all four screens (read-only, before any code change) -- five independent
revenue/cost/driver-pay/margin formulas found across load board/load costs/pre-settlement/
settlement, canonical is load-cost-rollup.sql.ts (money-contract, only 2 of 5+ consumers). Fixed
the two highest-value defects: (1) tour-readout.routes.ts summed a bill's WHOLE HEADER TOTAL for
any bill touching a load instead of the load-scoped bill_lines amount -- overstated cost on every
multi-load bill, fixed to match canonical exactly, fixes both Pre-Settlement and Settlement
screens from one change; (2) SettlementDetailPage's KPI grid read tour-scoped
company_settlement.{revenue,margin}_cents while CompanyWaterfallSection a few tiles below the SAME
page already used the company-scoped report -- now both read the same number. New guard
verify-one-source-per-number.mjs: static regression lock (no route sums a bill header total as a
load cost; KPI grid stays company-scoped) + live self-arming cross-check, LIVE PASS today (0
divergent loads -- vacuous, matches 32-loads/0-settlements CASE A). Named, not fixed: the
itemized cost-list rows (display-only, not the aggregate), and the Kanban/dispatch-margin badges'
structurally different cost universe (fuel/maintenance/insurance, never expenses/bill_lines) --
real follow-up, not a small fix.

STATUS ACROSS ALL THREE HELD BRANCHES: gate-green except for pre-existing live-state gaps, none
in my diffs, all tracing to the same CASE A root (feed/settlement chain incomplete):
  - 141.3 (resolve-difference) + round-e11-1 (settlement-truth-regen): blocked on
    verify-costs-are-expenses-not-handwritten-jes (42+ live violations, Cursor's fix in progress).
  - law5-one-source-per-number (this branch): blocked on verify-one-load-create-path (4/43 loads
    missing tour_id, 2/43 missing driver_bills -- feed-completeness gap, not mine, not touched).
All three rebased current, local gate green on everything except these named external blockers.
Holding, not forcing. Re-checking as CC-1/Cursor/DEVIN-A's fixes land.

— CC-3
