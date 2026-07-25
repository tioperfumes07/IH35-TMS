<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F23 — F23 · views.catalogs_inventory ~40 routeless/tableless keys
**FINDING:** F23 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists (catalogs_inventory view).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Catalog inventory) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§inventory view) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): the inventory view is a meta-listing, not a leaf · reconciling it does not change tab count · it makes the meta-listing truthful.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — reconcile existing keys.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`views.catalogs_inventory` enumerates ~40 catalog keys that have no route and/or no backing table (routeless/tableless keys) — a stale meta-listing that overstates coverage. **Step 1 — reproduce (Rule 10, lucia):** read the view and classify each key:
```
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('views.catalogs_inventory') AS view_exists;
-- for each key: does its table resolve? (tableless = to_regclass NULL)
SELECT * FROM views.catalogs_inventory;    -- read keys + declared table/route
ROLLBACK;
SQL
# then diff keys against real routes (routeless) — read live
rg -n "route|nav" app/**/lists/**                                    # not in backbone → verify live
```
The view definition + the ~40 keys’ route/table state are NOT in the backbone → read live. Cross-reference LST-F21 (fail-loud) for tableless detection and LST-F22 (route coverage) for routeless.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('views.catalogs_inventory')` recreated WITH(security_invoker=true), each retained key pointing at a canonical non-null table + a real route; tableless/routeless keys either fixed (via F22) or removed from the view / marked headless. NEVER list a RETIRE table as active.
2. Hub matrix: the inventory view is the meta-source for reachability audits; each real key links to `org.companies` where per-entity.
3. Cross-module (Rule 21 §1): the reconciled view is the single truth the coverage guards (F20/F21/F22) diff against.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite metadata accuracy — a system inventory of records must reflect reality; ~40 phantom keys make audits lie. security_invoker views (Rule 04) so the meta-view respects RLS.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/corrective — CREATE OR REPLACE the view (a view redefinition is not data deletion) WITH(security_invoker=true); remove ONLY phantom keys (no backing table AND no intended route) or mark them headless; never DROP a real catalog table. Enforce: security_invoker · counts under GUC. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Reconcile `views.catalogs_inventory`: for each of the ~40 keys, keep+link if it has a canonical table + route (or gets one via F22), mark headless if intended, drop from the view if it is a pure phantom (no table, no intended route). Recreate the view WITH(security_invoker=true). Result: the inventory equals the real reachable/documented catalog set.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-catalogs-inventory-reconciled.mjs + scripts/verify-steps/NNN-verify-catalogs-inventory-reconciled.mjs. FAIL on pre-fix main (a `catalogs_inventory` key resolves to `to_regclass` NULL or has no route and isn’t marked headless); PASS on the fix (every key = canonical table + route, or explicitly headless; view is security_invoker). --selftest mutates REAL source to add a phantom key, one case per assertion, and asserts the reconciled view is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: every `catalogs_inventory` key resolves to a real canonical table + route or headless marker; view is security_invoker; entity-scoped rows for TRANSP/USMCA; guard wired. OR "UNVERIFIED — view definition/keys not yet read; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F23
LANE: NON-FINANCIAL
DOD-A: PASS — the inventory reflects only reachable (routed) or documented catalogs; no phantom active twins.
DOD-B: N/A — meta-view reconcile, no create wizard.
DOD-C: PASS — each retained key links to its canonical table FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — view definition + ~40 keys must be read live before freeze.
VERIFY-1: PASS — no user chrome; meta-view honest.
VERIFY-2: N/A — not a picker.
VERIFY-3: PASS — view→CANONICAL tables + real routes (never RETIRE)→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain.
VERIFY-5: PASS — per-entity keys scoped for TRANSP and USMCA (security_invoker); no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — no tab change (Rule 05); meta-listing corrected.
VERIFY-8: PASS — view WITH(security_invoker=true); underlying tables FORCE RLS + correct GUC; grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: catalogs-inventory-reconcile (manifest id to resolve live) — [AUDIT].
MIGRATE: additive — CREATE OR REPLACE VIEW views.catalogs_inventory WITH(security_invoker=true) reconciled to real keys, migration number > 202607960000 distinct, idempotent, no hardcoded org UUID, grants; no table DROP.
ROOT CAUSE: the inventory view accumulated ~40 keys for catalogs that were never routed or never table-backed (phantom meta-entries).
FIX: reconcile the view to real canonical+routed (or headless) keys, security_invoker; files: view migration + (coordinated) F22 routes.
GUARD: scripts/verify-steps/NNN-verify-catalogs-inventory-reconciled.mjs
LIVE PROOF: <every key resolves table+route/headless + security_invoker — or UNVERIFIED: view not read>
REMAINING: sequence with LST-F22 (routes) and LST-F21 (fail-loud) — same authoritative set; any ambiguous key deferred with a tracker note, never silently dropped.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
