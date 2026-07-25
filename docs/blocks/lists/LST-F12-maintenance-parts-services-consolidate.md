<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F12 — F12 · maintenance parts 4-way / services 2-way split-brain
**FINDING:** F12 (P1) · **Lane:** NON-FINANCIAL · **Module:** maintenance (parts + services catalogs).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Maintenance parts/services) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§maintenance canonical) · IH35_ARCHITECTURAL_DESIGN.md (module maintenance) · docs/lockdown/00_LOCKED_DECISIONS.md (parts/services feed WO cost → confirm no GL math changes here; catalog consolidation only).
Approved screens reviewed: docs/approved-screens/2Maintenance.png.
Tab count check (Rule 05): design says ONE parts catalog + ONE services catalog · today parts resolve 4 ways and services 2 ways (split-brain) · this block consolidates to one canonical each · leaf count unchanged, source unified.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — consolidation to the canonical table already implied by the linkage law (maintenance.* canonical, maint.* RETIRE).

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Maintenance parts read/write from up to 4 different tables/sources and services from 2 (split-brain): the same logical catalog diverges by surface, so counts and picks disagree and some writes land on the RETIRE `maint.*` schema. **Step 1 — reproduce (Rule 10, lucia):** enumerate every parts/services source and prove canonical vs RETIRE:
```
# 1) every parts/services read+write source across surfaces — read live
rg -n "parts|services" app/**/maintenance/** app/api/**/maintenance/**   # not in backbone → verify live
# 2) canonical maintenance.* exists; maint.* is RETIRE (never write)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('maintenance.parts')  AS m_parts,  to_regclass('maint.parts')  AS retire_parts,
       to_regclass('maintenance.services') AS m_services, to_regclass('maint.services') AS retire_services;
-- row density per candidate (bypass so RLS 0-count does not mask)
SELECT 'maintenance.parts' t, count(*) FROM maintenance.parts
UNION ALL SELECT 'maintenance.services', count(*) FROM maintenance.services;
ROLLBACK;
SQL
```
The 4 part-sources / 2 service-sources are NOT enumerated in the backbone → read live. Backbone RETIRE reminder: `maint.*` → `maintenance.*` (never write `maint.*`).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('maintenance.parts')` and `to_regclass('maintenance.services')` (confirm live) — RETIRE `maint.parts`/`maint.services`: never write. All 4/2 surfaces repoint here.
2. Hub matrix: parts/services link BOTH-WAY to `org.companies` (opco) and to `maintenance.work_orders` (WO line references a part/service) — reverse: a WO line resolves its canonical part/service. Downstream WO cost → bill (`accounting.bills`) uses the same canonical id.
3. Cross-module (Rule 21 §1): every maintenance surface (parts catalog, services catalog, WO line editor, vendor part cross-ref) reads/writes the one canonical table and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod maintenance master-data — one authoritative parts catalog and one services catalog per entity; split-brain sources corrupt WO costing and inventory. Single-source-of-truth catalog integrity.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/consolidation only — repoint all surfaces to canonical `maintenance.*`; backfill/migrate any rows still living on RETIRE `maint.*` into canonical additively (INSERT ... ON CONFLICT DO NOTHING), then leave `maint.*` read-only/archived — NEVER DROP/DELETE/TRUNCATE `maint.*` in this block (retire is a later, owner-gated step). Enforce: `operating_company_id` RLS on `maintenance.*` · append-only audit · void-not-delete · display IDs server-generated. Not financial (Rule 19 N/A) — but WO cost consumes these ids, so consolidation must be lossless.

## THE FIX (requirement-level; no invented unverified SQL)
Consolidate all parts read/write paths (the 4) to canonical `maintenance.parts` and all services paths (the 2) to `maintenance.services`, under GUC. Additively backfill any RETIRE `maint.*` rows into canonical (idempotent, conflict-safe) so no part/service is lost, then repoint every surface. Never write `maint.*` again.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-maintenance-catalog-single-source.mjs + scripts/verify-steps/NNN-verify-maintenance-catalog-single-source.mjs. FAIL on pre-fix main (asserts >1 distinct parts source OR any write targets `maint.parts`/`maint.services`); PASS on the fix (exactly one canonical `maintenance.parts` + one `maintenance.services` source across surfaces; zero `maint.*` writes). --selftest mutates REAL source to re-add a second source / a `maint.*` write, one case per assertion, and asserts the consolidated shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: every maintenance surface reads/writes `maintenance.parts`/`maintenance.services`; a part created on one surface appears on all; no `maint.*` write path remains; Neon lucia parity (canonical counts ≥ pre-fix union, none lost) for TRANSP and USMCA; guard wired; browser round-trip. OR "UNVERIFIED — the 4/2 sources not yet fully enumerated; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F12
LANE: NON-FINANCIAL
DOD-A: PASS (post-fix) — single active parts surface + single services surface; no DUAL_PATH_OLD_ACTIVE across the 4/2.
DOD-B: PASS — part/service create fields controlled AND in payload AND written to canonical.
DOD-C: PASS — part/service↔WO line FORWARD+REVERSE via canonical FK; no split-brain, no uuid-in-name.
DOD-D: N/A here — WO cost economics downstream (uses the same canonical id).
DOD-E: UNVERIFIED — full enumeration of the 4 part-sources / 2 service-sources must be read live before freeze.
VERIFY-1: PASS — maintenance list chrome + +Create part/service; drawer.
VERIFY-2: PASS — part/service picker on WO lines reads/writes the SAME canonical table; inline +Add new first row; entity-scoped.
VERIFY-3: PASS — nav→maintenance→UI→API→CANONICAL maintenance.parts/services (never maint.*)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — part→WO→(WO cost)→bill chain resolves on canonical ids F+R.
VERIFY-5: PASS — TRANSP and USMCA parts/services opco-scoped; no cross-entity leak.
VERIFY-6: N/A — no GL math in consolidation; NO TMS→QBO write-back; WO costing poster unchanged.
VERIFY-7: PASS — parts/services leaf count unchanged (Rule 05); no invented tabs; sources unified.
VERIFY-8: PASS — canonical tables FORCE RLS, correct GUC, security_invoker, grants; RETIRE `maint.*` write revoked.
MODULE_PROGRESS: maintenance N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/maintenance.json after PR].
ITEMS_TOUCHED: maintenance-parts-consolidate, maintenance-services-consolidate (manifest ids to resolve live) — [AUDIT].
MIGRATE: additive backfill only if RETIRE `maint.*` holds rows not in canonical — idempotent INSERT ... ON CONFLICT DO NOTHING into `maintenance.*`, migration number > 202607960000 distinct, FORCE RLS retained, dynamic org.companies (no hardcoded UUID), REVOKE DELETE, validate on throwaway only; NEVER DROP `maint.*` here.
ROOT CAUSE: parts/services were implemented across 4/2 divergent sources (incl. RETIRE `maint.*`) instead of one canonical `maintenance.*` per catalog.
FIX: repoint all surfaces to canonical `maintenance.parts`/`maintenance.services`, additively backfill RETIRE rows, revoke `maint.*` writes; files: maintenance surfaces + APIs + (conditional) backfill migration.
GUARD: scripts/verify-steps/NNN-verify-maintenance-catalog-single-source.mjs
LIVE PROOF: <one source across surfaces + Neon parity (no loss) + browser — or UNVERIFIED: sources not fully enumerated>
REMAINING: physical retirement/DROP of `maint.*` is a later owner-gated block (tracker + future block id); this block only stops writes and consolidates reads.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
