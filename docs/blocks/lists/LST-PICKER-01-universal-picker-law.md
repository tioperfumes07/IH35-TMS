<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-PICKER-01 — PICKER-01 · universal picker law (all 7 clauses) across catalog pickers
**FINDING:** PICKER-01 (P1, no FIN-HOLD) · **Lane:** NON-FINANCIAL (shared UI capability; financial catalog instances stay under their own FIN-HOLD blocks) · **Module:** Lists & Catalogs (cross-cutting).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Universal picker) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Picker law 7 clauses) · IH35_ARCHITECTURAL_DESIGN.md (module Lists/shared components) · docs/lockdown/00_LOCKED_DECISIONS.md (picker law)
Approved screens reviewed: docs/approved-screens/9Lists_and_catalogs.png · docs/approved-screens/3AccountingDropdown.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (shared capability — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [AUDIT — RE-VERIFY LIVE]
Finding: catalog pickers are implemented as bespoke per-catalog forms with inconsistent behavior, instead of ONE shared picker capability configured per catalog. The universal picker law requires all 7 clauses on every catalog picker: (1) a real catalog table behind it; (2) inline "+Add new" as the FIRST ROW inside the dropdown; (3) that inline-add opens the QBO-style create wizard; (4) SAME canonical table write=read; (5) the new row appears + is selected + survives reload; (6) entity-scoped; (7) shared capability + per-catalog config (not bespoke forms). Backbone confirms the canonical per-entity tables the pickers must bind to (complaint_types, load_cancellation_reasons, accounts, items, expense_categories). **Step 1 — reproduce (Rule 10, lucia):** grep client for catalog picker components; identify bespoke/one-off pickers lacking inline-add-as-first-row or write≠read; for each, confirm the canonical table via backbone (`SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.<t>;`). [Exact picker component inventory → confirm on origin/main.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: each picker binds to its canonical `catalogs.<table>` (per backbone) — NEVER a RETIRE table (no `mdata.qbo_*` read source; see LST-F06).
2. Hub matrix: every catalog value → `org.companies` (entity-scoped, both-way) + its consuming record (load/expense/complaint/WO) both ways via real FK.
3. Cross-module (Rule 21 §1): every module that renders a catalog picker (Dispatch, Accounting, Safety, Maintenance) uses the one shared capability; drill both ways value↔consumer.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks universal "+ Add new" inside every list dropdown (first row, opens create modal, immediately selectable) — the write=read, entity-scoped, one-capability standard IH35 matches and enforces uniformly instead of per-screen bespoke forms.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/refactor — no DROP/DELETE/TRUNCATE; bespoke pickers are migrated to the shared capability, not deleted-with-loss; catalog data untouched. Enforce: operating_company_id RLS on every catalog · views WITH(security_invoker=true) · append-only audit on inline create · display IDs server-generated · +Create/+Book never +New/+Add. Financial catalog instances (accounts, items, expense_categories) keep their own FIN-HOLD (Rule 13/19) — this shared-capability block does not itself write GL; it must not bypass is_postable (F14) or control-role (F09) rules for financial pickers.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = pickers are bespoke per catalog, so clauses (inline-add-first-row, write=read, entity-scope, survives-reload) are inconsistently implemented. Fix: build/adopt ONE shared picker capability that takes a per-catalog config (canonical table, natural key, create-wizard schema, entity scope) and enforces all 7 clauses; migrate each catalog picker to it. Config-driven, not code-forked per catalog. Financial catalogs pass their extra predicates (is_postable, control-role) through config, not by forking the capability.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-universal-picker-law.mjs` + `scripts/verify-steps/NNN-verify-universal-picker-law.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (a catalog picker missing any of the 7 clauses — e.g. no inline-add-first-row, or write≠read, or reads a mirror), PASSes on fix (all migrated pickers satisfy 7 clauses via the shared capability). `--selftest` mutates a real picker copy to drop a clause, asserts flagged; asserts a compliant picker not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: for a sample of catalog pickers across modules, in TRANSP + USMCA: inline "+Add new" is the first dropdown row, opens the create wizard, the new row writes+reads the same canonical table, appears+selected+survives reload, entity-scoped. Guard green. UNVERIFIED — full picker inventory until Step-1 reproduce on origin/main.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: PICKER-01
LANE: NON-FINANCIAL
DOD-A: PASS — shared picker capability mounted on live catalog routes; bespoke forms retired to it; no DUAL_PATH_OLD_ACTIVE twin.
DOD-B: PASS — every rendered picker field (value + inline-create fields) controlled AND in the submit payload.
DOD-C: PASS — value ↔ org.companies + consumer FKs both ways via real FK; no memo/uuid-in-name/jsonb.
DOD-D: N/A (capability) — economic selection happens in each consuming block; financial pickers keep their own money-object logic (F06/F09/F14).
DOD-E: UNVERIFIED — full picker inventory pending Step-1 origin/main confirm; 7-clause spec + canonical tables verified.
VERIFY-1: PASS — shared capability renders QBO chrome (dropdown, inline first-row +Add, create wizard drawer, drawer-on-drawer).
VERIFY-2: PASS — this IS the universal picker law block: all 7 clauses enforced by the shared capability (catalog behind it · inline +Add first row · opens QBO wizard · same canonical table write=read · appears+selected+survives reload · entity-scoped).
VERIFY-3: PASS — nav→any catalog picker→UI→API→canonical `catalogs.<t>` (never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: N/A (capability-level) — deep economic chains verified in the consuming financial blocks.
VERIFY-5: PASS — every migrated picker entity-scoped; TRANSP+USMCA isolation; no cross-entity leak; no mirror read.
VERIFY-6: N/A (non-financial capability) — financial pickers route economics through their own FIN-HOLD blocks; no TMS→QBO write-back introduced here.
VERIFY-7: PASS — Lists & Catalogs + consuming-module leaf counts unchanged; no invented tab.
VERIFY-8: PASS — every picker enforces FORCE RLS + GUC via config; security_invoker views; grants correct; server-side scoping (not client-only).
MODULE_PROGRESS: lists-catalogs N of M (must match docs/module-completion/lists-catalogs.json AFTER this PR)
ITEMS_TOUCHED: shared-picker-capability, <per-catalog picker config ids from Step-1 inventory>
MIGRATE: N/A — client/server refactor to a shared capability; no DDL (canonical tables already exist per backbone). Any picker-view swap is idempotent, above 202607960000, checksum-override same PR.
ROOT CAUSE: catalog pickers are bespoke per screen, so the 7 picker-law clauses are inconsistently implemented (missing inline-add-first-row, write≠read, or mirror reads).
FIX: one config-driven shared picker capability enforcing all 7 clauses; migrate every catalog picker to it. Files: shared picker component + per-catalog config + server picker API.
GUARD: scripts/verify-steps/NNN-verify-universal-picker-law.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 picker inventory + prod 7-clause proof on a sample across modules.
REMAINING: full picker inventory is the first live step; financial pickers (F06/F09/F14) carry their own FIN-HOLD proofs; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
