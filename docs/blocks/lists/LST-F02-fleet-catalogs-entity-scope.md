<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F02 — F02 · 10 entity-blind fleet catalogs → additive per-entity conversion
**FINDING:** F02 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Lists & Catalogs (Fleet/Maintenance).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Fleet catalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Per-entity isolation) · IH35_ARCHITECTURAL_DESIGN.md (module Maintenance/Fleet) · docs/lockdown/00_LOCKED_DECISIONS.md (RLS isolation law)
Approved screens reviewed: docs/approved-screens/2Maintenance.png · docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (schema/RLS conversion — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Finding: 10 fleet catalogs are entity-blind — no `operating_company_id`, RLS `USING(true)` — so every entity reads one shared list, violating tenant isolation. The 10 specific tables are NOT enumerated in VERIFIED-LINKAGE-BACKBONE (backbone confirms the *shape* of globals like `journal_entry_types`, `tire_positions`, `account_types`, `wo_cancellation_reasons`), so the exact set must be reproduced before freeze. **Step 1 — reproduce (Rule 10, lucia):** on Neon `tiny-field-89581227` prod `br-fancy-credit-akjnd07a`, one txn `SET app.bypass_rls='lucia'; SELECT c.relname, (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema='catalogs' AND col.table_name=c.relname AND col.column_name='operating_company_id') AS has_opco, pol.polqual::text AS policy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy pol ON pol.polrelid=c.oid WHERE n.nspname='catalogs' AND c.relkind='r' ORDER BY 1;` — the fleet catalogs returning `has_opco=0` AND policy `true` are the 10. Classify each by opco VALUES + policy (backbone method), NEVER by column presence.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each of the 10 `to_regclass('catalogs.<fleet_catalog>')` non-null — converted in place, NEVER retired/duplicated. Do NOT touch RETIRE `maint.*` (use `maintenance.*`).
2. Hub matrix: each fleet catalog → `org.companies` (new operating_company_id, both-way) forward + reverse; consumers `mdata.units` / `mdata.trailers` / `maintenance.work_orders` link both ways to their fleet-catalog value.
3. Cross-module (Rule 21 §1): Maintenance work-order forms, Unit/Trailer profile, Fleet setup lists — each shows entity-scoped list and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite subsidiary-level list isolation + McLeod fleet-catalog-per-company; RLS tenant-isolation law — no entity may read another's fleet catalog. Additive migration matches QuickBooks/NetSuite "never destroy reference data" discipline.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE. Conversion adds `operating_company_id` (nullable), backfills the dynamic primary org (NO hardcoded UUID), then NOT NULL; existing rows preserved. Enforce: operating_company_id RLS on every table touched · views WITH(security_invoker=true) · lockstep INSERT · append-only audit on mutation · idempotent migration (DO + IF NOT EXISTS) · display IDs server-generated · REVOKE DELETE + grants. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; no GL math introduced; parallel books; QBO NEVER written; flags default OFF. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL only: this migration never creates/imports/reclassifies/merges/deactivates them (fleet catalogs are unrelated to those accounts — assert no overlap).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = fleet catalogs shipped without `operating_company_id` and with an open `USING(true)` policy, giving one global list to all entities. Fix (additive, per catalog): (1) add nullable `operating_company_id`; (2) backfill to the dynamically-resolved primary org (no hardcoded UUID); (3) set NOT NULL; (4) replace the per-entity UNIQUE with `(operating_company_id, <natural key>)`; (5) `ALTER TABLE … FORCE ROW LEVEL SECURITY` with a `company_scope` policy `operating_company_id = current GUC`; (6) REVOKE DELETE, re-grant SELECT/INSERT/UPDATE to app roles; (7) seed parity so every entity (TRANSP + USMCA) has the full canonical list. Reuse existing poster — no new GL math (FIN-HOLD).

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-fleet-catalog-entity-scope.mjs` + `scripts/verify-steps/NNN-verify-fleet-catalog-entity-scope.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (catalog has no opco / policy `true` / global UNIQUE), PASSes on fix (opco NOT NULL, FORCE RLS company_scope, per-entity UNIQUE, DELETE revoked). `--selftest` mutates a real catalog copy to the entity-blind shape, asserts it is flagged, and asserts the converted shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: each of the 10 catalogs shows opco 0-NULL, FORCE RLS company_scope policy, per-entity UNIQUE, DELETE revoked; parity seed gives TRANSP + USMCA identical canonical lists; guard green; picker in Maintenance UI shows only the current entity's rows. UNVERIFIED — exact 10-table set until Step-1 reproduce runs live.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F02
LANE: FINANCIAL-HOLD
DOD-A: PASS — Maintenance/Fleet list routes registered + components mounted; no DUAL_PATH_OLD_ACTIVE; converted table is the live active path.
DOD-B: PASS — every rendered picker field (entity-scoped value) is controlled AND in the submit payload of consuming WO/unit forms.
DOD-C: PASS — fleet catalog ↔ org.companies + units/trailers/work_orders FKs both ways; no memo/uuid-in-name/jsonb-id linkage.
DOD-D: N/A — catalogs are reference lists; economics live in the consuming WO/expense, unchanged here (build-and-HOLD).
DOD-E: UNVERIFIED — exact 10-table set pending live Step-1 reproduce; conversion pattern verified against backbone method.
VERIFY-1: N/A — no new QBO chrome; fleet list panels keep existing visual shell.
VERIFY-2: PASS — universal picker law upheld: catalog behind each picker, inline +Add first row, write=read on the same converted table, entity-scoped, survives reload.
VERIFY-3: PASS — nav→Fleet list route→UI→API→`catalogs.<fleet_catalog>` (canonical, never RETIRE `maint.*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/at-fault/bill+payment chain in a catalog scoping change; consuming WO chains unchanged.
VERIFY-5: PASS — TRANSP + USMCA each get full parity seed; FORCE RLS blocks cross-entity leak; drivers-as-vendors/units-by-owner unaffected.
VERIFY-6: PASS (build-and-HOLD) — no JE created; poster reused; flags OFF; NO TMS→QBO write-back; economics remain in consumers.
VERIFY-7: PASS — Lists & Catalogs / Maintenance leaf count unchanged; no invented/removed tab.
VERIFY-8: PASS — FORCE RLS + company_scope GUC policy on all 10; security_invoker views; REVOKE DELETE; grants re-issued.
MODULE_PROGRESS: lists-catalogs N of M (must match docs/module-completion/lists-catalogs.json AFTER this PR)
ITEMS_TOUCHED: <10 fleet catalog ids from Step-1 reproduce>
MIGRATE: number strictly above main max (ledger max 202607950000, main unapplied 202607960000 — pick e.g. 202607970001, distinct) / idempotent (DO + IF NOT EXISTS) / dynamic org.companies primary — NO hardcoded UUID / FORCE RLS / REVOKE DELETE / grants / validate on throwaway only / checksum-override same PR.
ROOT CAUSE: fleet catalogs created without operating_company_id and with USING(true) — one global list served to all entities.
FIX: additive add-opco → backfill dynamic primary → NOT NULL → per-entity UNIQUE → FORCE RLS company_scope → REVOKE DELETE + grants → parity seed. Files: migrations/202607970001_*.sql, catalog picker API + guard.
GUARD: scripts/verify-steps/NNN-verify-fleet-catalog-entity-scope.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 live enumeration + post-migration lucia rows (opco 0-NULL, FORCE RLS, per-entity UNIQUE).
REMAINING: exact 10-table list is the first live step; no owner-approved deferral needed.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
