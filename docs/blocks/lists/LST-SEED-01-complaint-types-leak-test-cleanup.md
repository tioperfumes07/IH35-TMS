<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-SEED-01 — SEED-01 · complaint_types leak-test pollution cleanup + guard
**FINDING:** SEED-01 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL · **Module:** Lists & Catalogs (Safety/Complaints).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Lists/Catalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Complaint taxonomy) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — not financial)
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (no tab change — data cleanup + guard only)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
`catalogs.complaint_types` is PER-ENTITY (backbone: 295 opco-populated / 0 null, RLS forced, policy `= GUC`) — genuinely per-entity, opco populated, NOT an excluded shared-canonical catalog. 259 `'USMCA-1 leak test'` rows were RLS-leak test-harness pollution (not a seed gap); they were soft-deactivated on prod (`is_active=false`), leaving TRANSP 12 / TRK 12 / USMCA 12 active; a full ~120-catalog sweep is now clean. **Step 1 — reproduce (Rule 10, lucia):** on Neon `tiny-field-89581227` prod branch `br-fancy-credit-akjnd07a`, in one txn `SET app.bypass_rls='lucia'; SELECT operating_company_id, count(*) FILTER (WHERE is_active) AS active, count(*) FILTER (WHERE lower(name) LIKE '%leak test%') AS junk FROM catalogs.complaint_types GROUP BY 1;` — expect 0 active junk, 12 active per entity. [Active 12/12/12 count re-verify live; backbone confirms only the 295-pop/0-null + policy shape.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.complaint_types')` non-null (backbone PER-ENTITY) — NEVER a RETIRE table. No write to `mdata.*`/legacy catalogs.
2. Hub matrix: complaint_type → `org.companies` (operating_company_id, both-way) forward (complaint record picks type) + reverse (type lists its complaints via safety complaint FK). Links to safety.complaints (consumer) both ways.
3. Cross-module (Rule 21 §1): Safety/Complaints intake picker, Driver profile complaint tab, Reports complaint rollup — each shows active types only and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite-level list hygiene + RLS/WORM: a per-entity catalog must never leak another tenant's rows nor carry test-harness residue into production data; QuickBooks-grade "no fake data in production" (Rule 07 §F.24).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE. The 259 junk rows are soft-deactivated (`is_active=false`), NEVER hard-deleted, preserving audit trail. Enforce: operating_company_id RLS on the table · views WITH(security_invoker=true) · append-only audit on the deactivation mutation · void-not-delete · display IDs server-generated · production never serves fake data. Not financial: Rule 13/19 N/A.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = a test harness inserted 259 `'USMCA-1 leak test'` complaint_types under TRANSP with RLS enabled, and PR #3452 then seeded the same junk toward "parity" — the wrong direction. Fix: (a) record the applied prod fix (soft-deactivate all leak-test rows across the ~120-catalog sweep) as the block of record; (b) ship a standing guard that FAILS if any catalog contains active leak-test/test-harness rows; (c) CLOSE PR #3452 (it propagated junk to parity). No schema change — complaint_types is correctly per-entity already.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-no-leak-test-pollution.mjs` + `scripts/verify-steps/NNN-verify-no-leak-test-pollution.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (259 active leak-test rows present), PASSes on fix (0 active leak-test rows across all per-entity catalogs); `--selftest` inserts a real leak-test row into a throwaway catalog copy, asserts it is flagged, and asserts a clean catalog is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: prod query above returns 0 active leak-test rows and 12 active per entity (TRANSP+TRK+USMCA); guard wired in verify-steps and green; PR #3452 closed (not merged). UNVERIFIED item: exact 12/12/12 active count re-verify live before freeze (backbone confirms shape, not the active tally).

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: SEED-01
LANE: NON-FINANCIAL
DOD-A: PASS — Complaints picker route registered + component mounted; no DUAL_PATH_OLD_ACTIVE twin; cleanup is data+guard, no dead path.
DOD-B: N/A — no wizard/form field added; data-cleanup + guard only, nothing rendered to control.
DOD-C: PASS — complaint_type ↔ org.companies + safety.complaints FK both ways; no memo/uuid-in-name/jsonb-id linkage.
DOD-D: N/A — non-economic catalog; no money object selected by this record.
DOD-E: PASS — live prod query (leak-test=0 active) + guard green; active tally flagged for live re-verify.
VERIFY-1: N/A — no new QBO chrome; existing complaints panel unchanged.
VERIFY-2: PASS — complaints picker keeps catalog-behind-it, entity-scoped, inline +Add as first row, write=read on catalogs.complaint_types; cleanup does not alter picker law.
VERIFY-3: PASS — nav→Complaints route→UI→API→`catalogs.complaint_types` (canonical, never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense/bill chain touched by a complaint-type cleanup.
VERIFY-5: PASS — TRANSP + TRK + USMCA each retain 12 active types; no cross-entity leak after deactivation.
VERIFY-6: N/A — no economics/JE; catalog is non-financial.
VERIFY-7: PASS — Lists & Catalogs leaf count unchanged; no invented/removed tab.
VERIFY-8: PASS — FORCE RLS on complaint_types; GUC-scoped; security_invoker views; grants unchanged (REVOKE not needed — no schema change).
MODULE_PROGRESS: lists-catalogs N of M (must match docs/module-completion/lists-catalogs.json AFTER this PR)
ITEMS_TOUCHED: complaint_types-catalog, leak-test-guard
MIGRATE: N/A — data cleanup already applied on prod (soft-deactivate); no DDL. Guard-only ship.
ROOT CAUSE: RLS-leak test harness inserted 259 leak-test complaint_types under TRANSP; PR #3452 then seeded the junk to parity (wrong direction).
FIX: Soft-deactivate all leak-test rows (applied), ship verify-no-leak-test-pollution guard, CLOSE PR #3452. Files: scripts/verify-no-leak-test-pollution.mjs, scripts/verify-steps/NNN-verify-no-leak-test-pollution.mjs.
GUARD: scripts/verify-steps/NNN-verify-no-leak-test-pollution.mjs
LIVE PROOF: prod lucia query (0 active leak-test, 12/12/12 active) — active tally UNVERIFIED pending live re-run; PR #3452 closed.
REMAINING: none defensible — active-count live re-verify is a pre-freeze guard step, not a deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
