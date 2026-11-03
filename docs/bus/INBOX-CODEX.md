> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming this inbox — verify-honest-built-launch-law-present.)


---

## ROUND 7.29 — LEAD → CODEX — 2026-11-03 3:45 PM CT (21:45Z)

1. Re-verify Lead PRs #28444 (E9 fill engine), #28450 (E11 odometer history), #28457 (ENG-65 Relay records at receipt), #28463 (E9 keyset queue — your batch74 finding; prod list query now returns 8, was 598). Verdict per PR in OUTBOX: CONFIRMED / PATCH-REJECTED with the counterexample.
2. Tomorrow 06:00–06:30 CT, live prod: background_jobs fuel.relay_fill_records + fuel.follows_truck — expect 39 Relay fills recorded+linked and 9 named refusals (7 relay_fill_driver_unknown, 1 unit, 1 repeated DEF); expect 2 fills moved 13698→13700 and 6 in place, 590 person-confirmed untouched. Paste the real numbers.
3. E11 hourly: loads with miles_driven_actual 79 of 194 at 21:40Z (was 46) — re-measure after 22:25Z and 23:25Z ticks.
4. E13 #28452: you rejected the seed (A→B→A). CC-2 owns the fix (deadline 23:00Z) — verify their rewrite on an isolated DB with your probe.

---

## ROUND 7.26 — LEAD → CODEX — 2026-11-02 6:05 PM CT (00:05Z) — independent verification + H/B live measurement

**OWNER LAW (6:04 PM CT, verbatim): "only finall permanent fixes, no patches."** Every fix = root cause in the writer/engine + a guard that fails if it regresses. A UI hide, a baseline raise, a skipped test, a one-off data update with no writer fix = a patch → REJECT it and say so in your OUTBOX.

Source list: `docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md` (262 numbered; 28 DONE-LIVE, 234 pending). You are the independent reviewer: verify from the live app / prod, never from the author's PR text.

### Part 1 — re-verify today's DONE-LIVE claims (Lead's included). Deadline 01:30Z.
| # | Claim | How to verify (yours, independently) |
|---|---|---|
| 40 | Transaction Health JE link shows a label, not a uuid (#28187) | /system?tab=tx-health → every "Journal entry — …" line has 0 uuid patterns; "Load more" pages past 100 |
| 41 | /insurance/lawsuits → /legal/lawsuits | open the URL; lands on Legal › Lawsuits |
| 209 / 211 | Maintenance money shows cents; every Active WOs header sorts | /maintenance, /maintenance/active-wos — click Load, Driver, Vendor, Bill, JE, Timing headers; order changes |
| 259 | Maintenance fleet health has no SAM- phantoms (#28191) | /maintenance → "All 39", 0 rows matching SAM- |
| 170 | Open invoices = A/R | Accounting home Open invoices tile = GL 1100 balance (prod: $621,076.72) |
| 185 | Settlements Drivers tab stays in module | /driver-finance/settlements → Drivers → /driver-finance/drivers |
| 173 | Cash Flow Actual vs Projected renders | /cash-flow?tab=actual_vs_projected |
| 147 | Telematics deadlocks stopped | Render backend logs "deadlock detected" after 22:07Z = 0 |
For each: PASS + screenshot / FAIL + what you saw. A FAIL reopens the row.

### Part 2 — H rows (75 screen label/data defects) and B rows (33 board verdicts). Deadline 02:00Z for first 40, rolling after.
For each H/B row: open the named screen live at 1280 and 768 px, record PRESENT/FIXED with screenshot. For PRESENT: the exact text/element, the file that renders it, the rule it breaks, the required value, the guard that must catch it. Write the result line under the row number in your OUTBOX; the Lead routes builds to the owning seat (LANES.md).

### Part 3 — guard on the coders' rows 257 (46 red backend tests), 258 (9 Samsara phantom units), 260 (Edison range geocode, $14,700), 261 (cash flow $0 projected expenses), ENG-64, ENG-65
When a seat claims DONE: re-run the measurement in the row text yourself; reject any patch per the owner law above.

DONE = OUTBOX-CODEX lists Part 1 (8 verdicts) + ≥40 H/B rows measured, each with screenshot path.

---

## ROUND 7.27 — LEAD → CODEX — 2026-11-02 6:45 PM CT (00:45Z) — FULL AUDIT OF ALL WORK, CLOSE EVERY LINE (owner 6:29 PM CT: "continue with codex full audit of all work so we can close all lines now.")
Scope = EVERY row in `docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md` (1–263), plus everything merged 11-02 (gh pr list --state merged --search "merged:>=2026-11-02").
Owner ruling 6:29 PM CT: bank lines categorized/matched by Martin (mcastillo@tioperfumes.com, 68 lines 10-08…10-13) are correct — not a defect.
For each row, one line in OUTBOX-CODEX (re-measurable):
`#<row> · VERDICT (DONE-LIVE | OPEN | PATCH-REJECTED | DUPLICATE-OF #n) · what you measured (screen / prod query / guard output, with the number) · screenshot path · owner seat if OPEN`.
Rules: verify from the live app / prod / guard output — never from PR text. A DONE claim without a re-measurable proof line = OPEN. A fix that hides a symptom (UI hide, baseline raise, skipped test, data edit without the writer fix) = PATCH-REJECTED. Any row you prove DONE-LIVE, write the proof so the Lead flips it.
Order: (1) the 35 rows already marked DONE-LIVE (re-verify; any FAIL reopens); (2) A, ENG, E, F, G (money/engine first); (3) B and H (screens, 1280 + 768 px); (4) C.
Pace: post results in batches of ≥20 rows; first batch by 01:45Z; all 263 by 06:00Z. Rows needing an owner decision → list them separately as OWNER-DECISION with the exact question.

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.

## LEAD 11-03 11:55 AM CT — OWNER ORDER (verbatim, 11:46 CT): "continue coding and fixing all the issues from the audits, and have codex also fix also all of you and all coders"
From now Codex FIXES what it finds in SHARED surfaces (apps/frontend/**, docs/**), one PR per item, normal hooks, fast merge, then a second Codex batch re-verifies. Lane-owned backend/guard files: keep posting to the owning seat. Your fix list (all from your own batches, all frontend = SHARED):
1. Row 56 Vendors (batch43): 768px heading overlaps segmented filters; payment-account names truncate; pays-through vendor counts + per-vendor account labels are plain spans → link them. VendorsHomeBoard.tsx:108,114,158-164,188-193. DONE = 768/1280 screenshots, each count opens its filtered list.
2. Row 53 Reports Home (batch46): at 768 the fixed 200px sidebar + 1fr grid clips the financial panel; 2 KPI counts have no drill-through.
3. Row 27 Account Register (batch46): ending-balance caption ISO date splits across lines at 768 — AccountRegisterPage.tsx:764; house date format.
4. Row 55 Customers (batch46): collected 0 row renders "—" while the KPI renders a real 0 — PartyBoard.tsx:209-214 (zero is a claim only when measured; this one is measured).
5. Rows 23/40 System module entity filter (batch42): empty state renders all checked; clicking one checkbox isolates instead of excluding — SystemModulePage.tsx:669-670/715 (#28328 fixed the subset/none path; verify this first-click path, add the interaction test).
6. #28297 (batch38): CalculatorPage:94/103, LoanWizardPage:174/187, FinanceScenariosPage:217/229 check disabled-feature before missing-company → add the no-company branch first + render tests.
Each PR: before/after measurement in the body, owning row number, screen named. Re-verify in your next batch.

## LEAD 11-03 12:45 PM CT — fix list items 3 + 4 DONE by Lead (do not duplicate); re-verify them live
- Item 3 Account Register caption → #28386 (ACCT-F11036): "Ending balance · book · as of" uses formatDateUS.
- Item 4 Customers collected zero → #28388 (ACCT-F11037): collected cell renders money(collected_cents), $0.00 not "—".
- Also live-verify after deploy: #28371 + #28379 (Maintenance arrivals: Issues, PM with Checking/unavailable states, Schedule WO), #28377 (vehicle profile Create WO → /maintenance?create_wo=1&unit_id=).
Your items 1, 2, 5, 6 stay yours.
