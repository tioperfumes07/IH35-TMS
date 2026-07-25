<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F17 — F17 · cancellation-reasons canonical = per-entity load_cancellation_reasons [OWNER DECISION — SETTLED A]
**FINDING:** F17 (P1, OWNER DECISION — SETTLED A) · **Lane:** DOCS (doc reconcile + additive legacy archive) · **Module:** Dispatch / Lists.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Cancellation taxonomy) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Canonical picks) · IH35_ARCHITECTURAL_DESIGN.md (module Dispatch) · docs/lockdown/00_LOCKED_DECISIONS.md (owner canonical ruling) · ih35-tms-standards skill §10.1 · FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md
Approved screens reviewed: docs/approved-screens/8DispatchHome.png · docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (doc reconcile + archive — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None — this records a SETTLED owner decision.

## PROD TRUTH  [OWNER DECISION — SETTLED A · GUARD-VERIFIED 2026-07-25]
Owner ruling **A** (SETTLED): the canonical cancellation-reasons table is the **per-entity** `catalogs.load_cancellation_reasons` (backbone: 63 pop / 0 null, RLS forced, `= GUC`). Legacy `catalogs.cancellation_reasons` (backbone: 9-row, RLS-off) is **RETIRE** — archive, never drop. The repo already reflects A (#3436 / #3439 / guard 1432). Residual = reconcile stale docs that still imply the old global table (ih35-tms-standards skill §10.1, FINAL-TABLES-WIRING doc) to ruling A, and archive legacy `cancellation_reasons`. **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.load_cancellation_reasons; -- 63` and `SELECT count(*) FROM catalogs.cancellation_reasons; -- 9 legacy` ; grep docs for references to `cancellation_reasons` that should say `load_cancellation_reasons`.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.load_cancellation_reasons')` non-null (PER-ENTITY). `catalogs.cancellation_reasons` = RETIRE — archive (REVOKE + COMMENT), never write/FK/drop.
2. Hub matrix: cancelled load → `mdata.loads` (reverse) + `catalogs.load_cancellation_reasons` (forward) + `org.companies` — same as LST-F04; this block is the decision-of-record + doc/legacy reconcile behind F04.
3. Cross-module (Rule 21 §1): Dispatch cancel, Lists (cancellation reasons catalog), docs/skill — all must name the per-entity canonical table.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
Single-source-of-truth reference data (NetSuite/QuickBooks): one canonical per-entity table, no ambiguous duplicate; documentation must match the code + owner ruling so no future coder rewires to the legacy table. Owner-of-record decision honesty (Rule 06).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — legacy `cancellation_reasons` is ARCHIVED (REVOKE INSERT/UPDATE/DELETE + `COMMENT ON TABLE … IS 'RETIRED — canonical is catalogs.load_cancellation_reasons per LST-F17 ruling A'`), NEVER dropped/truncated. Docs are edited additively (reconcile wording). Enforce: RLS on load_cancellation_reasons · security_invoker views · append-only audit · void-not-delete. Not a new financial write: Rule 13/19 N/A to the doc reconcile; the archive REVOKE is additive and touches no accounts/posting.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = stale docs (skill §10.1, FINAL-TABLES-WIRING) still reference the legacy global `cancellation_reasons`, risking a future rewire away from the owner-settled canonical. Fix: (1) record ruling A as the decision-of-record here; (2) reconcile ih35-tms-standards skill §10.1 + FINAL-TABLES-WIRING doc to name `catalogs.load_cancellation_reasons`; (3) archive legacy `cancellation_reasons` (REVOKE + retirement COMMENT, never drop). Writer/picker repoint itself is LST-F04.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-cancellation-reasons-canonical-doc.mjs` + `scripts/verify-steps/NNN-verify-cancellation-reasons-canonical-doc.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (docs/wiring reference `cancellation_reasons` as canonical, or legacy still writable), PASSes on fix (docs name `load_cancellation_reasons`; legacy REVOKEd + commented). `--selftest` mutates a real doc copy to name the legacy table canonical, asserts flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: skill §10.1 + FINAL-TABLES-WIRING name `catalogs.load_cancellation_reasons` as canonical; legacy `cancellation_reasons` shows REVOKEd grants + retirement comment on prod; guard green; #3436/#3439/guard 1432 confirmed on origin/main. Owner ruling A recorded.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F17
LANE: DOCS
DOD-A: PASS — no runtime path changed by this block; F04 owns the active writer path (already A). Doc/archive only.
DOD-B: N/A — no wizard/field; decision-of-record + doc reconcile + legacy archive.
DOD-C: PASS — canonical linkage (load↔load_cancellation_reasons↔org.companies) documented both ways; legacy de-linked (archived).
DOD-D: N/A — no money object selected; this is the canonical-pick decision-of-record.
DOD-E: PASS — backbone confirms per-entity canonical (63) + legacy RETIRE (9); docs reconciled; legacy archive to be shown live.
VERIFY-1: N/A — no QBO chrome change.
VERIFY-2: PASS — cancellation-reasons picker (via F04) keeps catalog-behind-it write=read on the per-entity canonical; this block ensures docs agree.
VERIFY-3: PASS — documented chain nav→cancel→`catalogs.load_cancellation_reasons` (canonical, never RETIRE `cancellation_reasons`)→entity-scoped→flags honest.
VERIFY-4: N/A — no economics chain; decision/doc/archive only.
VERIFY-5: PASS — canonical is per-entity so TRANSP+USMCA isolation holds; legacy global source archived to prevent cross-entity fallback.
VERIFY-6: N/A — no JE/economics in a doc+archive reconcile.
VERIFY-7: PASS — Dispatch/Lists leaf count unchanged; no invented tab.
VERIFY-8: PASS — legacy `cancellation_reasons` REVOKEd (removes RLS-off write surface); canonical keeps FORCE RLS + GUC; grants correct.
MODULE_PROGRESS: dispatch N of M (must match docs/module-completion/dispatch.json AFTER this PR)
ITEMS_TOUCHED: skill-§10.1-doc, FINAL-TABLES-WIRING-doc, cancellation_reasons-archive
MIGRATE: number strictly above main max (above both 202607950000 and 202607960000, e.g. 202607970004, distinct) / idempotent / REVOKE on legacy + retirement COMMENT only (no opco DDL — canonical already PER-ENTITY) / no hardcoded UUID / grants / validate on throwaway only / checksum-override same PR.
ROOT CAUSE: stale docs (skill §10.1, FINAL-TABLES-WIRING) still name legacy global `cancellation_reasons`, risking a future rewire away from owner-settled ruling A.
FIX: record ruling A; reconcile docs to `catalogs.load_cancellation_reasons`; archive legacy via REVOKE + COMMENT (never drop). Files: ih35-tms-standards skill §10.1, FINAL-TABLES-WIRING doc, migrations/202607970004_*.sql.
GUARD: scripts/verify-steps/NNN-verify-cancellation-reasons-canonical-doc.mjs
LIVE PROOF: backbone (63 canonical / 9 legacy) verified; docs-reconciled + legacy-archive REVOKE proof UNVERIFIED until applied; confirm #3436/#3439/guard 1432 on origin/main.
REMAINING: doc reconcile + legacy archive to apply; owner ruling A is SETTLED (no further owner input needed).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
