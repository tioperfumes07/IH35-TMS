<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F07 — F07 · Fleet creators silently drop metadata
**FINDING:** F07 (P1) · **Lane:** NON-FINANCIAL · **Module:** lists/fleet (units/trailers).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Fleet/Units) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§unit metadata) · IH35_ARCHITECTURAL_DESIGN.md (module fleet) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — no GL).
Approved screens reviewed: docs/approved-screens/8DispatchHome.png (fleet create), 2Maintenance.png (unit refs).
Tab count check (Rule 05): design says N create-form fields · this block changes count to same N (a rendered field is made to persist; no field added/removed) · matches.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — closes a controlled-but-unsubmitted field (DOD-B defect), not a new field.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The Fleet creator(s) render a metadata field the user can edit, but the submit payload omits it, so the value is silently discarded on save (DOD-B violation: rendered ≠ in payload). **Step 1 — reproduce (Rule 10, lucia):** confirm the field is controlled but dropped, then confirm the destination column exists on the canonical table:
```
# 1) rendered field not in submit payload — read the creator + its API handler
rg -n "metadata" app/**/fleet/**Create* app/**/units/**Create* app/api/**/units/**  # not in backbone → verify live
# 2) does the canonical target column exist? (unit/trailer canonical table + metadata/jsonb col)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('mdata.units')  AS units_tbl, to_regclass('mdata.trailers') AS trailers_tbl;
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='mdata' AND table_name IN ('units','trailers') AND column_name ILIKE '%metadata%';
ROLLBACK;
SQL
```
Canonical unit/trailer table names and the metadata column are NOT in the backbone → resolve live before freeze (RETIRE: never `mdata.loads`; units live under `mdata.*` per system map — confirm exact table).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('mdata.units')` / `to_regclass('mdata.trailers')` (confirm live) — NEVER `mdata.loads` (RETIRE) or a QBO mirror. Metadata persists on the same canonical row the creator writes.
2. Hub matrix: unit/trailer links BOTH-WAY to `org.companies` (opco), `identity.users` (created_by), and forward to dispatch/maintenance (`maintenance.work_orders` reference a unit) — reverse: WO/load resolve back to the unit. Metadata rides the unit row, so it inherits all four links.
3. Cross-module (Rule 21 §1): the metadata must be visible where the unit is shown — fleet list, dispatch unit picker, maintenance WO unit reference — and drill both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys asset master data integrity — a field shown on the asset create form must persist; silently dropping user input is a data-loss defect no serious TMS tolerates.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE. This adds the field to the submit payload + write; if a column is missing it is added additively (idempotent DO + IF NOT EXISTS). Enforce: `operating_company_id` RLS on the unit/trailer table · append-only audit on the write · display IDs server-generated · +Create not +New. Not financial: no GL/QBO/reserve (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Add the rendered metadata field to the creator’s submit payload and persist it to the canonical unit/trailer row (existing `metadata`/jsonb column if present per Step-1; else additive column). Every controlled field on the form is now in the payload and written — DOD-B satisfied.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-fleet-metadata-persist.mjs + scripts/verify-steps/NNN-verify-fleet-metadata-persist.mjs. FAIL on pre-fix main (the creator renders `metadata` but the submit payload/handler omits it — assert the field name is absent from the payload schema); PASS on the fix (field present in payload AND mapped to the canonical write). --selftest mutates REAL source to drop the field from the payload, one case per assertion, and asserts the corrected shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: create a unit with metadata via the creator → Neon lucia row shows the metadata persisted on the canonical unit row under the correct opco (TRANSP and USMCA) + guard wired + browser round-trip (reload shows the saved value). OR "UNVERIFIED — canonical table/column not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F07
LANE: NON-FINANCIAL
DOD-A: PASS — single active creator path writes canonical unit/trailer; no DUAL_PATH_OLD_ACTIVE.
DOD-B: PASS — the previously-dropped metadata field is now controlled AND in the submit payload AND written (this is the fix).
DOD-C: PASS — metadata rides the canonical unit row → FORWARD+REVERSE via the unit’s existing FKs (opco, created_by, dispatch/maintenance); no memo/uuid-in-name.
DOD-D: N/A — no money object; asset attribute only.
DOD-E: UNVERIFIED — canonical table name + metadata column must be confirmed live (Step-1) before freeze.
VERIFY-1: PASS — creator chrome unchanged; +Create preserved.
VERIFY-2: N/A — not a picker surface (unit itself is the picker target elsewhere; unaffected here).
VERIFY-3: PASS — nav→fleet create→API→CANONICAL mdata.units/trailers (never mdata.loads)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain created by this field.
VERIFY-5: PASS — TRANSP and USMCA units each scoped by opco; units-by-owner/lease unaffected; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — field count unchanged (Rule 05); no invented tabs; design png unaffected.
VERIFY-8: PASS — write under correct opco GUC; FORCE RLS; grants unchanged.
MODULE_PROGRESS: fleet N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/fleet.json after PR].
ITEMS_TOUCHED: fleet-create-metadata (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A if `metadata` column exists (Step-1 confirms) — else additive idempotent column add above main max, number > 202607960000 and distinct, FORCE RLS retained, no hardcoded org UUID.
ROOT CAUSE: creator form field is controlled in the UI but never added to the submit payload / write mapping, so save discards it.
FIX: add metadata to the submit payload + persist to the canonical unit/trailer row; files: fleet/unit creator component + its API handler (resolve in Step-1).
GUARD: scripts/verify-steps/NNN-verify-fleet-metadata-persist.mjs
LIVE PROOF: <Neon row with persisted metadata + browser reload — or UNVERIFIED: table/column unconfirmed>
REMAINING: none defensible once canonical column confirmed; if both units and trailers have separate creators, both must be fixed (one PR).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
