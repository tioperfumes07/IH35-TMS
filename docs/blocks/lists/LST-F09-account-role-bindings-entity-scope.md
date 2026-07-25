<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F09 — F09 · account_role_bindings role-gated+empty → company_scope + per-entity control-role bindings
**FINDING:** F09 (P0, FIN-HOLD — USMCA launch blocker) · **Lane:** FINANCIAL-HOLD · **Module:** Accounting (CoA control-role mapping).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Control accounts) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Account role bindings) · IH35_ARCHITECTURAL_DESIGN.md (module Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (control-role mapping, posting)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png · docs/approved-screens/10Reports.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (policy + seed — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
Backbone: `catalogs.account_role_bindings` HAS `operating_company_id`, RLS forced, but policy is **role-based** (Owner/Admin/Mgr/Acct), has **0 rows**, and a **global UNIQUE**. This maps CoA control roles (A/P, A/R, Undeposited Funds) to accounts — with no rows and no per-entity isolation, no entity has its control accounts wired, which **blocks USMCA launch** (posting can't resolve control accounts per entity). Fix: replace role-based policy with `company_scope` (`operating_company_id = GUC`), populate per-entity control-role bindings, and make UNIQUE per-entity. **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.account_role_bindings; -- expect 0` and inspect `pg_policy`/`pg_constraint` for the role-based policy + global UNIQUE `(role_key)` (should become `(operating_company_id, role_key)`).

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.account_role_bindings')` non-null; binds to `to_regclass('catalogs.accounts')` (PER-ENTITY, 1392) — NEVER a RETIRE table.
2. Hub matrix: binding → `org.companies` (operating_company_id, both-way) + `catalogs.accounts` (account_id FK, both-way) + consumed by `accounting.journal_entries` posting (control-role → account resolution) both ways.
3. Cross-module (Rule 21 §1): Posting engine (A/P, A/R, Undeposited Funds resolution), CoA control-role setup screen, Reports — each resolves control accounts per entity and drills both ways.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite control-account mapping per book/subsidiary — A/P, A/R, Undeposited Funds must resolve to each entity's own GL account. US GAAP posting integrity: a JE cannot post to another entity's control account. Per-entity binding is mandatory before USMCA books go live.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only — no DROP/DELETE/TRUNCATE; policy is REPLACED (role→company_scope), rows are INSERTED, UNIQUE re-created per-entity via additive migration (idempotent DO + IF NOT EXISTS). Enforce: operating_company_id RLS FORCE on the table · security_invoker views · append-only audit on binding changes · display IDs server-generated · REVOKE DELETE + grants. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (bindings feed the existing poster, no new GL math); parallel books; QBO NEVER written; flags default OFF; ASC 470-60 Ch.11 unaffected. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL: seed ONLY the standard control roles (A/P, A/R, Undeposited Funds); NEVER auto-bind or create reserve/holdback/retainage accounts — leave those for the owner.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = account_role_bindings is role-gated (not entity-scoped), empty, with a global UNIQUE — so control-account resolution is neither populated nor tenant-isolated, blocking USMCA. Fix: (1) drop the global UNIQUE, add UNIQUE `(operating_company_id, role_key)`; (2) replace the role-based RLS policy with `company_scope` (`operating_company_id = GUC`), keeping FORCE RLS; (3) populate per-entity bindings for the standard control roles (A/P, A/R, Undeposited Funds) by resolving each entity's own account in `catalogs.accounts` (dynamic, no hardcoded UUID; owner confirms account picks for control roles); (4) REVOKE DELETE, re-grant. Reserve/holdback/retainage roles are explicitly NOT seeded (Rule 19).

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-account-role-bindings-entity-scope.mjs` + `scripts/verify-steps/NNN-verify-account-role-bindings-entity-scope.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (0 rows / role-based policy / global UNIQUE), PASSes on fix (company_scope policy, per-entity UNIQUE, A/P+A/R+Undeposited Funds bound for every active entity). `--selftest` mutates a real copy to the role-gated/empty shape, asserts flagged; asserts the per-entity-bound shape not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: `account_role_bindings` shows company_scope policy, per-entity UNIQUE, and A/P + A/R + Undeposited Funds bound for TRANSP AND USMCA (each to its own `catalogs.accounts` row); posting engine resolves control accounts per entity; guard green. This clears the USMCA launch blocker.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F09
LANE: FINANCIAL-HOLD
DOD-A: PASS — CoA control-role setup route registered + component mounted; posting engine consumes bindings on the live path; no DUAL_PATH_OLD_ACTIVE.
DOD-B: PASS — control-role→account picker field controlled AND in the binding submit payload.
DOD-C: PASS — binding ↔ org.companies + catalogs.accounts FKs both ways; account_id is a real FK, not memo/uuid-in-name/jsonb.
DOD-D: PASS — each control role binds to a specific control account (the money object); no silent default; flags OFF.
DOD-E: PASS — prod query (0 rows / role-based / global UNIQUE) verified in backbone; post-fix rows to be shown live.
VERIFY-1: PASS — control-role setup uses QBO chrome (account picker drawer, +Create semantics).
VERIFY-2: PASS — control-role account picker: catalog behind it (catalogs.accounts), inline +Add first row, same canonical table write=read, entity-scoped, survives reload.
VERIFY-3: PASS — nav→CoA control-role→UI→API→`catalogs.account_role_bindings`+`accounts` (canonical, never RETIRE)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: binding→posting engine→journal_entries control lines both ways (build-and-HOLD).
VERIFY-5: PASS — TRANSP AND USMCA each get their own A/P+A/R+Undeposited Funds bindings; no cross-entity leak; company_scope enforced.
VERIFY-6: PASS (build-and-HOLD) — bindings feed existing poster; balanced JE only when flag ON; control roles resolved per entity; NO TMS→QBO write-back.
VERIFY-7: PASS — Accounting leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + company_scope GUC policy; security_invoker views; per-entity UNIQUE; REVOKE DELETE; grants re-issued.
MODULE_PROGRESS: accounting N of M (must match docs/module-completion/accounting.json AFTER this PR)
ITEMS_TOUCHED: account_role_bindings-policy, account_role_bindings-seed (A/P, A/R, Undeposited Funds), control-role-setup-picker
MIGRATE: number strictly above main max (above both 202607950000 and 202607960000, e.g. 202607970003, distinct) / idempotent (DO + IF NOT EXISTS) / dynamic org.companies + per-entity account resolution — NO hardcoded UUID / FORCE RLS company_scope / per-entity UNIQUE / REVOKE DELETE / grants / validate on throwaway only / checksum-override same PR.
ROOT CAUSE: account_role_bindings is role-gated (not entity-scoped), 0 rows, global UNIQUE — control accounts unresolved + not tenant-isolated, blocking USMCA launch.
FIX: company_scope policy + per-entity UNIQUE + seed per-entity A/P/A/R/Undeposited Funds bindings from each entity's catalogs.accounts (Rule 19 reserve/holdback excluded). Files: migrations/202607970003_*.sql, control-role setup UI + API, guard.
GUARD: scripts/verify-steps/NNN-verify-account-role-bindings-entity-scope.mjs
LIVE PROOF: prod pre-fix verified (0 rows/role-based/global UNIQUE); post-fix per-entity bindings rows UNVERIFIED until migration applied on prod.
REMAINING: USMCA launch blocker — must be applied + verified live before USMCA books go live; no owner-approved deferral (owner confirms control-account picks only).

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
