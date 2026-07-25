<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F21 — F21 · to_regclass silent partial counts
**FINDING:** F21 (P2) · **Lane:** NON-FINANCIAL · **Module:** lists (count integrity).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Catalog counts) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§count integrity) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — counts are read-only).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): no tab change — this hardens the counting mechanism the ribbon/registry use.
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The count routine wraps each catalog in `to_regclass(...)` and, when the target resolves NULL (missing/renamed table), silently returns 0 (or skips) instead of failing — so a missing catalog looks like an empty one (silent partial counts). **Step 1 — reproduce (Rule 10, lucia):** find the `to_regclass` guard-then-swallow pattern:
```
# 1) the count code that treats to_regclass NULL as 0 / skip — read live
rg -n "to_regclass" scripts/** app/**/lists/**                      # not in backbone → verify live
# 2) demonstrate: a bogus name returns NULL (would silently count 0)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.__definitely_missing__') AS should_be_null;  -- NULL → today counted as 0
ROLLBACK;
SQL
```
The exact swallow-NULL code path is NOT in the backbone → read live. (This is the mechanism behind LST-F16/F25 ambiguity — missing vs empty.)

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the count routine must resolve each catalog to a canonical `to_regclass(...)` non-null table or FAIL LOUD; NEVER coerce NULL→0. No table write.
2. Hub matrix: consumed by ribbon (LST-F01) + registry (LST-F18) + count-spec (LST-F20); a fail-loud count protects every counted catalog’s integrity across `org.companies`.
3. Cross-module (Rule 21 §1): every module reading these counts (lists, safety, accounting, maintenance) now gets an honest signal (real count or explicit error), not a false zero.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/QuickBooks no-silent-failure principle + our Full Audit Law — a count over a missing object must error, not report 0; false-empty is a trust violation (an auditor cannot distinguish “no data” from “no table”).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/hardening only — replace swallow-NULL with a loud failure; no data change. Enforce: counts under GUC · canonical targets only · production never serves fake/false-zero data (the defect). Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Change the count routine so a `to_regclass(...)` NULL (or any missing/renamed target) raises an explicit error surfaced to CI + the ribbon (distinct “missing table” state), never a silent 0. Existing-but-empty catalogs correctly report 0 (distinguishable from missing — resolves the LST-F25 ambiguity too).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-count-fail-loud.mjs + scripts/verify-steps/NNN-verify-count-fail-loud.mjs. FAIL on pre-fix main (assert the count routine returns 0 for a `to_regclass`-NULL target); PASS on the fix (it raises/flags a distinct missing-table error, and returns real 0 only for an existing-empty table). --selftest mutates REAL source to reintroduce NULL→0, one case per assertion, and asserts the fail-loud shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: feeding a missing catalog name produces an explicit error (not 0); an existing-empty catalog returns 0; ribbon shows a distinct missing state vs zero for TRANSP and USMCA; guard wired. OR "UNVERIFIED — swallow-NULL code path not yet located; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F21
LANE: NON-FINANCIAL
DOD-A: PASS — the counting path is single/active and now honest; no dual path.
DOD-B: N/A — mechanism hardening, no create wizard.
DOD-C: PASS — counts still resolve each catalog to its canonical table; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — swallow-NULL code path must be located live before freeze.
VERIFY-1: PASS — ribbon renders a distinct missing-table state (chrome honest).
VERIFY-2: N/A — not a picker.
VERIFY-3: PASS — count routine→CANONICAL tables→fail-loud on missing→entity-scoped→flags honest (no false zero).
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — per-entity counts scoped for TRANSP and USMCA; global handled per LST-REGISTRY; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — counts under correct GUC; security_invoker; FORCE RLS; grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: count-fail-loud (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — code change to the count routine; no DDL/DML.
ROOT CAUSE: the count routine coerces a `to_regclass`-NULL (missing table) to 0, hiding missing catalogs as empty.
FIX: raise/flag an explicit missing-table error instead of 0; keep real 0 for existing-empty; files: count routine module.
GUARD: scripts/verify-steps/NNN-verify-count-fail-loud.mjs
LIVE PROOF: <missing→error, empty→0, distinct ribbon states — or UNVERIFIED: path not located>
REMAINING: this also disambiguates LST-F16 (expensive_states) and LST-F25 (tire-positions) missing-vs-empty; sequence to land with/after them.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
