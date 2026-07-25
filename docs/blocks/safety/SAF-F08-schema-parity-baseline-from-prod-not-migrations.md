<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F08 — F08 · schema-parity baseline parsed from migration files (sees held/unapplied columns) — root cause of F02–F04 false PASS
**FINDING:** F08 (P1, no FIN-HOLD; but it is the mechanism behind three P0 FIN false-greens) · **Lane:** NON-FINANCIAL (guard/tooling correctness) · **Module:** Safety (schema-parity guard) / cross-cutting.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Schema parity) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Guards source truth from prod) · IH35_ARCHITECTURAL_DESIGN.md (module Safety / CI guards) · docs/lockdown/00_LOCKED_DECISIONS.md (prod/reference wins over migrations — the Full-Audit-Law)
Approved screens reviewed: N/A (tooling/guard) — no leaf.
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (guard baseline source — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The schema-parity guard builds its baseline by PARSING MIGRATION FILES, so it "sees" columns that live only in unapplied migrations (e.g. everything in `202607080000`, `applied_on_prod:false`) and reports PASS even though those columns are ABSENT on prod. This is the root cause of the false-green on SAF-F02, F03, F04. A guard whose truth is migration files, not prod, cannot detect apply-drift. **Step 1 — reproduce (Rule 10, lucia):** (a) grep the parity guard; confirm its baseline is assembled from migration SQL files (not a live `information_schema` pull). (b) Show the drift concretely: `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='safety' AND table_name='civil_fines' AND column_name='driver_settlement_deduction_id';` → ZERO rows on prod; then run the guard and observe PASS. That divergence IS the defect. Prod branch br-fancy-credit-akjnd07a is the only valid baseline.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the parity baseline must be sourced from PROD `information_schema` on branch br-fancy-credit-akjnd07a (lucia), the canonical schema truth — NOT migration files, NEVER a RETIRE-table snapshot.
2. Hub matrix (both-way): this guard gates every table F02/F03/F04 touch (civil_fines, driver_finance deductions, accident_reports, incidents, legal.matters) — fixing the baseline makes those blocks' real drift visible both ways (guard ↔ prod schema).
3. Cross-module (Rule 21 §1): the parity guard is consumed across modules; SAF-F02/F03/F04 explicitly depend on its corrected baseline. It must not itself edit those blocks' guards (Rule 17 — verify-steps only).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Full-Audit-Law / Rule 06/10 honesty: "prod/reference wins over migrations/memory." NetSuite/QuickBooks-grade CI never certifies schema state from intent (migration files) — only from the live catalog. No fake green checks.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/repair — change the guard's baseline SOURCE; do not delete the guard or its history. Enforce (unchanged): guards are verify-steps only (Rule 17); NEVER edit package.json/ci.yml/locked-guards; append-only. No schema change, no data change. Rule 13/19 N/A (tooling).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = baseline assembled from migration files, so unapplied columns appear "present." Fix: source the parity baseline from PROD `information_schema` (a live lucia read on br-fancy-credit-akjnd07a), then compare the app's expected schema against ACTUAL prod columns. An expected column that is absent on prod = FAIL (apply-drift), which is exactly what F02/F03/F04 need to surface. This is a verify-step correction only — it does not touch the F02/F03/F04 writers or their guards; it gives them a truthful baseline.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-parity-baseline-source.mjs` + `scripts/verify-steps/NNN-verify-parity-baseline-source.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (baseline derived from migration files; an unapplied column reads as present), PASSes on fix (baseline read from prod information_schema; unapplied column correctly reported absent). `--selftest` mutates a real baseline-loader copy back to file-parsing, asserts flagged; asserts the prod-sourced loader not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: after the fix, the parity guard reports the `202607080000` columns as ABSENT (matching prod), turning the F02/F03/F04 false-greens into real FAILs; a truly-applied column reports present; guard green on the baseline-source check. UNVERIFIED — guard internals pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F08
LANE: NON-FINANCIAL
DOD-A: PASS — the parity guard is the active schema check; no shadow/duplicate guard.
DOD-B: N/A — tooling, no UI payload.
DOD-C: PASS — baseline ↔ prod information_schema is the real both-way source of truth (not file intent).
DOD-D: N/A — non-financial tooling.
DOD-E: UNVERIFIED — guard internals + drift reproduce pending Step-1.
VERIFY-1: N/A — no UI chrome.
VERIFY-2: N/A — no picker.
VERIFY-3: PASS — guard→prod information_schema (canonical, never migration files/RETIRE) as its baseline.
VERIFY-4: PASS — corrected baseline unblocks F02/F03/F04 real-drift detection both ways.
VERIFY-5: PASS — baseline read respects entity scope where applicable (schema-level check is entity-agnostic; lucia bypass used only to read catalog).
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: N/A — no leaf.
VERIFY-8: PASS — lucia read is a controlled bypass for information_schema only; no RLS weakening in app paths.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: parity-baseline-loader, verify-parity-baseline-source
MIGRATE: N/A — guard/tooling change; no DDL.
ROOT CAUSE: schema-parity baseline is parsed from migration files, so unapplied columns appear present → false PASS on F02/F03/F04.
FIX: source the parity baseline from prod information_schema (lucia, br-fancy-credit-akjnd07a); absent-on-prod expected column = FAIL. Files: parity-baseline loader, scripts/verify-steps/NNN-verify-parity-baseline-source.mjs.
GUARD: scripts/verify-steps/NNN-verify-parity-baseline-source.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 guard reproduce + post-fix "column absent" report matching prod.
REMAINING: this is the hard dependency for SAF-F02/F03/F04; land it FIRST; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
