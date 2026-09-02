# Closed-loop baseline audit — 2026-08-30

Scope: every path formerly frozen in `docs/specs/CLOSED-LOOP-BASELINE.json`. “Ratchet” means the check is useful only for declaration integrity and is now mechanically forbidden from backing a PASS/`prod_verified` claim. “Open-loop” means the former detector missed a real second input; `@independent-input` makes that dynamic input explicit. The baseline decreases 29 → 0; it does not grow.

| # | Guard | Finding and exact closing/independent line | Resolution |
|---:|---|---|---|
| 1 | `verify-audit-coverage-ledger-integrity.mjs` | Genuine: line 69 reads only `AUDIT-COVERAGE-LIVE.md`; all assertions are about that parsed declaration. | Declared `@ratchet` at line 2; never Live proof. |
| 2 | `verify-baseline-columns-exist-in-db.mjs` | Over-flagged: the baseline read is independently checked by database queries (lines 62–70, connection selection line 89). | Declared dynamic `DATABASE_URL` input at line 2. |
| 3 | `verify-block-lifecycle.mjs` | Over-flagged: override JSON is read at line 76 and independent `.block-ready/*.json` artifacts are enumerated/read at lines 81–83. | Declared `.block-ready/` at line 2. |
| 4 | `verify-block-status-overrides-downgrade-only.mjs` | Over-flagged: current JSON is compared with `git show origin/main` in `baselineRows()` (lines 125–136). | Declared `origin/main` at line 2. |
| 5 | `verify-board-append-only.mjs` | Over-flagged: current board is read at line 139 and compared with base text from `git show` at line 146. | Declared `origin/main` at line 2. |
| 6 | `verify-codex-merged-findings-not-open.mjs` | Genuine before repair: the expected Map lived in the checking script, so editing the guard changed its answer. | Re-anchored: board line 5 versus committed `CODEX-MERGED-FINDINGS-EXPECTED.json` line 6; selftest rejects 32/32 status mutations. |
| 7 | `verify-derived-artifact-freshness.mjs` | Over-flagged: registry line 179 is checked against artifact files and deployed `/healthz/version` ancestry (lines 185–205). | Declared `live:/healthz/version` at line 2. |
| 8 | `verify-dispatch-required-scenario-maint-honest.mjs` | Genuine: line 17 reads one Required declaration and hard-coded forbidden ids define the answer. | Declared `@ratchet` at line 2; never product proof. |
| 9 | `verify-entity-picker-supersession-drain.mjs` | Genuine: its only assertion was `existsSync` on the retirement document (line 5). | Declared presence-only `@ratchet` at line 2; never product proof. |
| 10 | `verify-expense-built-tags-strict.mjs` | Over-flagged: feed line 18 is checked against every executable verifier enumerated at lines 20–21. | Declared `scripts/` at line 2. |
| 11 | `verify-fuel-fraud-alert-action-lifecycle.mjs` | Over-flagged: registry line 13 selects independent frontend/backend sources read at lines 54–55 and 82. | Declared both exact product paths at lines 2–3. |
| 12 | `verify-kpi-sources-of-truth-exists.mjs` | Genuine: line 26 reads only the KPI documentation and checks embedded section names. | Declared documentation `@ratchet` at line 2; never KPI/Live proof. |
| 13 | `verify-liability-built-tags-strict.mjs` | Over-flagged: feed line 23 is checked against executable verifier sources enumerated at lines 25–26. | Declared `scripts/` at line 2. |
| 14 | `verify-lists-accounting-picker-law-honest.mjs` | Genuine: line 68 reads one Required declaration and embedded dropped/retained lists define the answer. | Declared decision `@ratchet` at line 2; never picker/Live proof. |
| 15 | `verify-lists-required-liability-honest.mjs` | Genuine: line 20 reads only `lists.required.json`; offender rules are embedded. | Declared `@ratchet` at line 2. |
| 16 | `verify-lists-required-money-honest.mjs` | Genuine: line 21 reads only `lists.required.json`; offender rules are embedded. | Declared `@ratchet` at line 2. |
| 17 | `verify-multi-entity-separation.mjs` | Genuine: line 13 reads only the law document and embedded regexes check its wording. | Declared law-wording `@ratchet` at line 2; never runtime separation proof. |
| 18 | `verify-no-patch-or-defer-language.mjs` | Over-flagged: the law is one input; independent block artifacts are enumerated/read at lines 129–133. | Declared `.block-ready/` at line 2. |
| 19 | `verify-no-posting-gate-on-empty-table.mjs` | Over-flagged: registry declarations drive independent, bypass-verified database queries at lines 75–117. | Declared `DATABASE_URL` at line 2. |
| 20 | `verify-ob01-fixture-tieout.mjs` | Genuine for present-day proof: line 141 reads a frozen historical TRANSP fixture and compares it with acceptance constants embedded in the same verifier. | Declared historical `@ratchet` at line 2; never current Live proof; no TRANSP data/code changed. |
| 21 | `verify-owner-admin-quickstart-help-anchors.mjs` | Genuine before repair: required anchors were embedded beside the guide check. | Re-anchored to product `help-links.ts` (lines 28, 49–51); guide anchors must match independently mounted link targets. |
| 22 | `verify-pass-8-clean-baseline.mjs` | Genuine: line 13 reads only a frozen report and trusts its own PASS fields. | Declared frozen-report `@ratchet` at line 2; never current Live proof. |
| 23 | `verify-perf-budgets-not-regressed.mjs` | Genuine for current performance: line 20 reads one file containing both measurements and budgets. | Declared recorded-data `@ratchet` at line 2; never current Live proof. |
| 24 | `verify-revenue-recognition-two-event-latch-decisions.mjs` | Over-flagged: line 142 reads both canonical decision doc and separately sanitized skill surface selected by `DOCS` (lines 27–30). | Declared the dynamic skill input at line 2. |
| 25 | `verify-reversal-symmetry.mjs` | Genuine: lines 49/78 read only `POSTING-CONTRACTS.json`; it checks declared producers/surfaces, not execution. | Declared contract `@ratchet` at line 2; Live reversal remains separate. |
| 26 | `verify-static-ratchet.mjs` | Over-flagged: head baseline line 117 is compared with `git show origin/main` in lines 46–50/118–120. | Declared `origin/main` at line 2. |
| 27 | `verify-thin-hold-pr-manifest-map.mjs` | Over-flagged: map line 27 is compared with independently loaded `accounting.json` item ids in lines 29–35. | Declared exact manifest input at line 2. |
| 28 | `verify-usmca-reports-neon-pv.mjs` | Over-flagged: manifest claims are checked against scoped USMCA Neon queries at lines 60–103 and 138–146. | Declared `DATABASE_URL` at line 2. |
| 29 | `verify-wizard-section-equality.mjs` | Over-flagged: contract line 61 selects independent component source read at line 72; rendered labels are compared at lines 79–90. | Declared dynamic frontend source root at line 2. |

Mechanical proof:

- `verify-no-closed-loop-guards --selftest`: 9/9, including the new declared-dynamic-input arm.
- `verify-no-closed-loop-guards`: undeclared closed loops 0, frozen baseline 0.
- `verify-codex-merged-findings-not-open --selftest`: 32/32 mutations rejected.
- Ratchet misuse remains fail-closed: a verifier tagged `@ratchet` cannot back any PASS or `prod_verified` manifest proof.
- All 23 of the 29 scripts that implement `--selftest` passed their planted mutations. Normal mode passed for 27/29. The two reds are evidence that these guards can fail, not regressions from this change: `verify-board-append-only` rejects the current board's pre-existing duplicate/uncited completion population, and `verify-pass-8-clean-baseline` rejects the currently missing frozen report.
- Live Neon exercised the dynamic database-input class: `verify-usmca-reports-neon-pv` passed with scoped counts; `verify-baseline-columns-exist-in-db` found 10 existing phantom baseline columns; `verify-no-posting-gate-on-empty-table` found two USMCA launch-owed tables at zero. Those last two findings were not altered or inflated into this guard-classification close.
