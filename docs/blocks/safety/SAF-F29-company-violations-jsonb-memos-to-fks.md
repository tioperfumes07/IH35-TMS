<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F29 — F29 · company_violations stores related_drivers / units / fine_ids as JSONB memos, not FKs
**FINDING:** F29 (P2→P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Safety (Company violations). **Provenance: [AUDIT — RE-VERIFY LIVE] — company_violations schema is not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze. Escalated P2→P1 because Law §9 memo/jsonb-ids = FAIL and fine_ids carry financial linkage.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Violations) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Law §9 real FKs both-way) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (referential integrity; fine→money is FIN).
Approved screens reviewed: docs/approved-screens/ (Safety violations surface).
Tab count check (Rule 05): no leaf change · replaces JSONB memo arrays with real junction FKs · count unchanged.
Deviations from spec: the JSONB-memo storage is the deviation from Law §9.
NEW SPEC items (Rule 01): None — corrects storage to real FKs; no new product surface.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`company_violations` stores `related_drivers`, `related_units`, and `fine_ids` as **JSONB arrays of ids (memos)** rather than real foreign keys — Law §9 explicitly rules memo/jsonb-ids = FAIL, because they are not referentially enforced, not both-way navigable, and can dangle. `fine_ids` additionally carries FINANCIAL linkage (violations→fines→money), so this escalates P2→P1 and lands FIN-HOLD. **Step 1 — reproduce (Rule 10, lucia):** schema NOT in backbone → read live:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name='company_violations' ORDER BY ordinal_position;   -- expect related_drivers/related_units/fine_ids = jsonb
-- confirm no FK constraints on those relationships:
SELECT conname, contype FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='company_violations';
ROLLBACK;
SQL
```
Classify company_violations scoping by opco VALUES + policy before asserting PER-ENTITY. [Exact column types + absence of FK constraints are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('<safety.company_violations>')` non-null; the three memo arrays become real relationships to `mdata.drivers`, `mdata.units`, and the canonical fines table (SAF-F19) via **junction tables** (violation↔driver, violation↔unit, violation↔fine) with FK constraints both ways — NEVER a RETIRE table; fine_ids never point at a memo.
2. Hub matrix: violation → `mdata.drivers` (reverse: driver shows violations) + `mdata.units` (reverse: unit shows violations) + fines (reverse: fine shows its violation) + `org.companies` (both scoped) + `accounting.*` where the fine is payable (via SAF-F21/F34, HOLD). Safety §10.3 both-way: violation ↔ Driver/Unit/OperatingCompany/Insurance/Legal/Accounting(GL via fine)/Maintenance.
3. Cross-module (Rule 21 §1): violations surface, driver/unit profiles, and the fines surface each drill both ways through the new junctions.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/QuickBooks referential integrity: relationships are FK-enforced junctions, never id-arrays in a JSON blob. US GAAP audit trail: a violation's linked fines must be referentially traceable to the money (a memo array is not auditable). Law §9 (our own): memo/jsonb-ids = FAIL.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — create junction tables + backfill FKs from the JSONB, KEEP the JSONB column (archived/deprecated with a comment) until the migration is proven; NEVER drop it or the rows. Enforce: operating_company_id RLS on violations + junctions · views WITH(security_invoker=true) · append-only audit · void-not-delete · idempotent migration (DO + IF NOT EXISTS) · display IDs server-generated. **Financial (FIN-HOLD): Rule 13** — the violation↔fine junction is build-and-HOLD; any fine→money reuses the poster (no new GL math), parallel books, QBO NEVER written, flags OFF. **Rule 19** — no reserve/holdback account created/reclassified by this junction work.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = company_violations models three real relationships (drivers, units, fines) as JSONB id-arrays, which are not FK-enforced, not both-way navigable, and can dangle (Law §9 FAIL) — and fine_ids is financial. Fix: (1) create three junction tables (violation_drivers, violation_units, violation_fines) with FK constraints to the canonical masters + FORCE RLS + operating_company_id; (2) backfill them idempotently from the existing JSONB arrays, surfacing any unresolvable id for owner review (never silent drop); (3) repoint the UI/API to the junctions (both-way EntityLink); (4) deprecate the JSONB columns via COMMENT (keep, never drop). The violation↔fine link is build-and-HOLD; fine→money stays in SAF-F21/F34 under Rule 13.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-company-violations-real-fks.mjs + scripts/verify-steps/NNN-verify-company-violations-real-fks.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (violation relationships stored as JSONB id-arrays / no FK constraints), PASS on fix (junction tables with both-way FK constraints; UI reads junctions; JSONB deprecated not dropped). --selftest mutates a REAL copy to reintroduce a jsonb-id relationship, one case per assertion, and asserts the FK-junction shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a violation's drivers/units/fines resolve through FK junctions (both-way drill, EntityLink); FK constraints exist; the JSONB columns are deprecated-but-present; backfill reconciled with any unresolved ids surfaced; guard green. UNVERIFIED — column types + FK absence + backfill reconciliation pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F29
LANE: FINANCIAL-HOLD
DOD-A: PASS — violations surface registered + mounted; junction-backed reads are the active path; no dual path.
DOD-B: UNVERIFIED→target PASS — driver/unit/fine multiselects controlled AND in the submit payload (writing junctions, not jsonb); confirm field set live.
DOD-C: UNVERIFIED→target PASS — violation ↔ driver/unit/fine via FK junctions FORWARD+REVERSE; jsonb-ids = FAIL until replaced (Law §9 — the core of this block).
DOD-D: PASS (build-and-HOLD) — the fine relationship carries the money linkage; purpose→fine→(SAF-F21/F34) poster; no silent default; flags OFF.
DOD-E: UNVERIFIED — column types + FK absence + backfill reconciliation pending Step-1.
VERIFY-1: PASS — violations edit uses ParityDrawer chrome (SAF-F25); +Create; drawer-on-drawer multiselect pickers.
VERIFY-2: PASS — driver/unit/fine pickers: canonical masters behind them, inline +Add first row, write=read (to junctions), entity-scoped, survive reload.
VERIFY-3: PASS — nav→Safety violations→UI→API→canonical junctions + masters (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: violation→fine→money (SAF-F21/F34) + violation→driver/unit, all both ways.
VERIFY-5: PASS — TRANSP + USMCA each write junctions scoped to their own masters; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — fine→money is audit-grade via the poster when flag ON; balanced JE; NO TMS→QBO write-back; control roles honored.
VERIFY-7: PASS — Safety leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on violations + all three junctions; grants correct; DELETE not granted.
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: violation-drivers-junction, violation-units-junction, violation-fines-junction, violations-jsonb-deprecate (manifest ids to resolve live) — [AUDIT].
MIGRATE: idempotent additive — CREATE 3 junction tables (IF NOT EXISTS) with FK constraints + operating_company_id + FORCE RLS; backfill from JSONB; COMMENT-deprecate the jsonb columns (NEVER drop). Number above both 202607950000 and 202607960000 (distinct, e.g. 202607970029). Dynamic org.companies (NO hardcoded UUID). REVOKE DELETE, grants, validate on throwaway only, checksum-override same PR. Unresolvable ids surfaced for owner review, never dropped.
ROOT CAUSE: company_violations stores related_drivers/related_units/fine_ids as JSONB id-arrays (memos) — not FK-enforced, not both-way, can dangle (Law §9 FAIL); fine_ids is financial.
FIX: three FK junction tables + idempotent backfill + junction-backed UI + jsonb deprecation; files: migration + violations API/components.
GUARD: scripts/verify-steps/NNN-verify-company-violations-real-fks.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 column-type confirm + prod FK junctions + reconciled backfill + both-way drill.
REMAINING: reconcile backfill (surface unresolved ids to owner); fine→money stays SAF-F21/F34 under Rule 13; JSONB kept-not-dropped; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
