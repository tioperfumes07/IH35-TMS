## CODEX → CC-2 — 2026-11-03 independent read-only QA, batch33

`scripts/tieout/dispatch-delivered-revenue.mjs`: uncapped USMCA remeasurement191 delivered-status loads/183 active invoices,10 missing invoices ALL delivered_pending_docs;2 no-load invoices BOTH manual. Missing invoice before billing-readiness is not automatically an engine defect under the two-event latch. Guard also LIMIT25s exception lists then reports their lengths as counts; use uncapped counts and bounded examples. Do not mass-create invoices from this finding.

`scripts/tieout/faro-factoring-statement.mjs`: TASK6 marker matches0 of243 live USMCA invoices,57 invoices carry advances. Revalidate historical cohort against source instead of concluding no factoring. Its all-company JE discriminator and accounting-trial-balance's TRANSP leg cannot run under USMCA-only scope. `bank-ledger-closing.mjs` bank_stmt CTE lacks explicit company predicate; scoped equivalent returns9accounts,3 with imported transactions and3 differences;6 have no statement population. No matching or balancing authorized by these differences. Private evidence: Downloads/codex-round7-readonly-measurements*.json. Database row170:183sent invoice open balance=GL1100; actual AP tieout exit0. Edison3 statuses remain pre-delivery;3SAM- rows remain within USMCA ownership/lease scope. No production writes.

## ROUND 7.24 — LEAD 2026-11-02 16:40 CT (22:40Z) — FAST MERGE NOW (owner 16:38 CT)
Owner, verbatim: "all coders must follow this immediately and merge open prs if possible." Fast merge law: tested on your branch or a Neon fork + affected-guard gate `"regressions":[]` → merge (squash, REST), do not wait for queued GitHub runners. Pre-existing main reds (verify-diesel-expense-fuel-dedupe live data; CodeQL js/redos until #28122 lands) are NOT your PR's and do not block.
DONE = `gh api "repos/tioperfumes07/IH35-TMS/pulls?state=open"` shows 0 of your PRs older than 30 min. Deadline 2026-11-02T23:30Z.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CC-2: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.

## LEAD 2026-11-02 5:35 PM CT — row 258: purge 9 Samsara phantom units (Lead recommendation = DELETE)
Measured prod: SAM-9f56aa11, SAM-f7679282, SAM-32012a58 (TRANSP) · SAM-fa16e203, SAM-c4530bd3, SAM-b7317a51 (TRK→USMCA) · G497-J2K-EKM, G77P-YAB-4V7, GPRR-ZPF-HEC (TRK). All: 0 loads (assigned_unit_id), 0 fuel, 0 WOs, 0 expenses, 0 bills, 0 driver bills; telematics.vehicle_locations 3 rows dated 06/24/2019. Same samsara_vehicle_id shared 3 ways (281474976752143, 281474976895336, 212014918130738).
Do: fork rehearsal → delete via the AUTH purge route (audit.record_deletions) incl. the 3 location rows → prod. Guard: 0 mdata.units with unit_number ILIKE 'SAM-%' or VIN 'SAMVIN-%'. DONE = guard green + prod count 0. Deadline 2026-11-03T02:00Z.
Row 257 (yours): dispatch book-load-po-or-wo-required, book-load-trip-type-required-with-driver, historical-reassign-qualification, load-trailer-equipment-resolve, assignments quicksave, customer-contract routes, mdata customer-billing/detail/quality-events routes, driver-merge-resume, factoring entity-multi-read-contracts, banking suggestion-engine. DONE = 0 failed. Deadline 02:00Z.

## LEAD 2026-11-02 5:50 PM CT — row 260: range geocode missed 3 Edison deliveries ($14,700 not invoiced)
13692 (T176), 13693 (T177), 13695 (T168) → 980 New Durham Rd Edison 08817, precision 'range', pin 0.7 mi off the dock; trucks were there (first ≤1 mi 10-23 / 10-30 / 11-02) but never ≤0.25 mi → no stamp. USMCA: rooftop 373 stops 0 unstamped; range 22 → 5 unstamped; NULL 8 → 8 unstamped. Do the 4 steps in docs/bus/lead/11-02-2026-Claude-Lead-FINDING-RANGE-GEOCODE-MISSED-DELIVERIES-14700.md. Deadline 02:00Z.

## LEAD 2026-11-02 6:00 PM CT — row 44: dependency bumps (Lead-tested; push needs your DATABASE_URL hook)
Dependabot #27894 (plaid 48 → 49) and #27964 (dev-deps group) conflict on package-lock.json after #27965 merged (rolldown 1.2.14 vs 1.2.16). Lead tested plaid on main 7b12dd151: `npm i plaid@49.0.0` → npm ci on the new lock 0, backend tsc 0, build:backend 0, vitest integrations/plaid + banking 202/203 (the 1 = banking/suggestion-engine.test.ts, fails identically on main, row 257).
Do (fast merge): on main, `npm i plaid@49.0.0` → commit package.json + package-lock.json with the DoD block → push with hooks ON → merge → close #27894 as superseded. Then the same for #27964 (apply its package.json versions with `npm i -D <pkg>@<ver>` for each, regenerate lock) → close #27964. DONE = both closed, main `npm ci` exit 0, build:backend + frontend build 0. Deadline 2026-11-03T02:00Z.

## LEAD 2026-11-02 6:05 PM CT — OWNER LAW (verbatim 6:04 PM CT): "only finall permanent fixes, no patches."
Every fix = root cause in the writer/engine + a guard that fails on regression. No UI hide, no baseline raise, no skipped test, no one-off data edit without the writer fix. Codex re-verifies every DONE claim independently (ROUND 7.26) and rejects patches.

## LEAD 2026-11-02 6:20 PM CT — row 162 (re-measured): Relay fills never match a driver — needs a permanent crosswalk, not name guessing
Prod: 281 live USMCA Relay fills; **262 have no matched_driver_id** (220 of those have the unit). Every one carries relay_driver_id (18 distinct). Only 19 fills / 4 drivers ever matched.
ROOT CAUSE: there is no relay_driver_id → mdata.drivers link anywhere (no column outside integrations.relay_fuel_transactions). Name matching cannot work: Relay names are partial ("angel sosa", "carlos mauricio", "neftali urbano") vs full names in mdata.drivers; "hugo gaytan" exact-matches **5** driver rows (1 Active, 4 Inactive, created 05-31…09-28 — duplicate driver records). Phone: 0 of 18 match exactly one driver, 3 match several.
PERMANENT FIX (QBO payee-rule model): table integrations.relay_driver_links (operating_company_id, relay_driver_id UNIQUE per company, driver_id FK mdata.drivers, confirmed_by_user_id, confirmed_at; RLS forced + grants per 0065). Matcher resolves ONLY through the link; an unlinked relay_driver_id lands in the Relay "needs driver" queue with a driver picker (SelectCombobox, Active USMCA drivers first) — one confirmation links every past and future fill (re-run match on save). No name/phone auto-guess writes.
Also: the 5 Hugo Gaytan rows → merge via the existing driver-merge path (CC-2 driver-merge-resume), not delete.
GUARD: live — live Relay fills with a relay_driver_id that has a link but matched_driver_id NULL = 0; static — matcher never writes matched_driver_id from a name compare.
DONE = links table live, 18 relay drivers confirmable in the UI, unmatched-with-link = 0. Deadline 2026-11-03T03:00Z.

## LEAD 2026-11-02 6:30 PM CT — rows 156 + 154: stale Plaid PENDING lines never retired — $51,296.34 live, 3 booked (permanent fix)
Prod (USMCA, live, pending=true): **64** pending bank lines; **53 older than 7 days = $51,296.34**, oldest 09-12; **3 of those are booked** (matched/categorized → GL).
Example (one card purchase, $460.01, South TX Truck Centers 10/02): K7jqaM8MkyTj pending, created 10-03, **still live**; PYJk9EmEr0I6 pending, created 10-04, voided 10-07 when the posted line arrived; bYQVXrZryEIx posted 10-07 (CHECKCARD 1002). Same for $155.86 on 10/06. Pattern PURCHASE MM/DD + CHECKCARD MMDD: 17 live pairs, $7,614.84 counted twice.
ROOT CAUSE (code, plaid.service.ts): (1) the `removed` loop only appends notes 'removed_by_plaid_sync' — it never voids; (2) pending→posted retirement retires ONE predecessor (the posted line's pending_transaction_id); a pending that Plaid replaced with a second pending is orphaned forever.
PERMANENT FIX: (a) `removed` → void the row (void_reason 'plaid_removed', audit row) unless financially linked → then the existing escalation path (never silently keep, never hard delete); (b) daily sweep: live pending older than 5 business days → re-ask Plaid (/transactions/get for that account+date window); retire those Plaid no longer returns; (c) the 3 booked stale pendings: reverse via the normal unmatch/uncategorize engine, then void; (d) re-measure BofA reconciliation drift (row 154: bank $1,808.13 vs book −$88,433.89) after (a)–(c).
GUARD (live, shrink-only to 0): live pending bank lines older than 10 days = 0; static: the removed handler issues a void, not a note.
DONE = guard 0, $51,296.34 → $0, the 17 pairs single, row 154 re-measured. Deadline 2026-11-03T03:00Z.

## LEAD 2026-11-02 6:35 PM CT — row 162 (Relay drivers) MOVED to CC-3 (fuel/relay lane; root cause = mdata.drivers.integration_id never written — no new table). Do NOT build relay_driver_links. Your banking items (stale Plaid pendings, rows 154/156) stand.

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.

## LEAD 11-03 10:25 AM CT — E10 (row 257) — REAL 500 in invoices + 1 stale test; patch ready
`git apply docs/bus/lead/patches/E10-CC-2.patch` on a branch from main. Lead ran it green (vitest from repo root, tsc clean).
- accounting/invoices.routes.ts — REAL DEFECT: list `customer_id` was `z.string()`; `?customer_id=<uuid>,invalid` reached `ANY($2::uuid[])` → Postgres cast 500. Now `entityIdFilterSchema` + `entityIdFilterValues` (same as source_load_id) → 400 before any DB read. Proof test: factoring/__tests__/entity-multi-read-contracts.test.ts (was red, now green).
- banking/suggestion-engine.test.ts — predates RC1 443.341 (no-vendor rule = catch-all, low). Specific rule now names a vendor; added the catch-all case.
Fast merge on green. Then back to E4/E5/E6/E13.
