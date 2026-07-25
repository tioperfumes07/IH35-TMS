<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-REGISTRY — companyScoped exclusion list (classify by opco VALUES + policy, never column presence)
**FINDING:** LST-REGISTRY (P2, controls scoping correctness) · **Lane:** NON-FINANCIAL · **Module:** lists (scoping registry). **Provenance: [GUARD-VERIFIED 2026-07-25]**

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Entity scoping) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§companyScoped) · IH35_ARCHITECTURAL_DESIGN.md (module lists/RLS) · docs/lockdown/00_LOCKED_DECISIONS.md (multi-entity isolation) · VERIFIED-LINKAGE-BACKBONE-2026-07-25.md (the source of these classifications).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): no tab change — this is the classification registry the count-spec/ribbon consume.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — codifies the backbone’s verified classification.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
The `companyScoped` classification MUST be derived from opco VALUES + policy, NOT column presence (the complaint_types + detail_types lesson). The exclusion set (catalogs that must NOT be counted/scoped per-entity) is exactly 5 tables, GUARD-verified on Neon `tiny-field-89581227` (lucia), 2026-07-25:
1. `catalogs.account_types` — no opco column → GLOBAL (RLS off). Exclude.
2. `catalogs.wo_cancellation_reasons` — no opco column → GLOBAL (RLS off). Exclude.
3. `catalogs.journal_entry_types` — no opco column → GLOBAL (global-read policy). Exclude.
4. `catalogs.tire_positions` — no opco column → GLOBAL (global-read policy). Exclude (see LST-F25).
5. `catalogs.detail_types` — HAS opco but ALL 144 rows NULL; policy `opco IS NULL OR = GUC` → SHARED-CANONICAL (scoping counts 0). Exclude.

**NOT excluded — per-entity (companyScoped:true):** `catalogs.complaint_types` — HAS opco, 295 populated / 0 null, policy `= GUC` → PER-ENTITY. It stays IN the scoped set precisely because its opco is populated (column presence alone would have wrongly excluded it earlier). **Step 1 — reproduce (Rule 10, lucia):** re-verify each of the 5 + complaint_types before freezing:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT 'account_types'  t, to_regclass('catalogs.account_types'),
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='catalogs' AND table_name='account_types' AND column_name='operating_company_id') AS has_opco;
-- repeat for wo_cancellation_reasons, journal_entry_types, tire_positions;
-- detail_types: has opco but all NULL →
SELECT count(*) total, count(operating_company_id) populated FROM catalogs.detail_types;   -- expect 144 total / 0 populated
-- complaint_types: populated → per-entity (NOT excluded)
SELECT count(*) total, count(operating_company_id) populated FROM catalogs.complaint_types; -- expect 295 / 295
ROLLBACK;
SQL
```

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the registry is a classification map over canonical `catalogs.*` tables; the 5 excluded are counted GLOBALLY (or 0 for shared-canonical), the per-entity ones under GUC. NEVER classify a RETIRE table as active (e.g. `catalogs.cancellation_reasons` is RETIRE, not in this scoped set).
2. Hub matrix: consumed by LST-F01 ribbon, LST-F20 count-spec, LST-F21 fail-loud, LST-F18 registry — each catalog’s `org.companies` relationship is decided HERE by opco VALUES + policy.
3. Cross-module (Rule 21 §1): every module that counts or scopes a catalog reads this registry so scoping is consistent.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite subsidiary-scoping correctness + RLS integrity — whether a record type is entity-scoped is a data-and-policy fact, not a schema guess; classifying by column presence produced the complaint_types/detail_types errors this registry prevents.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/classification only — codify the 5-table exclusion + the classification rule; no data change. Enforce: classification by opco VALUES + policy (never column presence) · per-entity catalogs counted under GUC · global counted globally · shared-canonical counts 0. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Encode the `companyScoped` exclusion set as exactly these 5 (`account_types`, `wo_cancellation_reasons`, `journal_entry_types`, `tire_positions`, `detail_types`), keep `complaint_types` in the scoped set, and make the classifier derive scope from live opco VALUES + policy (populated-and-`=GUC` → per-entity; all-NULL-or-no-opco → excluded). Wire the count-spec/ribbon to consult this registry.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-companyscoped-registry.mjs + scripts/verify-steps/NNN-verify-companyscoped-registry.mjs. FAIL on pre-fix main (the classifier keys off column presence — e.g. excludes complaint_types or includes detail_types); PASS on the fix (exclusion == the 5; complaint_types per-entity; classification reads opco VALUES + policy). --selftest mutates REAL source to classify by column presence, one case per assertion, and asserts the values-based registry is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: the registry excludes exactly the 5; complaint_types counts per-entity (differs between TRANSP and USMCA); the 5 count globally / 0; Step-1 re-verified; guard wired. OR "UNVERIFIED — a classification changed on prod since 2026-07-25; re-run Step-1".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: LST-REGISTRY
LANE: NON-FINANCIAL
DOD-A: PASS — single classification registry consumed by all count surfaces; no dual classifier.
DOD-B: N/A — classification config, no create wizard.
DOD-C: PASS — each catalog’s org.companies relationship declared FORWARD (scope filter) + REVERSE (row→entity) by verified values; no column-presence guess.
DOD-D: N/A — no money object.
DOD-E: PASS — GUARD-VERIFIED 2026-07-25 (the 5 + complaint_types); Step-1 re-verify before freeze.
VERIFY-1: PASS — downstream ribbon counts render honestly per classification.
VERIFY-2: N/A — not a picker.
VERIFY-3: PASS — registry→count-spec/ribbon→CANONICAL tables→correct scope (per-entity vs global)→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — complaint_types differs TRANSP vs USMCA (per-entity); the 5 identical across entities (global/shared); no cross-entity leak or false-scope.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05).
VERIFY-8: PASS — classification honors each table’s actual RLS policy (forced `=GUC`, global-read, RLS-off, or `opco IS NULL OR =GUC`).
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: companyscoped-exclusion-registry (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — classification code/config; no DDL/DML.
ROOT CAUSE: `companyScoped` was inferred from opco column presence, mis-scoping complaint_types (excluded despite populated opco) and detail_types (included despite all-NULL opco).
FIX: derive scope from live opco VALUES + policy; codify the 5-table exclusion; keep complaint_types per-entity; files: classifier/registry module.
GUARD: scripts/verify-steps/NNN-verify-companyscoped-registry.mjs
LIVE PROOF: <exclusion == 5 + complaint_types per-entity + Step-1 re-verified — or UNVERIFIED: classification drifted>
REMAINING: none defensible; if a new catalog appears, classify it by opco VALUES + policy the same way (this registry is the single source).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
