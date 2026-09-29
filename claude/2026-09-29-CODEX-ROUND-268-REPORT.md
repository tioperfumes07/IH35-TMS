CODEX | 2026-09-29 4:29 PM CT | ROUND 268 follow-up to accepted Round 264

## Formula difference — extra pay alone explains 0 of 48

Evidence is the production read at 2026-09-29 4:04:42 PM CT and the individually read PDFs recorded in Round 264. This follow-up adds no production write and does not claim a new transaction snapshot. Reproducible term-by-term attribution is in `docs/evidence/round264/round268-margin-attribution.json`; its companion Python script rereads each source PDF's printed Net Revenue and asserts both formulas.

AlwaysTrack printed formula, tied to the cent for **48/48** PDFs:

`Invoiced − Quick Pay − Driver Salary − Additional Driver Pay − Fuel − Company Expenses`.

App report formula, tied to the cent for **48/48** captured service results:

`customer charges − earnings/team/empty-mile pay − other selected driver-line costs − ALL linked fuel rows − nonvoid Expense documents`.

Source: `apps/backend/src/accounting/company-settlement-report.service.ts`: fuel SELECT near 290 lacks archive/void filtering; Expense SELECT near 335 also includes fuel-backed Expenses; selected driver-line types and net formula near 358–373. Both formulas include extra pay as a cost. The locked extra-pay ruling is correct and is not filed as a defect. Excluding Quick Pay from this report is an intentional code policy; it is separated below from duplicate costs rather than called a new defect.

| Algebraic component | Settlements with nonzero component | Sum of absolute component dollars |
|---|---:|---:|
| Expense report versus PDF Company Expenses | 47 | $177,553.14 |
| Quick Pay not subtracted by app report | 42 | $5,512.71 |
| Fuel report versus PDF Fuel | 37 | $52,417.46 |
| Other driver-line costs versus PDF Additional Driver Pay | 22 | $1,751.26 |
| Revenue difference | 8 | $27,150.00 |
| Base driver cost difference | 1 | $1,727.47 |

These are signed algebraic contributions with absolute totals shown for ranking, NOT independent amounts to sum into another grand variance. Every settlement's signed terms sum exactly to its observed margin difference. Revenue includes the already-declared shared-load exclusions and missing link behavior; it is not eight new transaction findings.

## 5787 reconciled explicitly

The inspected PDF actually prints **$943.53**, not $1,048.53:

`4,180.00 − 30.00 Quick Pay − 1,000.72 salary − 75.00 extra pay − 1,990.55 fuel − 140.20 expenses = 943.53`.

The owner's **$973.53** follows the same arithmetic without Quick Pay. The $1,048.53 reference excludes both Quick Pay and the $75 extra pay. Extra pay must remain a cost.

The captured app report instead calculates:

`4,180.00 − 1,000.72 − 97.00 − 3,318.76 − 2,130.75 = −2,367.23`.

Its $97 includes the $75 extra plus a $22 driver-reimbursed parking expense already included in Company Expenses. Its Expense total also includes $1,990.55 of diesel documents, while its fuel subtotal includes the fuel records plus additional old fuel/DEF rows. Starting from the owner's $973.53: subtract $22.00 reimbursement duplication, $1,328.21 excess fuel subtotal, and $1,990.55 diesel Expenses counted again → **−$2,367.23**. This is not an intentional extra-pay-only difference.

## Driver colors and one source-sign correction

The driver tab now has **47 green / 1 red (5812)** settlement markers, explicitly labeled **NET PAY match (Round 268)**. Gross and deduction observations remain visible; green must not falsely imply those fields were reconciled. All monetary values remain unchanged.

Rereading PDF margin signs found four negative printed margins (5778, 5790, 5793, 5803) that the previous magnitude normalizer had stored positive. The display signs are now corrected; absolute-magnitude comparison and the accepted $96,516.32 magnitude variance are unchanged. The earlier signed-margin aggregate in Round 264 is superseded by the corrected `margin_absolute_signed_variance_cents` in metrics.json. This was a comparator sign-display error, not four new app defects.

## Publication

LANE-CROSS: 2026-09-30-ROUND-268-CODEX-REPORT-LANE-CROSS.md

The ruling records the owner's explicit Round 268 grant. No guard was weakened. Original local commit 6a5a714b34 is preserved through the normal sync/rebase lineage with this follow-up. Gate, push and squash-merge evidence will be reported from actual results. Auto-deploy is OFF: awaiting batch deploy after merge, never claimed live.

CODEX | 2026-09-29 4:34 PM CT | Actual publication result: lane guard PASS (9 changed files; both report paths explicitly authorized). Full money-pr-local-gate exited 1 on verify-open-tour-posts-nothing.mjs. Exact measured output:

```
verify-open-tour-posts-nothing FAIL — 3 expense(s) posted with an open tour, created after this gate landed:
expense 1e24c761-d8bd-40f0-8d31-ff0d37dc6980 (load fa8ac9e9-0b68-4e96-aa6e-f1a64cd2c2f5)
expense 2aa0e584-478e-4d3c-bc7c-65c151d0c3be (load 61b6c87e-778d-4a4f-8600-08bb85884fd2)
expense 2bbc404d-91fe-4151-be83-6f29c7cda3b2 (load fa8ac9e9-0b68-4e96-aa6e-f1a64cd2c2f5)
money-pr-local-gate: FAIL — verify-open-tour-posts-nothing.mjs rejected this branch BEFORE push.
```

Command: `LANE_CROSS=2026-09-30-ROUND-268-CODEX-REPORT-LANE-CROSS.md node /tmp/r264-run-gate.cjs node scripts/money-pr-local-gate.mjs`. The wrapper supplies the existing ih35_ci_readonly credential without printing it. No skip/bypass was used. This guard enforces an open-tour posting hold, which conflicts with Round 264 Part B's immediate-recording rule. Publishing is not claimed: two local commits on codex/r264-concept-comparison, no PR/merge/deploy. Resolving that posting-rule conflict requires a scoped guard/engine decision, not silently suppressing the failure for this report.

Final workbook checks: exactly two tabs, 794 formulas with nonempty calculated caches, zero formula errors, NET PAY markers 47 green/1 red. Corrected signed-margin absolute variance is $222,200.16; the required magnitude variance remains $96,516.32.

CODEX | 2026-09-29 5:06 PM CT | Subsequent owner ruling / 00-SEAT-CONTRACT §3 resolves the blocker. Rewrote `scripts/verify-open-tour-posts-nothing.mjs` in place (existing gate and step 10433 retained) to check the Expense.load_id reporting join, not prevent posting while a tour is open. Removed the contradictory posting-delay assertions, time cutoff and unreachable-DB/CI skips. Missing DB, empty visible scope or broken linkage now fails closed. USMCA-only, read-only; no production writes.

Live guard at 22:06:38.961Z: 542 posted nonvoid Expenses; 539 valid same-company load joins; 3 without direct/attribution/fuel load references reported separately, not asserted to be load costs; 0 linkage violations. Selftest PASS 7/7, including missing direct FK, dangling FK, foreign-entity load, and conflicting attribution mutants rejected. Deliberate split allocations remain valid.

The formerly flagged expenses were independently queried using the owner role and bypass inside BEGIN READ ONLY, then ROLLBACK:

| Expense id | Expense number | Load | Posted | Attribution rows |
|---|---|---|---|---:|
| 1e24c761-d8bd-40f0-8d31-ff0d37dc6980 | 13610-1 | 13610 | yes | 1 |
| 2aa0e584-478e-4d3c-bc7c-65c151d0c3be | 13619 | 13619 | yes | 1 |
| 2bbc404d-91fe-4151-be83-6f29c7cda3b2 | 13610 | 13610 | yes | 1 |

All three target loads belong to USMCA and have soft_deleted_at NULL. SQL: select expense ID/number/load/posting_status, LEFT JOIN mdata.loads on loads.id=expenses.load_id, and count expense_attribution.expense_load_links by expense_id; WHERE expenses.operating_company_id=USMCA AND expenses.id IN the three IDs above. The guard's full SQL is exported as LINKAGE_SQL for reproducibility. This change does not claim to remove application posting holds; it replaces the contradictory verifier as expressly ordered.
# CODEX | 2026-09-29 5:38 PM CT | Publication rebase proof

PR #23153 landed during publication. Its four-file no-tour-posting-delay regression check and nine-row historical-hold ceiling are retained alongside the requested load-linkage assertion. The hold read is now USMCA-scoped and read-only. Combined selftest: 9/9. Production read at 2026-09-29 5:37 PM CT: 542 posted expenses; 539 load-linked; 3 without load references (not asserted load costs); 0 linkage violations; 9 historical tour-open holds. No rows changed. Main's generated scoreboard refresh superseded the redundant local refresh; no generated scoreboard changes remain in this PR.
