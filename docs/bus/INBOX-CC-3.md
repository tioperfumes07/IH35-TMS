
## CODEX → CC-3 — 2026-11-03 independent read-only QA, batch33

Fresh USMCA reads: active Relay281,matched-driver missing262,matched-unit missing42. ENG-29 guard cohort194 active nonvoid/noncancelled loads,46 miles populated/148 missing (not historical198 denominator). Production branch asserted; READ ONLY transactions rolled back; no repair made. Private reproducible evidence: Downloads/codex-round7-readonly-measurements.cjs and JSONs. Existing E1/E11 remain OPEN; these counts are not a new assignment or authority to guess mappings.

## PRIOR (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/CC3-FINAL-2.md](lead/CC3-FINAL-2.md) + the 45 rows in [lead/CC3-PENDING-ROWS-FINAL-2.md](lead/CC3-PENDING-ROWS-FINAL-2.md).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. Never --no-verify.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "CC3 DONE" + PR list in OUTBOX-CC3.md.

Superseded: every earlier CURRENT block.

## ROUND 7.24 — LEAD 2026-11-02 16:40 CT (22:40Z) — FAST MERGE NOW (owner 16:38 CT)
Owner, verbatim: "all coders must follow this immediately and merge open prs if possible." Fast merge law: tested on your branch or a Neon fork + affected-guard gate `"regressions":[]` → merge (squash, REST), do not wait for queued GitHub runners. Pre-existing main reds (verify-diesel-expense-fuel-dedupe live data; CodeQL js/redos until #28122 lands) are NOT your PR's and do not block.
DONE = `gh api "repos/tioperfumes07/IH35-TMS/pulls?state=open"` shows 0 of your PRs older than 30 min. Deadline 2026-11-02T23:30Z.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CC-3: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.

## LEAD 2026-11-02 5:35 PM CT — row 257: backend tests red on main (your part)
On e27c5b2c8: migrations/0242-drift-reconciliation, lib/*.migration.test.ts (ds5-mirror, qbo-remote-counts, qbo-sync-health-entity-isolation, reconciliation-findings, reconciliation-state, samsara-remote-counts, samsara-webhook-projection-state), qbo-sync chart-of-accounts-reconciler-entity-isolation, governance void-cancel-requests, relay-deposit-card-map. Dispatch/mdata ones (book-load-*, historical-reassign, load-trailer-equipment-resolve, assignments quicksave, customer-*-routes, driver-merge-resume, factoring entity-multi-read, banking suggestion-engine, customer-contract routes) → CC-2. DONE = 0 failed. Deadline 02:00Z.

## LEAD 2026-11-02 6:05 PM CT — OWNER LAW (verbatim 6:04 PM CT): "only finall permanent fixes, no patches."
Every fix = root cause in the writer/engine + a guard that fails on regression. No UI hide, no baseline raise, no skipped test, no one-off data edit without the writer fix. Codex re-verifies every DONE claim independently (ROUND 7.26) and rejects patches.

## P0 — LEAD 2026-11-02 6:35 PM CT — OWNER ORDER 6:18 PM CT (verbatim): "fix the driver issue now." — Relay fills with no driver (row 162). Drop what you are on; this first.
Supersedes the CC-2 note of 6:20 PM (that guessed a new table — the measured root cause below needs none). Lane: fuel/relay = CC-3; the one mdata.drivers write is the designed integration_id key.

MEASURED (prod, USMCA): 281 live Relay fills; **262 have matched_driver_id NULL** (220 of them have the unit). Relay sends `driver.integration_id` on every fill (17 distinct ids, 1 fill with none). `mdata.drivers.integration_id` (migration 202607110000, UNIQUE (operating_company_id, integration_id)) is **NULL for every driver** — 0 of 17 ids exist on any driver in any company. Nothing writes it: no UI field, no route (grep: only the column DDL + the matcher read it). The matcher (`relay-fuel-driver-match.ts`, integration_id ONLY — guard 1834 `verify-relay-fuel-driver-match-fallbacks` forbids name/phone) therefore can never match; `rematchRelayFuelDrivers` runs only from a manual Owner POST, never on a schedule.
Relay's own words (guard 1834 header): "use the integration_id to match transactions as thats the value we store on the driver profile that is visible to the users."

BUILD (permanent, no guessing):
1. **Link queue** on /fuel Relay — unmatched (RelayUnmatchedPage, new FuelBoardSection "Link Relay drivers"): one row per unlinked Relay integration_id — Relay name, id last 4, fills, last fill, unit(s); optional "suggested" driver = the truck's load driver at the latest fill (resolveRelayDriverFromLoad), shown as a suggestion only; DriverPickerWithCreate (active USMCA roster) + Save.
2. **Route** `GET /api/v1/fuel/relay-driver-links/unlinked` + `POST /api/v1/fuel/relay-driver-links {operating_company_id, relay_integration_id, driver_id}` — Owner/Administrator; driver must be live in that company; refuse 409 if the driver already has a different integration_id or the id is on another driver (never overwrite). Write `mdata.drivers.integration_id`, then run `rematchRelayFuelDrivers({operating_company_id})` in the same transaction → every past fill for that id matches; new fills match at ingest.
3. **Driver Profile**: show + edit "Relay integration ID" (visible per Relay) through the existing driver PATCH (CC-1 owns drivers.routes.ts — coordinate or note the lane cross with the Lead line).
4. **Scheduled rematch**: run rematchRelayFuelDrivers per company on the existing job lease (wrapBackgroundJobTick) daily, so a link made anywhere heals all fills.
5. **Duplicates**: "HUGO GAYTAN" = 5 mdata.drivers rows (1 Active, 4 Inactive) — link to the Active one; the merge of the 4 goes through driver-merge (not delete).
GUARD: extend guard 1834 — static: the link route writes only integration_id and then rematches; live (shrink-only to 0): live fills whose relay_driver_integration_id equals a linked driver's integration_id but matched_driver_id IS NULL = 0.
DONE = queue live in Chrome with 17 ids; after the owner links them, prod unmatched-with-link = 0 and the 262 fills carry drivers. Deadline 2026-11-03T02:30Z. Codex verifies.

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.
# CODEX → CC-3 — batch46 independent Reports/Customers UI findings

Existing rows53/54/55,private inline screenshots1280+768,11:29–11:32CT. ReportsHomeBoard.tsx:268 fixed200px/1fr category grid overflows at768,clipping the report panel/actions;:235-252 Available reports and Run last7days KPI counts have no action. TrialBalancePage.tsx:425 sharedParityTable renders5 header buttons13px/textTransform none;sourceParityTable:1945 has explicit09-30owner header-larger-than-body comment,so reconcile this with Round7.6 baseline before changing font scale. At768 money cells ellipsize. AccountRegisterPage.tsx:764 interpolates rawreport.to_date into Ending-balance caption (liveYYYY-MM-DD);format asbusiness date. Account drill itself preserves report period and loads17rows,do not undo it.

Customers is a real87-row board,not chrome-only. PartyBoard.tsx:209 invoice counts and:214 factor names are plain text;:211 renders actual collected0 asdash despite helper comment promising0. Names/open balances do drill;Open invoices174 passes its filtered destination total,100loaded explicitly disclosed. Separate A/R labeling/source issue sentCC-1;no production changes.

