<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F01 — F01 · /lists hub ribbon counts read a QBO-remote view (understated, entity-blind)
**FINDING:** F01 (P1) · **Lane:** NON-FINANCIAL · **Module:** lists/catalogs.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Lists hub) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§catalog ribbon) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A — no GL math changes; count display only).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): design says N ribbon tiles · this block changes count to same N tiles (numbers only, no tile add/remove) · matches.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — restores intended per-entity counts; no new surface.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
The /lists hub ribbon renders per-catalog counts from a single QBO-remote projection view, so counts are understated (QBO subset) and entity-blind (no `operating_company_id` filter under the caller GUC). **Step 1 — reproduce (Rule 10, lucia):** find the count source, then compare it to the canonical per-entity truth on prod branch `br-fancy-credit-akjnd07a` (Neon `tiny-field-89581227`), RLS 0-count landmine — bypass in the same txn:
```
# 1) locate the ribbon count source (view/endpoint) — not in backbone → verify live
rg -n "count" app/**/lists/**ribbon* app/api/**/lists/** ; rg -n "qbo_" <the count query>
# 2) canonical per-entity counts (backbone-verified tables) vs whatever the ribbon shows
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia'; SET LOCAL app.current_company='<GUC>';
SELECT 'accounts' t, count(*) FROM catalogs.accounts        WHERE operating_company_id = current_setting('app.current_company')::uuid
UNION ALL SELECT 'items',              count(*) FROM catalogs.items              WHERE operating_company_id = current_setting('app.current_company')::uuid
UNION ALL SELECT 'complaint_types',    count(*) FROM catalogs.complaint_types    WHERE operating_company_id = current_setting('app.current_company')::uuid
UNION ALL SELECT 'load_cancel_reasons',count(*) FROM catalogs.load_cancellation_reasons WHERE operating_company_id = current_setting('app.current_company')::uuid
UNION ALL SELECT 'expense_categories', count(*) FROM catalogs.expense_categories WHERE operating_company_id = current_setting('app.current_company')::uuid;
ROLLBACK;
SQL
```
Backbone anchors (GUARD-VERIFIED 2026-07-25): accounts 1392 pop/0 null, items 236, complaint_types 295, load_cancellation_reasons 63, expense_categories 9 — all PER-ENTITY `= GUC`. If the ribbon shows fewer/global numbers, defect confirmed.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: read-only against `to_regclass('catalogs.accounts')`, `catalogs.items`, `catalogs.complaint_types`, `catalogs.load_cancellation_reasons`, `catalogs.expense_categories` (+ every catalog in the count-spec, LST-F20) — all non-null per backbone; NEVER the QBO-remote view, NEVER a RETIRE table (`mdata.qbo_*`, `catalogs.cancellation_reasons`).
2. Hub matrix: each tile links to `org.companies` (the GUC that scopes the count) BOTH-WAY (forward: tile→catalog rows filtered by opco; reverse: each catalog row counted under exactly one company). No cross-hub FK — this is a read/aggregate surface.
3. Cross-module (Rule 21 §1): each ribbon tile deep-links into its catalog list route; the list route’s own row count MUST equal the ribbon number (same canonical source, same GUC).
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite list-count behavior — a list badge counts the entity’s own active records from the same table the list renders, never a stale remote sync mirror. Matching this gives trustworthy, entity-isolated counts (RLS correctness).

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE; this is a read-path repoint only, no data mutation. Enforce: counts computed under `operating_company_id` GUC · any view touched WITH(security_invoker=true) · production never serves fake/understated data (the core defect). Not financial: no GL, no QBO write-back, no reserve touch (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Repoint each ribbon tile’s count to a per-catalog `count(*)` over the canonical `catalogs.*` table filtered by the caller’s `operating_company_id` GUC (driven by the LST-F20 count-spec so coverage stays complete and LST-F21 fails loud on a missing table). Remove the QBO-remote view as the count source. No hardcoded numbers anywhere.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-lists-ribbon-counts.mjs + scripts/verify-steps/NNN-verify-lists-ribbon-counts.mjs (NEVER edit package.json/ci.yml/locked-guards). FAIL on pre-fix main (asserts the ribbon source string is a `qbo_*`/remote view, or that a hardcoded numeric literal appears as a tile count); PASS on the fix (source is canonical `catalogs.*` + GUC filter, zero numeric literals). --selftest mutates REAL source to reintroduce a hardcoded/qbo count, one case per assertion, and asserts the corrected canonical-count shape is NOT flagged. Wire the guard to the exact surface the value renders on (the ribbon component/endpoint), not a sibling.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof required: ribbon component repointed + endpoint returns per-entity counts matching the Step-1 canonical query for BOTH TRANSP and USMCA GUCs (no cross-entity leak) + guard wired to the ribbon surface + browser screenshot of /lists ribbon numbers equal to the list-route counts + Neon lucia parity rows. OR "UNVERIFIED — count source not yet located; Step-1 rg pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F01
LANE: NON-FINANCIAL
DOD-A: PASS — single active read path (ribbon → canonical catalog count endpoint); no DUAL_PATH_OLD_ACTIVE, no ComingSoon twin.
DOD-B: N/A — read-only surface, no wizard/submit payload.
DOD-C: PASS — each count FORWARD (tile→catalog rows by opco) + REVERSE (row counted under one company); no memo/uuid-in-name/jsonb-id linkage.
DOD-D: N/A — no money object selected; display counts only.
DOD-E: UNVERIFIED — count source string must be read live (Step-1 rg) before freeze; backbone supplies the canonical truth numbers.
VERIFY-1: PASS — ribbon chrome unchanged (same tiles); numbers now honest.
VERIFY-2: N/A — no picker on this surface.
VERIFY-3: PASS — nav→/lists→ribbon→count endpoint→CANONICAL catalogs.* (never RETIRE/qbo view)→same table the list reads→entity-scoped→no fake counts.
VERIFY-4: N/A — no claim/WO/expense chain on a count tile.
VERIFY-5: PASS — TRANSP and USMCA each see only their own counts; drivers-as-vendors/units-by-owner unaffected; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back (read-only, and not even reading QBO after fix).
VERIFY-7: PASS — tile count unchanged (Rule 05); no invented/removed tiles; design png unaffected.
VERIFY-8: PASS — counts computed under correct `operating_company_id` GUC; any touched view security_invoker; FORCE RLS honored.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: reconcile against docs/module-completion/lists.json after PR; M grows +1 per new FAIL, Rule 21].
ITEMS_TOUCHED: lists-ribbon-counts (manifest id to resolve live) — [AUDIT].
MIGRATE: N/A — read-path change only; no DDL/DML.
ROOT CAUSE: ribbon count wired to a QBO-remote projection view lacking an opco filter, so it undercounts and ignores entity isolation.
FIX: repoint ribbon counts to per-catalog canonical `catalogs.*` count under GUC via the LST-F20 count-spec; files: /lists ribbon component + count endpoint (resolve paths in Step-1).
GUARD: scripts/verify-steps/NNN-verify-lists-ribbon-counts.mjs
LIVE PROOF: <sha/url/Neon-parity-rows/browser — or UNVERIFIED: count source not yet located>
REMAINING: none defensible once Step-1 locates the source; if a catalog lacks opco (global/shared) its tile counts global truth by design (see LST-REGISTRY exclusions).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
