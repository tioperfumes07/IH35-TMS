<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F20 — F20 · Damage / Interchange / Cargo-claim rows have no edit / status / void actions
**FINDING:** F20 (P1) · **Lane:** NON-FINANCIAL · **Module:** Safety (Damage / Interchange / Cargo-claim tabs). **Provenance: [AUDIT — RE-VERIFY LIVE] — these Safety tables/surfaces are not in VERIFIED-LINKAGE-BACKBONE; Step-1 reproduces before freeze.**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety / Damage & claims lifecycle) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§record lifecycle / void-not-delete) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (void-not-delete invariant).
Approved screens reviewed: docs/approved-screens/ (Safety damage/interchange/cargo-claim surfaces — confirm exact PNG names live).
Tab count check (Rule 05): no leaf change · adds lifecycle actions (edit/status/void) to three existing tabs · count unchanged.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — records already exist; they lack the lifecycle controls the spec requires.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Damage, Interchange, and Cargo-claim rows are created but have **no edit, no status transition, and no void** action — a record, once made, cannot be corrected, advanced (open→in-review→resolved/closed), or voided. That violates void-not-delete lifecycle and leaves stale/erroneous rows uncorrectable. **Step 1 — reproduce (Rule 10, lucia):** table names/columns NOT in backbone → read live:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_name ILIKE '%damage%' OR table_name ILIKE '%interchange%' OR table_name ILIKE '%cargo%claim%' ORDER BY 1,2;
-- confirm a status/void column exists or must be added:
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('<damage>','<interchange>','<cargo_claim>')
   AND column_name IN ('status','voided_at','void_reason','updated_at') ORDER BY 1,2;
ROLLBACK;
SQL
# confirm the UI has no edit/status/void control on these three surfaces (read live)
rg -n "damage|interchange|cargo" app/**/safety/**
```
Classify each table's scoping by opco VALUES + policy (run the populated/null count + read the RLS policy) before asserting PER-ENTITY. [Table names, whether a status/void column exists, and the missing controls are NOT in backbone → confirm live.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('<safety.damage>')`, `<safety.interchange>`, `<safety.cargo_claim>` non-null (names to confirm live) — NEVER a RETIRE table.
2. Hub matrix: each record → `mdata.units`/`mdata.trailers` (reverse: equipment shows its damage/interchange) + `mdata.drivers` + `mdata.loads` (cargo claim ↔ load) + `org.companies` (both scoped) + `mdata.customers`/`mdata.vendors` where the counterparty is one. Safety §10.3 both-way: record ↔ Driver/Unit/OperatingCompany/Insurance(claim)/Legal(case)/Accounting(GL — economics in SAF-F21/F34)/Maintenance(WO for repair).
3. Cross-module (Rule 21 §1): unit/trailer profile, load detail, and the three Safety tabs each show the record and its status, drilling both ways; a voided record shows as voided, not missing.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
McLeod/Alvys claim & damage lifecycle (open→review→resolved/closed with void, never hard-delete) + NetSuite record-status discipline + QuickBooks void-not-delete for auditability. A corrected/voided record keeps its audit trail.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add edit + status-transition + void (void sets voided_at/void_reason, NEVER deletes); append-only audit on every mutation. Enforce: operating_company_id RLS on all three tables (once classified) · views WITH(security_invoker=true) · void-not-delete · display IDs server-generated. Not a GL-writing block (Rule 19 N/A here; any claim/damage economics is SAF-F21/F34 under Rule 13, reserve accounts untouched).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = the Damage/Interchange/Cargo-claim surfaces expose create + read only; there is no edit, status-transition, or void action, so records are immutable and uncorrectable and cannot follow their lifecycle. Fix: add (1) edit (controlled fields, append-only audit), (2) a status state-machine (open→in-review→resolved/closed, entity-scoped, server-validated transitions), and (3) void (voided_at + void_reason, void-not-delete) to each of the three surfaces. If a `status`/`voided_at` column is missing, add it via idempotent additive migration.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-safety-claim-lifecycle-actions.mjs + scripts/verify-steps/NNN-verify-safety-claim-lifecycle-actions.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (damage/interchange/cargo-claim surface exposes no edit/status/void action, or void hard-deletes), PASS on fix (all three actions present, void-not-delete, transitions server-validated). --selftest mutates a REAL surface copy to remove the void handler / make void a DELETE, one case per assertion, and asserts the void-not-delete shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a damage/interchange/cargo-claim row can be edited, advanced through its status states, and voided (row remains, marked voided with reason + audit); guard green. UNVERIFIED — table names, status/void columns, and missing-control confirmation pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F20
LANE: NON-FINANCIAL
DOD-A: PASS — the three Safety tabs are registered + mounted; lifecycle actions added to the active surface; no DUAL_PATH_OLD_ACTIVE.
DOD-B: UNVERIFIED→target PASS — every editable field controlled AND in the edit/status/void submit payload; confirm full field set live.
DOD-C: UNVERIFIED→target PASS — record ↔ unit/trailer/driver/load FKs both ways (Law §9); status/void columns real, not memo.
DOD-D: N/A — no money object here; claim/damage economics is SAF-F21/F34 (no silent default).
DOD-E: UNVERIFIED — table names + status/void columns + missing-control confirmation pending Step-1.
VERIFY-1: PASS — edit/void use ParityDrawer chrome (SAF-F25); +Create/+Book semantics; void confirmation drawer.
VERIFY-2: PASS — any FK edit uses the universal picker (drivers/units/loads), entity-scoped, write=read.
VERIFY-3: PASS — nav→Safety→UI→API→canonical `safety.*` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: claim/damage→load/unit/(insurance claim)/(WO) both ways; status/void reflected everywhere.
VERIFY-5: PASS — TRANSP + USMCA each mutate only their own entity's records; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back (deferred to SAF-F21/F34).
VERIFY-7: PASS — Safety leaf count unchanged (tab reconciliation SAF-F28); no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC + security_invoker on all three tables; grants correct; DELETE not granted (void only).
MODULE_PROGRESS: safety N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/safety.json (3 of 32) after PR; M grows per Rule 21].
ITEMS_TOUCHED: safety-damage-lifecycle, safety-interchange-lifecycle, safety-cargoclaim-lifecycle (edit/status/void) (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A if status/void columns already exist (code-only). If missing: idempotent additive ADD COLUMN status/voided_at/void_reason, above both 202607950000 and 202607960000 (distinct, e.g. 202607970020), FORCE RLS, REVOKE DELETE, grants, validate on throwaway only, checksum-override same PR.
ROOT CAUSE: Damage/Interchange/Cargo-claim surfaces expose create+read only — no edit/status/void — leaving records immutable and off their required lifecycle.
FIX: add edit + status state-machine + void-not-delete (with any missing columns) to all three surfaces; files: three Safety surface components + their APIs + additive migration if needed.
GUARD: scripts/verify-steps/NNN-verify-safety-claim-lifecycle-actions.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 table/column confirm + prod edit/status/void round-trip with audit + void-not-delete.
REMAINING: confirm status/void columns exist or migrate; claim/damage economics is SAF-F21/F34 (tracker + those block ids).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
