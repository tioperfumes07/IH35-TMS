<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F13 — F13 · parts-catalog & abandonment-defaults hub-unreachable
**FINDING:** F13 (P3) · **Lane:** NON-FINANCIAL · **Module:** lists/maintenance (parts-catalog, abandonment-defaults).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Maintenance catalogs) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§abandonment defaults) · IH35_ARCHITECTURAL_DESIGN.md (module lists/maintenance) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A).
Approved screens reviewed: docs/approved-screens/2Maintenance.png, 9Lists_and_catalogs.png.
Tab count check (Rule 05): design says parts-catalog + abandonment-defaults are reachable leaves under the hub · today no nav/route reaches them (Rule 21 reachable violation) · this block adds the nav leaf + route so count matches design · confirm design png.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — the surfaces exist, only their nav/route entry is missing.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
`parts-catalog` and `abandonment-defaults` surfaces exist but no navigation leaf or route reaches them (hub-unreachable — Rule 21 “every catalog reachable” violation). **Step 1 — reproduce (Rule 10, lucia):** confirm the components exist but no nav/route mounts them:
```
# 1) components exist but no nav leaf / route registration — read live
rg -n "parts-catalog|abandonment" app/**/*                 # component present?
rg -n "parts-catalog|abandonment" app/**/nav* app/**/route* # nav/route entry missing?  (not in backbone → verify live)
# 2) their canonical tables exist (so wiring reaches real data)
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT to_regclass('maintenance.parts') AS parts_tbl, to_regclass('catalogs.abandonment_defaults') AS abandon_tbl;
ROLLBACK;
SQL
```
Route/nav absence + exact canonical table for abandonment-defaults are NOT in the backbone → verify live.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: parts-catalog → `to_regclass('maintenance.parts')` (canonical per LST-F12; never `maint.*`); abandonment-defaults → `to_regclass('catalogs.abandonment_defaults')` (confirm live). NEVER a RETIRE table.
2. Hub matrix: both link BOTH-WAY to `org.companies` (opco); parts-catalog reverse-links to `maintenance.work_orders`; abandonment-defaults drive load/dispatch abandonment handling. Reverse: a WO/load resolves the catalog entry it used.
3. Cross-module (Rule 21 §1): once reachable, both appear as hub leaves and drill into maintenance/dispatch and back.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/McLeod navigability — a configured catalog that no menu reaches is a hidden, unmaintainable surface; Rule 21 requires every catalog reachable from the hub.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add nav leaf + route registration; no data mutation, no DROP/DELETE. Enforce: the reached surfaces still honor `operating_company_id` RLS · security_invoker on any view · display IDs server-generated. Not financial (Rule 19 N/A).

## THE FIX (requirement-level; no invented unverified SQL)
Register routes and add hub nav leaves for parts-catalog and abandonment-defaults so both are reachable (Rule 21), each bound to its canonical table under GUC. No new surface built — only wiring the existing ones.

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-hub-reachable-parts-abandonment.mjs + scripts/verify-steps/NNN-verify-hub-reachable-parts-abandonment.mjs. FAIL on pre-fix main (asserts the component exists but no nav leaf/route resolves to it); PASS on the fix (nav leaf + route both present and resolve to the mounted component). --selftest mutates REAL source to remove the nav/route entry, one case per assertion, and asserts the reachable shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: hub nav shows both leaves; each route renders its surface bound to the canonical table under GUC for TRANSP and USMCA; guard wired; browser click-through from hub → surface → data. OR "UNVERIFIED — abandonment_defaults canonical table not yet confirmed; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F13
LANE: NON-FINANCIAL
DOD-A: PASS (post-fix) — route registered + component mounted + nav leaf present for both; no DUAL_PATH/ComingSoon.
DOD-B: N/A — wiring only; the surfaces’ own create payloads unchanged (parts covered by LST-F12).
DOD-C: PASS — reachable surfaces expose their canonical FKs FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — abandonment-defaults canonical table + the missing nav/route entries must be confirmed live before freeze.
VERIFY-1: PASS — hub chrome gains the two leaves; QBO-style list on each.
VERIFY-2: N/A — wiring block (pickers on the surfaces unchanged).
VERIFY-3: PASS — nav leaf→route→UI→API→CANONICAL maintenance.parts / catalogs.abandonment_defaults (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A — no claim/WO/expense chain created by wiring.
VERIFY-5: PASS — both surfaces opco-scoped for TRANSP and USMCA; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — hub leaf count now matches design (Rule 05); no invented tabs; design png confirmed.
VERIFY-8: PASS — surfaces honor FORCE RLS + correct GUC + security_invoker + grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR].
ITEMS_TOUCHED: hub-reachable-parts-catalog, hub-reachable-abandonment-defaults (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — nav/route wiring only; no DDL/DML.
ROOT CAUSE: two configured catalog surfaces were never given a nav leaf or route registration, so the hub cannot reach them.
FIX: add nav leaves + register routes to the existing components (Rule 21 reachable); files: hub nav config + route config.
GUARD: scripts/verify-steps/NNN-verify-hub-reachable-parts-abandonment.mjs
LIVE PROOF: <hub leaves + route render + browser click-through — or UNVERIFIED: abandonment table unconfirmed>
REMAINING: none defensible once nav/route added and canonical tables confirmed.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
