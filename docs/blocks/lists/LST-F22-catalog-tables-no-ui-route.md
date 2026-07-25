<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F22 — F22 · 21 catalog tables with no UI route
**FINDING:** F22 (P2) · **Lane:** NON-FINANCIAL · **Module:** lists (catalog reachability).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Catalog coverage) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§reachability) · IH35_ARCHITECTURAL_DESIGN.md (module lists) · docs/lockdown/00_LOCKED_DECISIONS.md (N/A).
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png.
Tab count check (Rule 05): the design intends every user-managed catalog reachable · 21 catalog tables have no UI route · this block wires routes (or documents intended-headless) to match the designed reachable set.
Deviations from spec: None.
NEW SPEC items (Rule 01): None — routes for existing tables; any table intentionally headless is documented with an owner note, not a new product surface.

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
21 catalog tables exist in the database with no UI route reaching them (Rule 21 reachability gap) — some should have a route; some are intentionally headless (system/lookup) and must be documented as such. **Step 1 — reproduce (Rule 10, lucia):** enumerate the 21 and diff against registered routes:
```
# 1) all catalog tables
psql "$NEON_PROD" <<'SQL'
BEGIN; SET LOCAL app.bypass_rls='lucia';
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_schema IN ('catalogs') ORDER BY 2;
ROLLBACK;
SQL
# 2) which have NO route/nav leaf — diff against registered routes (read live)
rg -n "route|nav" app/**/lists/**                                    # not in backbone → verify live
```
The identity of the 21 + which are user-managed vs headless is NOT in the backbone → read live and classify each (route vs owner-noted headless).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each of the 21 canonical `catalogs.*` tables gets a route to its own surface, OR an explicit “intended-headless” owner note (no route). NEVER route to a RETIRE table (exclude `catalogs.cancellation_reasons` etc.).
2. Hub matrix: routed catalogs link BOTH-WAY to `org.companies` (where per-entity, classify by opco VALUES); headless ones are consumed internally (documented consumer).
3. Cross-module (Rule 21 §1): each routed catalog is reachable from the hub and drills both ways; each headless one names its internal consumer.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite list/record coverage — a user-managed catalog must be reachable and editable; a system lookup may be headless but must be documented so it isn’t mistaken for a gap. Full Audit Law: no silent-missing, no undocumented table.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — add routes/nav leaves and/or an owner-note doc entry; no data change, no deletion of any headless table. Enforce: routed surfaces honor `operating_company_id` RLS + security_invoker · display IDs server-generated. Not financial (Rule 19 N/A; if any of the 21 is a financial/reserve-adjacent catalog, it is owner-noted, never auto-routed to an editable surface).

## THE FIX (requirement-level; no invented unverified SQL)
For each of the 21: if user-managed, register a route + hub nav leaf bound to the canonical table under GUC (reuse the generic catalog surface where possible); if intended-headless, add a documented owner note (docs/trackers) naming its consumer and why no route. RETIRE tables are excluded (never routed).

## GUARD (Rule 16/17 — verify-steps ONLY)
scripts/verify-catalog-route-coverage.mjs + scripts/verify-steps/NNN-verify-catalog-route-coverage.mjs. FAIL on pre-fix main (a non-RETIRE catalog table has neither a route NOR a documented intended-headless note); PASS on the fix (every catalog table is either routed or owner-noted headless). --selftest mutates REAL source to add an unrouted+undocumented catalog, one case per assertion, and asserts the covered shape is NOT flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: each of the 21 is routed (browser reaches it, entity-scoped for TRANSP/USMCA) or listed in the headless owner-note doc; guard wired; zero uncovered catalogs remain. OR "UNVERIFIED — the 21 not yet enumerated/classified; Step-1 pending".

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F22
LANE: NON-FINANCIAL
DOD-A: PASS — routed catalogs have a registered route + mounted component + nav leaf; headless ones documented; no dual path.
DOD-B: N/A for wiring; routed generic surfaces reuse the vetted create payload.
DOD-C: PASS — routed catalogs expose canonical FKs FORWARD+REVERSE; no memo/uuid-in-name.
DOD-D: N/A — no money object.
DOD-E: UNVERIFIED — the 21 tables + user-managed/headless classification must be read live before freeze.
VERIFY-1: PASS — hub chrome gains the routed leaves.
VERIFY-2: PASS — routed generic catalogs use the universal picker where referenced elsewhere; entity-scoped.
VERIFY-3: PASS — nav→route→UI→API→CANONICAL catalogs.* (never RETIRE)→same R/W→entity-scoped→flags honest; headless documented.
VERIFY-4: N/A — no claim/WO/expense chain from wiring.
VERIFY-5: PASS — per-entity routed catalogs scoped for TRANSP and USMCA; no cross-entity leak.
VERIFY-6: N/A — no economics; NO TMS→QBO write-back.
VERIFY-7: PASS — reachable leaf set matches design (Rule 05); headless documented; no invented tabs.
VERIFY-8: PASS — routed surfaces FORCE RLS + correct GUC + security_invoker + grants.
MODULE_PROGRESS: lists N of M — [AUDIT — RE-VERIFY LIVE: docs/module-completion/lists.json after PR; M may grow if new FAILs surface per Rule 21].
ITEMS_TOUCHED: catalog-route-coverage-x21 (manifest ids to resolve live) — [AUDIT].
MIGRATE: N/A — routes + docs only; no DDL/DML.
ROOT CAUSE: 21 catalog tables were created without a route/nav leaf and without a documented headless designation.
FIX: route the user-managed ones (generic catalog surface), owner-note the headless ones; files: route/nav config + docs/trackers headless note.
GUARD: scripts/verify-steps/NNN-verify-catalog-route-coverage.mjs
LIVE PROOF: <all 21 routed-or-documented + browser — or UNVERIFIED: 21 not enumerated>
REMAINING: any of the 21 that is financial/reserve-adjacent is owner-noted (Rule 19), never auto-routed to an editable surface without owner sign-off (tracker + future block id).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
