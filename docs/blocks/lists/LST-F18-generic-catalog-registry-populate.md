<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F18 — F18 · generic catalog registry has 1 entry
**FINDING:** F18 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists (generic catalog registry).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Catalog registry) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§generic catalogs) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): the registry drives which generic catalogs render · a 1-entry registry silently hides the rest · this block populates it to the full designed set · confirm design png count.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — registry entries mirror already-existing catalogs.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The generic catalog registry (the config/table that declares each generic catalog to the hub) has only 1 entry, so most generic catalogs are unregistered and effectively invisible/unmanaged. **Step 1 — reproduce (Rule 10, lucia):** count registry entries and list the catalogs that should be registered:
```
# 1) registry source + its single entry — read live (config table or code registry?)
rg -n "registry" app/**/lists/** config/**catalog*                 # not in backbone → verify live
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.catalog_registry') AS reg_tbl;         -- confirm name live
SELECT count(*) FROM catalogs.catalog_registry;                     -- only if non-null
ROLLBACK;
SQL
```
Registry storage (table vs code const), its schema, and the intended full catalog set are NOT in the backbone → read live. Cross-check against LST-F20 count-spec + LST-F23 catalogs_inventory for the authoritative catalog list.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.catalog_registry')` (confirm live; if code-based, the registry module) — each entry points at a canonical `catalogs.*`/`mdata.*` table. NEVER register a RETIRE table.
2. Hub matrix: registry links BOTH-WAY to `org.companies` only if per-entity (confirm opco VALUES, not column presence); each registered catalog reverse-links to its backing table.
3. Cross-module (Rule 21 §1): the registry feeds the hub and the count-spec (LST-F20); reconcile with catalogs_inventory (LST-F23).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite record-type registry — a complete, single registry declares every managed catalog; a 1-entry registry is an incomplete configuration that hides real data (no silent-missing, Full Audit Law).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — INSERT the missing registry entries (idempotent ON CONFLICT DO NOTHING); no deletion of the existing entry. Enforce: entries point at canonical tables · RLS honored on any per-entity registry · display IDs server-generated. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Populate the registry with every designed generic catalog, each entry bound to its canonical table, sourced from the authoritative list (count-spec LST-F20 ∪ catalogs_inventory LST-F23), additively and idempotently. No entry may point at a RETIRE or non-existent table (fail-loud, LST-F21).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-catalog-registry-complete.mjs + scripts/verify-steps/NNN-verify-catalog-registry-complete.mjs. FAIL on pre-fix main (registry entry count < the authoritative catalog set, OR any entry points at a table `to_regclass` = NULL / RETIRE); PASS on the fix (every authoritative catalog registered, all targets canonical + non-null). --selftest mutates REAL source to drop a registry entry / point one at a RETIRE table, one case per assertion, and asserts the complete shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: registry entry count equals the authoritative set; each target resolves non-null + canonical; hub renders all generic catalogs; guard wired; browser shows the full list. OR "UNVERIFIED — authoritative catalog set not yet finalized (depends on LST-F20/F23); Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F18
LANE: NON-FINANCIAL
DOD-A: PASS — registered catalogs now reach live components (single active path each); no hidden twins.
DOD-B: N/A — registry population, no create wizard.
DOD-C: PASS — each entry FORWARD to its canonical table + REVERSE resolvable; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — registry storage + authoritative set must be confirmed live before freeze.
VERIFY-1: PASS — hub chrome renders the full catalog set.
VERIFY-2: N/A — registry is config, not a picker.
VERIFY-3: PASS — registry→hub→routes→CANONICAL catalogs.* (never RETIRE)→entity-scoped where per-entity→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — per-entity catalogs scoped for TRANSP and USMCA; global ones documented (LST-REGISTRY); no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — catalog leaf set matches design after population (Rule 05); no invented tabs.
VERIFY-8: PASS — per-entity registry FORCE RLS + correct GUC; security_invoker; grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: catalog-registry-populate (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A if registry is code-based (const change) — else additive idempotent INSERTs (ON CONFLICT DO NOTHING), migration number > 202607960000 distinct, no hardcoded org UUID, FORCE RLS retained, grants.
ROOT CAUSE: the generic catalog registry was scaffolded with a single entry and never populated with the full designed catalog set.
FIX: additively register every authoritative generic catalog (from LST-F20/F23), each pointing at its canonical table; files: registry config/table + (conditional) seed migration.
GUARD: scripts/verify-steps/NNN-verify-catalog-registry-complete.mjs
LIVE PROOF: <registry count == authoritative set + browser — or UNVERIFIED: set not finalized>
REMAINING: depends on LST-F20/F23 finalizing the authoritative list; sequence after those (tracker note).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
