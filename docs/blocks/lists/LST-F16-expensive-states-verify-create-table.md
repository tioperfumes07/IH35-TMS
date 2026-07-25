<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F16 — F16 · catalogs.expensive_states seeded/counted but reportedly no CREATE TABLE
**FINDING:** F16 (P2, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** lists/catalogs (fuel/tax — expensive_states). **Provenance: [UNVERIFIED]**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Fuel/State catalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§expensive states) · IH35_ARCHITECTURAL_DESIGN.md (module fuel/lists) · docs/lockdown/00_LOCKED_DECISIONS.md (fuel/IFTA-adjacent → FINANCIAL-HOLD; no GL math, no QBO write).
Approved screens reviewed: docs/approved-screens/5Fuel_Planner.png, 9Lists_and_catalogs.png.
Tab count check (Rule 05): design says expensive_states is a real catalog leaf · today it may be seeded/counted with no backing table · this block ensures the table exists · no tab change.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — this ensures the already-referenced catalog is physically real.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE] — reported [UNVERIFIED]
It is reported that `catalogs.expensive_states` is seeded and counted by the app, yet no `CREATE TABLE` for it exists — meaning the count/seed may target a missing or differently-named object (a fail-loud gap, LST-F21). This is NOT in the backbone and is explicitly UNVERIFIED. **Step 1 — reproduce (Rule 10, lucia) — MANDATORY before any DDL:**
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.expensive_states') AS exists_or_null;  -- NULL => truly missing
-- if non-null, show shape + count so we do NOT re-create over live data
SELECT count(*) FROM catalogs.expensive_states;                     -- only if above is non-null
ROLLBACK;
SQL
# also grep the seed/count references to see what name they use
rg -n "expensive_states" migrations/** scripts/** app/**            # not in backbone → verify live
```
If `to_regclass` is NON-NULL, the table EXISTS — the finding collapses (only the missing CREATE-TABLE migration record needs reconciling, no new table). Only if NULL is it truly missing.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.expensive_states')` — must resolve non-null. If missing, additively CREATE it in `catalogs` with `operating_company_id` + FORCE RLS (classification will be PER-ENTITY only if seeded per entity — confirm opco VALUES in Step-1, not column presence). NEVER a RETIRE table.
2. Hub matrix: expensive_states links BOTH-WAY to `org.companies` (opco, if per-entity) and feeds the fuel planner (avoid-state routing) — reverse: a fuel plan resolves the states it flagged.
3. Cross-module (Rule 21 §1): appears in the fuel planner and the lists catalog; drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite data-integrity + FMCSA/IFTA fuel-tax rigor — a catalog that is seeded and counted must have a real backing table; a phantom seed/count is a silent-failure the fail-loud count-spec (LST-F21) must catch. No unverified financial writes.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive ONLY, and ONLY if Step-1 proves the table missing — additive idempotent CREATE (DO + IF NOT EXISTS) with opco + FORCE RLS; if it already exists, do NOTHING to the table (reconcile the migration ledger record only). **Rule 13 (FINANCIAL-HOLD):** no GL math, reuse posters, parallel books untouched, QBO NEVER written, flags default OFF. **Rule 19:** touch no reserve/holdback account — expensive_states is a routing catalog, not a GL account; do not conflate.

## THE FIX (requirement-level; no invented unverified SQL)
Run Step-1 first. If `catalogs.expensive_states` truly does not exist, add it additively with the seeded shape, opco (if per-entity), FORCE RLS, and reconcile the seed/count references to the real table name. If it exists, close the finding as “table present; migration-ledger record missing” and add the missing CREATE-TABLE record idempotently so drift guards pass — no data change.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-expensive-states-table.mjs + scripts/verify-steps/NNN-verify-expensive-states-table.mjs. FAIL on pre-fix main (asserts a seed/count reference to `expensive_states` with NO corresponding CREATE TABLE / `to_regclass` NULL in the migration set); PASS on the fix (`to_regclass('catalogs.expensive_states')` non-null AND a CREATE-TABLE migration exists). --selftest mutates REAL source to seed a table with no CREATE, one case per assertion, and asserts the reconciled shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: `to_regclass('catalogs.expensive_states')` non-null on prod; count matches the seed; if per-entity, scoped for TRANSP and USMCA; guard wired. OR — the likely outcome — "UNVERIFIED collapses: table EXISTS on prod, finding reduces to a ledger-record reconcile (no DDL)". Blocker if Step-1 not yet run.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F16
LANE: FINANCIAL-HOLD
DOD-A: PASS — the catalog leaf resolves to a real table (single active path) after Step-1/fix.
DOD-B: N/A — no create wizard changed; existence/seed integrity only.
DOD-C: PASS — expensive_states↔fuel-plan FORWARD+REVERSE once the table is real; no memo/uuid-in-name.
DOD-D: N/A — no money object; routing catalog.
DOD-E: UNVERIFIED — MUST run Step-1 `to_regclass` on prod before any DDL; this finding is explicitly unverified.
VERIFY-1: PASS — catalog list chrome unaffected.
VERIFY-2: N/A — not a picker surface.
VERIFY-3: PASS — nav→fuel/lists→UI→API→CANONICAL catalogs.expensive_states→same R/W→entity-scoped (if per-entity)→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — if per-entity, TRANSP and USMCA scoped; if global, documented as global in LST-REGISTRY; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back; reserve accounts untouched (Rule 19).
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — if created, FORCE RLS + correct GUC + security_invoker + grants; if it exists, RLS state confirmed unchanged.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: expensive-states-table-verify (manifest id to resolve live) — [AUDIT].
MIGRATE: CONDITIONAL — only if Step-1 `to_regclass` returns NULL: additive idempotent CREATE TABLE in `catalogs`, migration number > 202607960000 distinct, opco (if per-entity) + FORCE RLS + REVOKE DELETE + grants + dynamic org.companies (no hardcoded UUID), validate on throwaway only. If non-null: N/A DDL, add the missing ledger record only.
ROOT CAUSE: (reported) a catalog is seeded/counted without a verified CREATE TABLE — either a truly missing table or a migration-ledger gap. Step-1 disambiguates.
FIX: verify existence live; additively create only if missing; else reconcile the migration record; files: (conditional) migration + seed/count reference reconcile.
GUARD: scripts/verify-steps/NNN-verify-expensive-states-table.mjs
LIVE PROOF: <to_regclass result + count parity — or UNVERIFIED: Step-1 not yet run>
REMAINING: none defensible once Step-1 runs; if the table exists, downgrade the finding to a ledger-reconcile and note in the tracker.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
