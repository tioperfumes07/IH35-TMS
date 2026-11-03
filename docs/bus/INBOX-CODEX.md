
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
