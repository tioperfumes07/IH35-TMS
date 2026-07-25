<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F26 — F26 · QuickCreate kind=category labeled "category" but writes a GL/chart-of-accounts row
**FINDING:** F26 (P2, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** lists/QuickCreate ↔ accounting (CoA).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§QuickCreate) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§quick-add targets) · IH35_ARCHITECTURAL_DESIGN.md (module lists/accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (CoA is locked-financial; a mislabeled write into the CoA is a financial-integrity defect).
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png, 9Lists_and_catalogs.png.
Tab count check (Rule 05): no tab change — corrects a QuickCreate target/label mismatch.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — restores correct label↔target alignment.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
QuickCreate `kind=category` is labeled “category” in the UI but its handler writes a GL / Chart-of-Accounts row into `catalogs.accounts` — so a user creating a “category” silently creates a CoA account (a financial-integrity + audit defect: unintended accounts polluting the CoA). **Step 1 — reproduce (Rule 10, lucia):** confirm the label vs the write target:
```
# 1) QuickCreate kind=category handler + its write target — read live
rg -n "QuickCreate|kind.*category|category" app/**/QuickCreate* app/api/**/quick* app/**/lists/**   # not in backbone → verify live
# 2) prove the target: does the handler INSERT into catalogs.accounts (CoA) vs an intended category table?
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.accounts') AS coa, to_regclass('catalogs.expense_categories') AS categories;  -- backbone: both PER-ENTITY
-- inspect recently-created rows that look like categories mislanded in accounts (do NOT mutate here)
ROLLBACK;
SQL
```
The QuickCreate handler’s label→target mapping is NOT in the backbone → read live. Backbone-verified: `catalogs.accounts` (CoA, PER-ENTITY, 1392) and `catalogs.expense_categories` (PER-ENTITY, 9) are DISTINCT canonical tables — determine which the “category” label is meant to write.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: the label and the write MUST agree — if the user means a category, write the canonical category table (`catalogs.expense_categories` or the design-intended category catalog, confirm live); if the design intends an account, relabel the control “Account” and open the CoA wizard. NEVER silently write `catalogs.accounts` under a “category” label.
2. Hub matrix: the correct target links BOTH-WAY to `org.companies` (opco); a category links to items/expenses, an account links to `accounting.journal_entries`/bills. Reverse resolution must match the label.
3. Cross-module (Rule 21 §1): QuickCreate feeds whichever surface the label promises; the CoA (LST-F08) must not accumulate mislabeled rows.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite CoA integrity + truthful UI — a control labeled “category” must not create a GL account; unintended CoA rows corrupt financial reporting and audit trails (an auditor sees phantom accounts). US GAAP account-integrity; no misleading financial writes.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/corrective — fix the label/target mapping going forward; already-created mislabeled CoA rows are NOT auto-deleted or auto-reclassified. **Rule 13 (FINANCIAL-HOLD):** no new GL math, reuse posters, parallel books untouched, QBO NEVER written, flags default OFF. **Rule 19:** any existing miswritten account rows — including anything reserve/holdback/retainage-adjacent — are OWNER-MANUAL to reclassify/deactivate; this block must not create/merge/reclassify/deactivate account rows. Enforce: FORCE RLS · security_invoker · append-only audit · display IDs server-generated.

## THE FIX (requirement-level; no invented unverified SQL)
Align QuickCreate `kind=category` so the label and the canonical write target agree: point the handler at the intended category catalog (confirm in Step-1) OR relabel to “Account” and route to the CoA wizard — whichever the design specifies. New “category” quick-creates land on the correct table. Existing mislabeled CoA rows are surfaced to the owner for manual reclassification (Rule 19), never auto-touched.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-quickcreate-category-target.mjs + scripts/verify-steps/NNN-verify-quickcreate-category-target.mjs. FAIL on pre-fix main (assert `kind=category` writes `catalogs.accounts` while labeled “category”); PASS on the fix (label matches target: category→category catalog, or relabeled Account→CoA). --selftest mutates REAL source to reintroduce the label/target mismatch, one case per assertion, and asserts the aligned shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: creating a “category” via QuickCreate writes the canonical category table (NOT the CoA) under correct opco for TRANSP and USMCA; the CoA gains no row from a category quick-create; guard wired; browser round-trip; existing mislabeled rows enumerated in an owner-manual list. OR "UNVERIFIED — intended category target not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F26
LANE: FINANCIAL-HOLD
DOD-A: PASS — QuickCreate category has one active, correctly-targeted path; no dual/mislabeled path.
DOD-B: PASS — the category field is controlled AND in payload AND written to the CORRECT canonical table.
DOD-C: PASS — the created record links FORWARD+REVERSE to the target its label promises; no memo/uuid-in-name; CoA not polluted.
DOD-D: PASS — purpose→economics: “category” picks the category object (not a GL account); no silent default into the CoA (this is the fix).
DOD-E: UNVERIFIED — the design-intended category target must be confirmed live before freeze.
VERIFY-1: PASS — QuickCreate chrome truthful; +Create opens the correct wizard.
VERIFY-2: PASS — universal picker law: the category picker reads/writes the same canonical category table; inline +Add new category first row; entity-scoped; not the CoA.
VERIFY-3: PASS — QuickCreate→API→CORRECT CANONICAL table (category catalog, not CoA/RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — the record resolves through its intended chain; CoA→JE chain not spuriously created.
VERIFY-5: PASS — TRANSP and USMCA each write their own category rows (opco `= GUC`); no cross-entity leak.
VERIFY-6: PASS — no GL math added; balanced-JE poster unchanged; NO TMS→QBO write-back; reserve/holdback accounts untouched (Rule 19); mislabeled CoA rows left for owner-manual reclass.
VERIFY-7: PASS — no tab change (Rule 05); label corrected.
VERIFY-8: PASS — target table FORCE RLS + correct GUC + security_invoker + grants.
MODULE_PROGRESS: accounting N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/accounting.json after PR].
ITEMS_TOUCHED: quickcreate-category-target (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — handler/label mapping change; no DDL. Existing mislabeled CoA rows are OWNER-MANUAL (Rule 19) — no automated DML in this block.
ROOT CAUSE: QuickCreate `kind=category` handler was wired to INSERT into `catalogs.accounts` (CoA) while the control is labeled “category”, silently creating GL accounts.
FIX: repoint the handler to the canonical category catalog (or relabel to Account→CoA per design); files: QuickCreate handler + control label + owner-manual list of existing mislabeled rows.
GUARD: scripts/verify-steps/NNN-verify-quickcreate-category-target.mjs
LIVE PROOF: <category quick-create writes category table, CoA unchanged, Neon rows + browser — or UNVERIFIED: intended target unconfirmed>
REMAINING: owner-manual reclassification/cleanup of already-created mislabeled CoA rows (Rule 19; tracker + future owner-gated block id) — NEVER auto-reclassify/delete accounts.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
