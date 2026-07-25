<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F08 — F08 · Chart of Accounts dual path (/chart-of-accounts vs /catalogs/accounts DEFAULT fallback)
**FINDING:** F08 (P2) · **Lane:** FINANCIAL-HOLD · **Module:** accounting/lists (Chart of Accounts).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Chart of Accounts) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§CoA route) · IH35_ARCHITECTURAL_DESIGN.md (module accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (CoA is locked-financial: single canonical CoA surface).
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png, 9Lists_and_catalogs.png.
Tab count check (Rule 05): design says ONE CoA leaf · today two routes resolve to CoA (a DUAL_PATH_OLD_ACTIVE) · this block returns count to ONE active leaf (archive the old) · needs same-commit design confirmation that only one CoA nav leaf remains.
Deviations from spec: None — spec mandates one CoA.
NEW SPEC items (Rule 01): None.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Two live routes render the Chart of Accounts — `/chart-of-accounts` and `/catalogs/accounts` — with a DEFAULT fallback keeping the old path active (DUAL_PATH_OLD_ACTIVE). Both read/write `catalogs.accounts`, so a stale/second surface can diverge in behavior. **Step 1 — reproduce (Rule 10, lucia):** confirm both routes are mounted+active and both target the one canonical CoA table:
```
# 1) both routes registered + a DEFAULT fallback keeping old active — read live
rg -n "chart-of-accounts|catalogs/accounts|DUAL_PATH_OLD_ACTIVE|DEFAULT" app/**/route* app/**/accounts/**  # not in backbone → verify live
# 2) canonical CoA is single + per-entity (backbone: accounts 1392 pop/0 null, = GUC)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('catalogs.accounts') AS coa, count(*) FILTER (WHERE operating_company_id IS NULL) AS null_opco FROM catalogs.accounts;
ROLLBACK;
SQL
```
Route names/DEFAULT flag are NOT in the backbone → verify live. Canonical CoA `catalogs.accounts` IS backbone-verified (PER-ENTITY `= GUC`, 1392/0-null).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.accounts')` (single CoA, PER-ENTITY, backbone-verified) — NEVER a second/legacy accounts table, NEVER a QBO mirror (`mdata.qbo_accounts` is read-only mirror, not the app CoA).
2. Hub matrix: `catalogs.accounts` links BOTH-WAY to `org.companies` (opco), and is FK-referenced by `accounting.journal_entries` (JE lines), `accounting.bills`/`bill_lines`, `catalogs.items` (income/expense account), account role bindings (LST-F09) — reverse: every posting resolves to a CoA row. One CoA surface preserves these links; a dual path risks a divergent write surface.
3. Cross-module (Rule 21 §1): CoA is referenced by accounting posting, items catalog, QuickCreate (LST-F26). All must point to the single surviving route; drill both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite single Chart of Accounts — exactly one authoritative CoA surface per entity; a duplicate/fallback route is an audit and data-integrity risk (a auditor must see one CoA). US GAAP account integrity.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/archival only — ARCHIVE the old route (deactivate the DEFAULT fallback, redirect to the canonical route), NEVER delete `catalogs.accounts` rows or DROP the table. Enforce: `operating_company_id` RLS on `catalogs.accounts` · view/security_invoker · display IDs server-generated · +Create not +New. **Rule 13 (FINANCIAL-HOLD):** no new GL math — this is route consolidation, reuse the existing poster; parallel books untouched; QBO NEVER written; flags default OFF. **Rule 19:** reserve/holdback/retainage accounts are OWNER-MANUAL — this block must not create/merge/reclassify/deactivate any account row, only consolidate the route.

## THE FIX (requirement-level; no invented unverified SQL)
Kill DUAL_PATH_OLD_ACTIVE: designate `/catalogs/accounts` (or the design-approved canonical CoA route — confirm in Step-1 which one the design png names) as the single active route; archive the other by 301-redirecting it to the canonical route and removing the DEFAULT fallback that keeps the old surface live. No account data is created, merged, or removed.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-coa-single-route.mjs + scripts/verify-steps/NNN-verify-coa-single-route.mjs. FAIL on pre-fix main (asserts BOTH CoA routes resolve to a live component OR the DUAL_PATH_OLD_ACTIVE/DEFAULT flag is present); PASS on the fix (one active CoA route, the other redirects; no DEFAULT fallback). --selftest mutates REAL source to re-add the second live route, one case per assertion, and asserts the single-route shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: only one CoA route serves a component; the archived route 301-redirects; `catalogs.accounts` unchanged (same 1392/0-null under GUC) for TRANSP and USMCA; guard wired; browser: both URLs land on the one canonical CoA. OR "UNVERIFIED — which route is canonical per design png not yet confirmed".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F08
LANE: FINANCIAL-HOLD
DOD-A: PASS (post-fix) — single active CoA route; DUAL_PATH_OLD_ACTIVE removed; old route redirects (archived, not deleted).
DOD-B: N/A — no create wizard changed; route consolidation only.
DOD-C: PASS — CoA FKs (JE lines, bills, items, role bindings) FORWARD+REVERSE preserved on the single surface; no memo/uuid-in-name.
DOD-D: N/A — no money object selected here; posting unchanged.
DOD-E: UNVERIFIED — which of the two routes is the design-canonical CoA must be confirmed against the approved png (Step-1) before freeze.
VERIFY-1: PASS — QBO CoA chrome preserved on the surviving route (+Create account, drawer).
VERIFY-2: PASS — account picker everywhere reads/writes the same `catalogs.accounts`; inline +Add new account opens the CoA wizard on the canonical route; entity-scoped.
VERIFY-3: PASS — nav→single CoA route→UI→API→CANONICAL catalogs.accounts (never qbo mirror/legacy)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — CoA→JE/bill/item chains resolve on one surface F+R.
VERIFY-5: PASS — TRANSP and USMCA each see their own CoA (opco `= GUC`); no cross-entity leak.
VERIFY-6: PASS — economics unchanged; existing balanced-JE poster reused; NO TMS→QBO write-back; reserve accounts untouched (Rule 19).
VERIFY-7: PASS — CoA leaf count returns to ONE (Rule 05); design confirmed same commit; no invented tabs.
VERIFY-8: PASS — `catalogs.accounts` FORCE RLS, `= GUC`, security_invoker on any CoA view; grants unchanged.
MODULE_PROGRESS: accounting N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/accounting.json after PR].
ITEMS_TOUCHED: coa-single-route (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — route/redirect change only; no DDL/DML on `catalogs.accounts` (Rule 19 forbids account mutation here).
ROOT CAUSE: a legacy CoA route left active via a DEFAULT fallback (DUAL_PATH_OLD_ACTIVE) alongside the canonical CoA route.
FIX: archive/redirect the legacy route, remove the DEFAULT fallback, keep one active CoA surface; files: CoA route config + both page components (resolve in Step-1).
GUARD: scripts/verify-steps/NNN-verify-coa-single-route.mjs
LIVE PROOF: <both URLs resolve to one CoA + redirect + unchanged CoA counts — or UNVERIFIED: canonical route per design unconfirmed>
REMAINING: none defensible once design-canonical route confirmed; any account-row cleanup is OWNER-MANUAL (Rule 19), out of scope for this block.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
