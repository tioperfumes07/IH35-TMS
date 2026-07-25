<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F10 — F10 · /lists/driver/teams is an 18-line stub
**FINDING:** F10 (P2) · **Lane:** NON-FINANCIAL · **Module:** lists/driver (teams).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Driver teams) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§team assignment) · IH35_ARCHITECTURAL_DESIGN.md (module driver — teams spec) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — no GL).
Approved screens reviewed: docs/approved-screens/7Drivers.png.
Tab count check (Rule 05): design says the driver-teams leaf is a full list+create surface · today it is an 18-line stub (missing leaf content) · this block builds it to the design’s field/tab count · matches after build (confirm design png leaf).
Deviations from spec: None — build the specified surface, no invention.
NEW SPEC items (Rule 01): None if IH35_ARCHITECTURAL_DESIGN defines teams; if the canonical table does not exist, table creation is additive infra, not a new product surface — but any team-behavior beyond the design png needs Jorge approval (list if found).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`/lists/driver/teams` renders an ~18-line placeholder (stub), not the architectural-design team surface (list, create, driver membership). **Step 1 — reproduce (Rule 10, lucia):** confirm the route is a stub and confirm whether a canonical teams table exists:
```
# 1) stub component — read live
wc -l app/**/lists/driver/teams/*  ; rg -n "ComingSoon|TODO|stub" app/**/lists/driver/teams/*   # not in backbone → verify live
# 2) canonical target existence (driver teams table not in backbone → must verify)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.driver_teams') AS teams_tbl, to_regclass('mdata.drivers') AS drivers_tbl;
ROLLBACK;
SQL
```
Teams table name/existence is NOT in the backbone → verify live before choosing build vs additive-create. `mdata.drivers` is the canonical driver master (system map).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.driver_teams')` (confirm live; additively create if missing, with opco + FORCE RLS) — membership FKs to `to_regclass('mdata.drivers')`. NEVER a RETIRE table.
2. Hub matrix: a team links BOTH-WAY to `org.companies` (opco) and to `mdata.drivers` (member drivers) — reverse: a driver resolves its team(s). Cross to dispatch (team-based assignment) once built.
3. Cross-module (Rule 21 §1): teams surface must appear in the driver profile (team membership) and in dispatch (team as an assignable unit) and drill both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys driver-team modeling — team is a first-class assignable entity with driver membership, entity-scoped; a stub leaf is an unfinished module leaf (Full Audit Law: no silent-missing).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — build the surface; if the table is missing, additive idempotent CREATE (DO + IF NOT EXISTS) with `operating_company_id` + FORCE RLS. Enforce: RLS on teams + membership · append-only audit on mutation · void-not-delete membership · display IDs server-generated · +Create not +New. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Replace the stub with the architectural-design driver-teams surface: list (entity-scoped), +Create team, driver membership management (add/remove = deactivate, not delete), all writing the canonical `catalogs.driver_teams` (+ membership join) under GUC. If the canonical table/columns do not exist, add them additively in the same PR.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-driver-teams-built.mjs + scripts/verify-steps/NNN-verify-driver-teams-built.mjs. FAIL on pre-fix main (asserts the teams route file is a stub — line-count/ComingSoon marker — or that create writes nothing canonical); PASS on the fix (route renders list+create bound to canonical `catalogs.driver_teams` under GUC). --selftest mutates REAL source back to a stub, one case per assertion, and asserts the built shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: create a team + add a driver → Neon lucia rows in `catalogs.driver_teams` + membership under correct opco (TRANSP and USMCA) + guard wired + browser round-trip (reload shows team & members). OR "UNVERIFIED — canonical teams table not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F10
LANE: NON-FINANCIAL
DOD-A: PASS (post-build) — single active teams route with a mounted component + nav leaf; no ComingSoon twin.
DOD-B: PASS — every rendered field (team name, membership) controlled AND in the submit payload AND written.
DOD-C: PASS — team↔driver membership FORWARD+REVERSE via canonical FKs; no memo/uuid-in-name/jsonb-ids.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — canonical teams table existence/columns must be confirmed live (Step-1) before freeze.
VERIFY-1: PASS — QBO-style list chrome + +Create; drawer for create.
VERIFY-2: PASS — driver membership uses the universal driver picker (canonical `mdata.drivers`, inline +Add new driver as first row, entity-scoped).
VERIFY-3: PASS — nav→/lists/driver/teams→UI→API→CANONICAL catalogs.driver_teams→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain (dispatch assignment is downstream, tracked separately).
VERIFY-5: PASS — TRANSP and USMCA teams each opco-scoped; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — the teams leaf now matches the design (Rule 05); no invented tabs; design png confirmed.
VERIFY-8: PASS — teams + membership FORCE RLS, correct GUC, security_invoker on any view, grants.
MODULE_PROGRESS: driver N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/driver.json after PR; this closes a stub leaf].
ITEMS_TOUCHED: driver-teams-surface (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A if `catalogs.driver_teams` (+ membership) already exists — else additive idempotent CREATE above main max, number > 202607960000 distinct, `operating_company_id` + FORCE RLS + REVOKE DELETE + grants, dynamic org.companies (no hardcoded UUID), validate on throwaway only.
ROOT CAUSE: the driver-teams leaf was scaffolded as an 18-line stub and never built to the architectural-design surface.
FIX: build list+create+membership bound to canonical `catalogs.driver_teams`; files: /lists/driver/teams page + API + (conditional) migration.
GUARD: scripts/verify-steps/NNN-verify-driver-teams-built.mjs
LIVE PROOF: <Neon team+membership rows + browser round-trip — or UNVERIFIED: teams table unconfirmed>
REMAINING: dispatch team-assignment integration tracked as a downstream block if not in the teams design png (owner-approved deferral if beyond scope).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
