<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F24 — F24 · Fleet duplicate-code check is global (USMCA can't create ACTIVE/OWNED)
**FINDING:** F24 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists/fleet (unit/trailer code uniqueness).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Fleet codes) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§entity uniqueness) · IH35_ARCHITECTURAL_DESIGN.md (module fleet) · docs/lockdown/00_LOCKED_DECISIONS.md (multi-entity isolation) .
Approved screens reviewed: docs/approved-screens/8DispatchHome.png.
Tab count check (Rule 05): no tab change — corrects a uniqueness constraint/check.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — entity-scoped uniqueness is the intended multi-entity behavior.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Fleet duplicate-code check is GLOBAL (unique across all entities), so when TRANSP already owns a code, USMCA cannot create an ACTIVE/OWNED unit/trailer with the same code — a cross-entity collision that violates entity isolation. **Step 1 — reproduce (Rule 10, lucia):** find the global check + the constraint:
```
# 1) app-level duplicate check ignoring opco — read live
rg -n "duplicate|unique.*code|already exists" app/**/fleet/** app/api/**/units/**   # not in backbone → verify live
# 2) is the DB UNIQUE global (code) instead of (operating_company_id, code)?
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid IN ('mdata.units'::regclass) AND contype IN ('u','p');   -- confirm table live
ROLLBACK;
SQL
```
The exact check + constraint shape are NOT in the backbone → read live. Confirm the canonical fleet table name (mdata.units/trailers) in Step-1.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: composite uniqueness `(operating_company_id, code)` (partial, WHERE status IN active/owned per policy) on the canonical `mdata.units`/`mdata.trailers`; the app check must include the opco GUC. NEVER a RETIRE table.
2. Hub matrix: unit/trailer links BOTH-WAY to `org.companies` (opco) — the uniqueness scope MUST be that opco, not global.
3. Cross-module (Rule 21 §1): dispatch/maintenance reference the unit by (entity, code); entity-scoped uniqueness keeps both entities’ fleets independent.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite subsidiary-scoped naming / McLeod multi-company fleet — asset codes are unique per operating company, not globally; a global unique across subsidiaries is a multi-entity design defect that blocks legitimate creation.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive-first — CREATE the composite UNIQUE index `(operating_company_id, code)` (CONCURRENTLY where possible) BEFORE removing the global one; dropping the obsolete global UNIQUE constraint is a schema correction (not data deletion) and is required for the fix — do it in the same migration only after the composite exists and validates. No row deleted. Enforce: FORCE RLS retained · app check reads GUC · idempotent migration.

## THE FIX (requirement-level; no invented unverified SQL)
Make fleet code uniqueness entity-scoped: add composite UNIQUE `(operating_company_id, code)` (partial on active/owned per policy) and update the app duplicate-check to filter by the caller’s opco GUC; then remove the global UNIQUE(code) so USMCA can create ACTIVE/OWNED codes independent of TRANSP. Confirm no existing row violates the composite before validating (Step-1 dup scan).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-fleet-code-entity-scoped.mjs + scripts/verify-steps/NNN-verify-fleet-code-entity-scoped.mjs. FAIL on pre-fix main (asserts a global UNIQUE(code) or an opco-blind app duplicate-check); PASS on the fix (composite `(operating_company_id, code)` UNIQUE + opco-scoped app check). --selftest mutates REAL source back to global uniqueness, one case per assertion, and asserts the entity-scoped shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: TRANSP and USMCA can each create an ACTIVE/OWNED unit with the SAME code without collision; a duplicate WITHIN one entity is still rejected; Neon lucia shows both rows under distinct opco; guard wired; browser round-trip both entities. OR "UNVERIFIED — fleet table/constraint shape not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F24
LANE: NON-FINANCIAL
DOD-A: PASS — single active fleet create path with entity-scoped check; no dual path.
DOD-B: PASS — code + entity in payload; duplicate check uses opco GUC.
DOD-C: PASS — unit/trailer↔org.companies FORWARD+REVERSE; uniqueness bound to that link; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — fleet canonical table + constraint definition must be read live before freeze.
VERIFY-1: PASS — create chrome unchanged; +Create preserved.
VERIFY-2: N/A — not a picker fix.
VERIFY-3: PASS — nav→fleet create→API→CANONICAL mdata.units/trailers→same R/W→entity-scoped uniqueness→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — THIS is the entity-scope fix: TRANSP and USMCA independent; units-by-owner/lease respected; no cross-entity block/leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — composite UNIQUE under FORCE RLS; app check uses correct GUC; grants; security_invoker on any view.
MODULE_PROGRESS: fleet N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/fleet.json after PR].
ITEMS_TOUCHED: fleet-code-entity-uniqueness (manifest id to resolve live) — [AUDIT].
MIGRATE: additive-then-correct — CREATE composite UNIQUE `(operating_company_id, code)` (partial per policy, CONCURRENTLY where possible), validate on throwaway, then DROP the global UNIQUE(code) in the same migration; number > 202607960000 distinct, idempotent (IF EXISTS/IF NOT EXISTS), FORCE RLS retained, no hardcoded org UUID, grants. Pre-check: no existing pair violates the composite.
ROOT CAUSE: fleet code uniqueness was enforced globally (single UNIQUE(code)) and checked opco-blind, blocking a second entity from reusing a code.
FIX: composite entity-scoped uniqueness + opco-scoped app check, replacing the global constraint; files: migration + fleet duplicate-check code.
GUARD: scripts/verify-steps/NNN-verify-fleet-code-entity-scoped.mjs
LIVE PROOF: <both entities create same code + within-entity dup still rejected + Neon rows — or UNVERIFIED: constraint shape unconfirmed>
REMAINING: none defensible once confirmed; if any legacy row would violate the composite, resolve via owner-reviewed rename (never delete) before validating (tracker note).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
