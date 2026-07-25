<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# SAF-F15 — F15 · safety catalogs not bound to creator pickers (free text / hardcoded options) — universal picker law
**FINDING:** F15 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL · **Module:** Safety (all creators — catalog pickers).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Safety catalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Universal picker law · 7 clauses) · IH35_ARCHITECTURAL_DESIGN.md (module Safety) · docs/lockdown/00_LOCKED_DECISIONS.md (picker law) · sibling LST-PICKER-01
Approved screens reviewed: docs/approved-screens/safety.png · docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N Safety leaves · this block changes count to same N (bind creators to catalogs — no leaf change).
Deviations from spec: None.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Safety creators use FREE TEXT or HARDCODED option arrays for fields that should be catalog-bound pickers (e.g. inspection type, violation code, complaint type, incident type, permit type, D&A result). Free text yields dirty, unqueryable data; hardcoded options drift from the catalog and are not entity-scoped. Every such field must bind its canonical `catalogs.*` via the 7-clause picker law. **Step 1 — reproduce (Rule 10, lucia):** grep the Safety creators; enumerate fields using free text / inline hardcoded option arrays instead of a catalog picker; for each, identify the canonical catalog. Confirm the ones the backbone verifies: `SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.complaint_types;` → 295 (PER-ENTITY, RLS forced, `= GUC`). Other safety catalogs (inspection_types, violation_codes, incident_types, permit_types) are NOT in the backbone → confirm to_regclass + opco values live before binding. Prod branch br-fancy-credit-akjnd07a wins.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each catalog field binds its canonical `catalogs.<safety_catalog>` (verified/created PER-ENTITY) writing a real FK — `complaint_types` is backbone-verified PER-ENTITY; others [AUDIT — confirm live]. NEVER free text, NEVER hardcoded arrays, NEVER a RETIRE table.
2. Hub matrix (both-way): catalog value → `org.companies` (entity-scoped) + its consuming safety record (inspection/complaint/incident/permit) both ways via FK.
3. Cross-module (Rule 21 §1) — Safety §10.3 + Lists: safety creators use the shared picker capability (LST-PICKER-01); values drill both ways value↔record; Lists module manages the catalogs.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks universal +Add-new-inside-dropdown + entity-scoped reference data; the 7-clause picker law. McLeod/Alvys safety taxonomies are catalog-driven, not free text, so reports and compliance rollups are clean and per-entity.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/refactor — bind fields to catalogs; migrate free-text/hardcoded to the shared picker; no data loss (existing free-text values mapped, not dropped). Enforce: operating_company_id RLS on each catalog · security_invoker views · append-only audit on inline create · display IDs server-generated · +Create/+Book never +New/+Add. Non-financial — Rule 13/19 N/A (financial catalogs like accounts keep their own is_postable/control-role rules via config, not forked).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = safety creator fields are free text or hardcoded arrays, so data is dirty and not entity-scoped. Fix: bind each catalog field to its canonical `catalogs.*` via the shared picker capability (7-clause: catalog behind it, inline +Add first row → create wizard, write=read same table, appears+selected+survives reload, entity-scoped). Where a catalog table does not yet exist (confirm Step-1), create it PER-ENTITY (idempotent migration above both maxes, FORCE RLS) and seed from the current hardcoded options — never invent values beyond the existing set; map free-text history to catalog rows.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-safety-catalog-pickers.mjs` + `scripts/verify-steps/NNN-verify-safety-catalog-pickers.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (a safety creator field using free text / hardcoded option array instead of a catalog picker), PASSes on fix (field bound to canonical catalog via the 7-clause picker). `--selftest` mutates a real creator copy to a hardcoded array, asserts flagged; asserts the catalog-bound picker not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, each safety creator catalog field is a picker over its per-entity catalog with inline +Add first row, write=read, survives reload, entity-scoped; guard green. UNVERIFIED — full field inventory + non-backbone catalog existence pending Step-1.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F15
LANE: NON-FINANCIAL
DOD-A: PASS — safety creators are the active path; bound pickers replace free text; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — each catalog picker field controlled AND in payload (real FK).
DOD-C: PASS — value ↔ org.companies + consuming record FKs both ways; no memo/uuid-in-name/jsonb.
DOD-D: N/A — non-financial (financial catalogs keep their money rules via config, F14 postable filter).
DOD-E: UNVERIFIED — field inventory + non-backbone catalog existence pending Step-1.
VERIFY-1: PASS — creators QBO chrome; drawer-on-drawer for pickers.
VERIFY-2: FAIL→PASS — every safety catalog picker satisfies the 7 clauses via the shared capability (LST-PICKER-01): catalog behind it · inline +Add first row · opens wizard · write=read · appears+selected+survives reload · entity-scoped.
VERIFY-3: PASS — nav→Safety creator→UI→API→canonical catalogs.* (never RETIRE, never hardcoded array)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — value→consuming safety record both ways; feeds reports/rollups.
VERIFY-5: PASS — TRANSP + USMCA isolation; per-entity catalogs; no cross-entity leak.
VERIFY-6: N/A — non-financial; NO TMS→QBO write-back.
VERIFY-7: PASS — Safety leaf count unchanged.
VERIFY-8: PASS — FORCE RLS on each catalog; correct GUC; security_invoker; grants.
MODULE_PROGRESS: safety N of M (must match docs/module-completion/safety.json AFTER this PR)
ITEMS_TOUCHED: safety-creator-catalog-pickers, <catalog ids from Step-1 inventory>, (if needed) new per-entity safety catalog tables
MIGRATE: N/A where the catalog exists PER-ENTITY (e.g. complaint_types, backbone-verified). For a genuinely-missing safety catalog: idempotent migration above BOTH 202607950000 and 202607960000 (e.g. 202607970015, distinct), PER-ENTITY operating_company_id, FORCE RLS, REVOKE DELETE, dynamic org.companies NO hardcoded UUID, seed only from existing hardcoded options, grants, checksum-override same PR.
ROOT CAUSE: safety creator fields use free text / hardcoded arrays instead of catalog-bound 7-clause pickers → dirty, non-entity-scoped data.
FIX: bind each field to its canonical catalog via the shared picker; create+seed any missing catalog PER-ENTITY (no invented values). Files: safety creator components, shared picker configs, (if needed) migrations/202607970015_*.sql.
GUARD: scripts/verify-steps/NNN-verify-safety-catalog-pickers.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 field inventory + prod 7-clause proof per catalog.
REMAINING: builds on LST-PICKER-01 shared capability; SAF-F14 handles driver/unit pickers; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
