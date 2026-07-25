<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F05 — F05 · lowest-UUID entity hijack in cancel/void/fmcsa routes → resolve entity from the record
**FINDING:** F05 (P0, no FIN-HOLD) · **Lane:** NON-FINANCIAL (security/RLS correctness) · **Module:** Dispatch / Compliance (cancel, void, FMCSA).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Entity resolution) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§GUC/tenant context) · IH35_ARCHITECTURAL_DESIGN.md (module Dispatch/Compliance) · docs/lockdown/00_LOCKED_DECISIONS.md (RLS/GUC law)
Approved screens reviewed: docs/approved-screens/8DispatchHome.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (route logic fix — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Finding: cancel / void / FMCSA routes resolve the operating entity with `UNION … ORDER BY id LIMIT 1` — the lowest-UUID entity — instead of the entity that actually owns the record. This lets an action taken under one entity's context mutate/report against another entity (a tenant hijack + wrong-books risk). Fix: resolve entity from the LOAD's `operating_company_id` (or the record's owning entity) / the authenticated GUC — never lowest-UUID. Route files not enumerated in backbone. **Step 1 — reproduce (Rule 10, lucia):** grep server routes for `ORDER BY id ... LIMIT 1` combined with a `UNION` over org/company selection in cancel/void/fmcsa handlers; then `SET app.bypass_rls='lucia'; SELECT id, operating_company_id FROM mdata.loads ORDER BY operating_company_id LIMIT 5;` and confirm a cancel/void under a non-owning GUC currently mis-resolves to the lowest-UUID entity. [Exact route paths → confirm on origin/main before freeze.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: no table schema change — reads `mdata.loads.operating_company_id` (canonical) + authenticated GUC. NEVER a RETIRE table.
2. Hub matrix: action (cancel/void/fmcsa) → the owning record (`mdata.loads` / relevant compliance record) → `org.companies` — resolved both ways from the record, not from a global min-UUID scan.
3. Cross-module (Rule 21 §1): Dispatch cancel/void, Compliance FMCSA submission — each must act under the record's true entity; drill both ways from action to owning entity.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
NetSuite/QuickBooks multi-book integrity + RLS tenant-isolation law: an action must execute under the record's own entity context, never a heuristic (min-UUID) that can silently cross tenants. FMCSA correctness — a compliance action filed under the wrong entity is a reportable defect.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral fix — no DROP/DELETE/TRUNCATE; void-not-delete preserved. Enforce: operating_company_id RLS + correct GUC on every touched route · security_invoker views · append-only audit on cancel/void/fmcsa mutation · display IDs server-generated. Not a financial write itself, but void may cascade to accounting — if so, Rule 13 build-and-HOLD applies to any downstream posting (poster reused, QBO never written, flags OFF). Rule 19 — reserve/holdback/retainage accounts never touched by entity-resolution logic.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = entity resolution uses `UNION … ORDER BY id LIMIT 1` (lowest-UUID) rather than the record's own `operating_company_id` / authenticated GUC. Fix: replace every lowest-UUID resolver in cancel/void/fmcsa routes with resolution from the target record's `operating_company_id` (loaded within the RLS/GUC context of the authenticated user), and assert the record's entity matches the caller's GUC — reject cross-entity actions. No min-UUID fallback anywhere.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-no-lowest-uuid-entity-resolution.mjs` + `scripts/verify-steps/NNN-verify-no-lowest-uuid-entity-resolution.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (route contains `UNION … ORDER BY id LIMIT 1` entity resolution), PASSes on fix (entity derived from record.operating_company_id / GUC). `--selftest` mutates a real route copy to the min-UUID pattern, asserts flagged; asserts record-derived resolution not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: cancel/void a USMCA load while authenticated as USMCA — action resolves to USMCA (not the lowest-UUID entity); a cross-entity attempt is rejected; FMCSA submission carries the load's true entity; guard green. UNVERIFIED — exact route file set until Step-1 reproduce on origin/main.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F05
LANE: NON-FINANCIAL
DOD-A: PASS — cancel/void/fmcsa routes registered + handlers active; no DUAL_PATH_OLD_ACTIVE; fixed resolver is the live path.
DOD-B: N/A — no rendered form field added; server-side entity-resolution correction.
DOD-C: PASS — action ↔ owning record (mdata.loads) ↔ org.companies resolved by real FK/GUC both ways; no min-UUID heuristic.
DOD-D: N/A — resolution logic, not money-object selection; any downstream void posting handled under its own FIN block.
DOD-E: UNVERIFIED — route paths pending Step-1 origin/main confirm; hijack mechanism verified conceptually.
VERIFY-1: N/A — no new QBO chrome.
VERIFY-2: N/A — not a picker change (entity resolver, not a catalog dropdown).
VERIFY-3: PASS — nav→cancel/void/fmcsa route→UI→API→record.operating_company_id + GUC→entity-scoped→flags honest; no RETIRE table.
VERIFY-4: PASS — deep chain: action→owning load→entity; cross-entity action rejected (both-way integrity).
VERIFY-5: PASS — TRANSP + USMCA each act under their own entity; lowest-UUID cross-entity leak eliminated.
VERIFY-6: N/A (non-financial) — if void cascades to posting, that JE stays under build-and-HOLD in its own block; no TMS→QBO write-back here.
VERIFY-7: PASS — Dispatch/Compliance leaf count unchanged; no invented tab.
VERIFY-8: PASS — correct GUC enforced; FORCE RLS honored; security_invoker; caller-vs-record entity assertion added; grants unchanged.
MODULE_PROGRESS: dispatch N of M (must match docs/module-completion/dispatch.json AFTER this PR)
ITEMS_TOUCHED: cancel-route, void-route, fmcsa-route (entity resolver)
MIGRATE: N/A — code-only behavioral fix; no DDL.
ROOT CAUSE: entity resolved via `UNION … ORDER BY id LIMIT 1` (lowest-UUID) instead of the record's operating_company_id / authenticated GUC — silent cross-tenant hijack.
FIX: derive entity from record.operating_company_id + GUC in cancel/void/fmcsa routes; reject cross-entity actions; remove min-UUID fallback. Files: server cancel/void/fmcsa route handlers.
GUARD: scripts/verify-steps/NNN-verify-no-lowest-uuid-entity-resolution.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 route enumeration + prod cancel-under-USMCA resolves to USMCA (not min-UUID).
REMAINING: exact route file set is the first live step; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
