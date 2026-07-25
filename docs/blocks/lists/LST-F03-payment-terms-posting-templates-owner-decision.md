<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F03 — F03 · payment_terms + posting_templates global scope → OWNER DECISION (do NOT auto-scope)
**FINDING:** F03 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD (build-and-HOLD; no auto-scope) · **Module:** Accounting / Lists.

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Payment terms, §Posting templates) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Role-gated catalogs) · IH35_ARCHITECTURAL_DESIGN.md (module Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (posting/role gating)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png · docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (decision surface — no code/tab change)
Deviations from spec: None
NEW SPEC items (Rule 01): None — scoping policy for these two is an OWNER DECISION, not a new spec item.

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25]
Backbone: `catalogs.payment_terms` and `catalogs.posting_templates` have **NO `operating_company_id`** column, RLS forced, policy **role-based** — they are GLOBAL / role-gated, NOT "entity-blind, scope them." Whether they *should* become per-entity is an **[OWNER DECISION]** (it changes AP/AR term behavior and posting logic across entities). This block surfaces the decision; it does NOT auto-scope. (`account_role_bindings` is the real per-entity fix — see LST-F09 — and is out of scope here.) **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT table_name, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='catalogs' AND table_name=t AND column_name='operating_company_id') FROM (VALUES ('payment_terms'),('posting_templates')) v(t);` — expect both FALSE (no opco), confirming global/role-gated shape.

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.payment_terms')` + `to_regclass('catalogs.posting_templates')` non-null — read-only in this block; NEVER retired or duplicated.
2. Hub matrix: payment_terms → consumed by `accounting.bills` / `accounting.payments` / customer+vendor terms (both ways). posting_templates → drives `accounting.journal_entries` line mapping (both ways). No new FK added by this block.
3. Cross-module (Rule 21 §1): AP bill entry, AR invoice terms, Posting setup — each reads these globally today; decision determines whether they become entity-scoped.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite treat payment terms and posting/GL templates as configurable at the book/subsidiary boundary; whether IH35 mirrors global vs per-entity is a controls decision the OWNER must ratify — not an engineer's silent default. Rule 13 build-and-HOLD keeps any change reversible and QBO-safe.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive only if/when owner approves per-entity conversion — no DROP/DELETE/TRUNCATE; existing global rows preserved. Until then, zero schema change. Enforce (unchanged): RLS forced, security_invoker views, append-only audit, void-not-delete, server-generated display IDs. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD, reuse poster (no new GL math), parallel books, QBO NEVER written, flags default OFF. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL only; posting_templates must never be edited to create/reclassify/merge those accounts.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause of the ambiguity = these two catalogs lack opco, so a naive audit could mislabel them "entity-blind, scope them." Correct action: (a) document that both are GLOBAL / role-gated by design; (b) raise the explicit **[OWNER DECISION]** — keep global (role-gated) OR convert to per-entity (mirror LST-F02 additive pattern) — with the AP/AR + posting implications spelled out; (c) take NO scoping action until the owner rules. If owner chooses per-entity, a follow-up block applies the additive conversion under FIN-HOLD.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-payment-terms-posting-templates-scope.mjs` + `scripts/verify-steps/NNN-verify-payment-terms-posting-templates-scope.mjs` (NEVER edit package.json/ci.yml/locked-guards). Guard is a **no-auto-scope sentinel**: FAILs if a PR silently adds `operating_company_id` to either table without an owner-decision marker in the block; PASSes on the documented global/role-gated shape OR an approved per-entity migration. `--selftest` mutates a real copy to add opco without approval, asserts it is flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: prod query confirms both tables have no opco + role-based policy; block records the OWNER DECISION as open; guard green (no unauthorized scoping). No production data change. Decision outcome is the owner's, not this block's.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F03
LANE: FINANCIAL-HOLD
DOD-A: PASS — Accounting/Lists routes for terms + posting templates already registered + mounted; no DUAL_PATH_OLD_ACTIVE; block adds no path.
DOD-B: N/A — no new wizard/field; decision-surface + sentinel guard only.
DOD-C: PASS — existing FKs (bills/payments/JEs) both ways preserved; no memo/uuid/jsonb linkage introduced.
DOD-D: N/A — no money object re-selected; economics unchanged pending owner decision (build-and-HOLD).
DOD-E: PASS — live prod query confirms global/role-gated shape; OWNER DECISION explicitly surfaced, not auto-fixed.
VERIFY-1: N/A — no new QBO chrome added.
VERIFY-2: PASS — terms/posting pickers keep catalog-behind-them + write=read; block does not alter picker law (global today).
VERIFY-3: PASS — nav→Accounting terms/posting route→UI→API→`catalogs.payment_terms`/`posting_templates` (canonical)→same R/W→role-gated→flags honest.
VERIFY-4: N/A — no claim/WO/bill+payment chain altered.
VERIFY-5: N/A — tables are global/role-gated (no opco); no per-entity scope to verify unless owner converts. TRANSP+USMCA both read the global list identically today.
VERIFY-6: PASS (build-and-HOLD) — no JE change; poster untouched; flags OFF; NO TMS→QBO write-back.
VERIFY-7: PASS — Accounting/Lists leaf count unchanged; no invented tab.
VERIFY-8: PASS — RLS forced (role policy) unchanged; security_invoker views; grants unchanged; sentinel guard blocks unapproved scoping.
MODULE_PROGRESS: accounting-lists N of M (must match docs/module-completion/accounting.json AFTER this PR)
ITEMS_TOUCHED: payment_terms-catalog, posting_templates-catalog (read-only + owner-decision marker)
MIGRATE: N/A — no DDL; scoping deferred to explicit owner decision (would be a future block strictly above 202607960000 if approved).
ROOT CAUSE: payment_terms + posting_templates lack opco (global/role-gated by design); mislabeling them "entity-blind" would force an unratified controls change.
FIX: document global/role-gated status, raise OWNER DECISION (keep global vs per-entity), ship no-auto-scope sentinel guard, take no scoping action. Files: this block + scripts/verify-steps/NNN-verify-payment-terms-posting-templates-scope.mjs.
GUARD: scripts/verify-steps/NNN-verify-payment-terms-posting-templates-scope.mjs
LIVE PROOF: prod lucia query (both tables: no opco, role-based policy) + guard green.
REMAINING: OWNER DECISION open — owner-approved deferral: tracked here; per-entity conversion becomes a future FIN-HOLD block only if the owner rules per-entity.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
