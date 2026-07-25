<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F17 — F17 · unit/trailer profiles have no safety reverse section
**FINDING:** F17 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL (reverse-linkage display; surfaced records carry their own FIN-HOLD) · **Module:** Safety ↔ Unit/Trailer profile.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Unit/Trailer profile · §Safety linkage) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Rule 21 both-way §10.3) · IH35_ARCHITECTURAL_DESIGN.md (module Fleet/Safety) · docs/lockdown/00_LOCKED_DECISIONS.md
Approved screens reviewed: docs/approved-screens/2Maintenance.png · docs/approved-screens/safety.png
Tab count check (Rule 05): design says N Unit/Trailer-profile leaves · this block changes count to N (adds a Safety reverse section — if the count changes, the approved Unit/Trailer screen is updated in the SAME commit; else section within an existing leaf). Coder confirms against the approved fleet screen.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — Rule 21 requires the reverse view.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Unit and Trailer profiles have NO reverse section for that unit/trailer's safety events (accidents, inspections, violations, damage). Safety events link forward (event→unit) but the unit/trailer profile does not drill back (Rule 21 both-way violation) — an operator on the unit page cannot see its accident/inspection/damage history, which also gates maintenance (damage→WO). **Step 1 — reproduce (Rule 10, lucia):** (a) open a unit + a trailer profile; confirm no safety reverse section. (b) Confirm the reverse FKs: `SET app.bypass_rls='lucia'; SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='safety' AND column_name IN ('unit_id','trailer_id','equipment_id');` (do not assume names — not in backbone). Confirm the unit hub: `SELECT count(*) FROM mdata.units;` (RLS forced). Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the reverse section READS canonical safety tables (accidents, inspections, violations, damage) filtered by `unit_id`/`trailer_id` = current equipment [AUDIT — confirm FKs live]; damage rows drill to `maintenance.work_orders` (backbone-verified hub). NEVER a RETIRE table (never maint.*; use maintenance.*).
2. Hub matrix (both-way): unit/trailer (`mdata.units`) ← accidents/inspections/violations/damage (reverse) — this block IS the reverse leg. Damage → `maintenance.work_orders` both ways. Entity-scoped via `org.companies`.
3. Cross-module (Rule 21 §1) — Safety §10.3: Unit/Trailer profile surfaces safety events with drill-through; damage events link to the WO (maintenance), completing event→Maintenance both-way.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys equipment profile = accident/inspection/damage history in one place; NetSuite record-with-related-lists. FMCSA equipment inspection history is unit-anchored. Rule 21 both-way.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — read-only reverse section; no data change. Enforce: operating_company_id RLS on source tables (section inherits scope) · security_invoker views · no cross-entity leak · display IDs server-generated. Non-financial display — damage→WO money lives in maintenance/accident blocks (Rule 13 where applicable), not this view.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = Unit/Trailer profiles lack the reverse read for safety events. Fix: add a Safety reverse section on the Unit AND Trailer profile that queries the canonical safety tables by the current `unit_id`/`trailer_id`, entity-scoped, with drill-through to each event; damage rows link to the associated `maintenance.work_orders` (never maint.*). Read-only; write-paths stay in the event blocks. If a unit/trailer reverse FK is missing on a source table, it is corrected in that event's forward block, not here.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-unit-trailer-safety-reverse-section.mjs` + `scripts/verify-steps/NNN-verify-unit-trailer-safety-reverse-section.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (unit/trailer profile has no safety reverse section, or not entity-scoped, or damage rows don't link the WO), PASSes on fix (section present on both, reads canonical tables by unit_id/trailer_id, entity-scoped, damage→WO drill). `--selftest` mutates a real profile copy to drop the section, asserts flagged; asserts the present shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a unit/trailer with accidents/inspections/damage shows them in the reverse section, drills to each, damage links its WO, entity-scoped; guard green. UNVERIFIED — profile components + reverse FKs pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F17
LANE: NON-FINANCIAL
DOD-A: FAIL→PASS — Unit + Trailer profiles (active) gain the reverse section; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: N/A (read view) — drill-through links resolve.
DOD-C: FAIL→PASS — unit/trailer ↔ safety events both ways (this block adds the REVERSE leg via real unit_id/trailer_id FK); damage ↔ work_orders both ways; no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial display.
DOD-E: UNVERIFIED — profile components + reverse FKs pending Step-1.
VERIFY-1: PASS — reverse section in QBO chrome (related-list style); drill both ways.
VERIFY-2: N/A — read view, no picker.
VERIFY-3: PASS — nav→Unit/Trailer profile→reverse section→API→canonical safety tables by unit_id/trailer_id (never RETIRE)→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: unit↔accident↔claim/WO; unit↔inspection; damage↔maintenance.work_orders; navigable both ways.
VERIFY-5: PASS — TRANSP + USMCA isolation; units by owner/lease; only in-entity events; no cross-entity leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Unit/Trailer leaf/section per approved screen; design updated same commit if count changes (Rule 05).
VERIFY-8: PASS — FORCE RLS on source tables; correct GUC; security_invoker views; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR; reflect on fleet module too)
ITEMS_TOUCHED: unit-profile-safety-reverse-section, trailer-profile-safety-reverse-section, damage-to-WO-drill
MIGRATE: N/A — read-only view; no DDL (reverse FKs belong to the event forward blocks).
ROOT CAUSE: Unit/Trailer profiles have no safety reverse section → Rule 21 both-way incomplete; damage→maintenance not surfaced on the equipment.
FIX: add entity-scoped, read-only Safety reverse sections on Unit + Trailer profiles querying canonical safety tables by unit_id/trailer_id, with damage→WO drill. Files: Unit profile page, Trailer profile page, safety reverse-section components, reverse query API.
GUARD: scripts/verify-steps/NNN-verify-unit-trailer-safety-reverse-section.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 component reproduce + prod reverse-section proof.
REMAINING: depends on the event blocks' unit_id/trailer_id FKs + F05 (accident capture); no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
