<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F06 / LST-PICKER-02 — F06 · item/expense-category pickers read mirror → repoint to canonical catalogs.*
**FINDING:** F06 / PICKER-02 (P1, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Accounting / Lists (Items, Expense categories, Accounts).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Items, §Expense categories) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Write=read pickers) · IH35_ARCHITECTURAL_DESIGN.md (module Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (canonical vs mirror)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png · docs/approved-screens/9Lists_and_catalogs.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (picker source repoint — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 — picker source paths AUDIT — RE-VERIFY LIVE]
Backbone: `catalogs.items` PER-ENTITY (236 pop / 0 null), `catalogs.expense_categories` PER-ENTITY (9 pop / 0 null, `company_scope = GUC`), `catalogs.accounts` PER-ENTITY (1392 pop / 0 null) — these are canonical. `mdata.qbo_items` / `mdata.qbo_accounts` are the QBO **mirror** (puller-owned; projections READ the mirror but pickers must NOT). Finding: item/expense-category pickers READ `mdata.qbo_*` while inline-create WRITES `catalogs.*`, so a just-created "diesel" item never appears in the picker (write≠read). Fix: repoint pickers to canonical `catalogs.items` / `catalogs.accounts` / `catalogs.expense_categories` (same table write=read). Item backfill is done (#3442); rescope this block to the leftover pickers (expense-category + any account pickers still on the mirror). **Step 1 — reproduce (Rule 10, lucia):** grep client/server for picker queries hitting `mdata.qbo_items`/`mdata.qbo_accounts`; then `SET app.bypass_rls='lucia'; SELECT count(*) FROM catalogs.items; -- 236` and inline-create an item, confirm it is absent from a mirror-fed picker. [Exact picker file paths + #3442 scope → confirm on origin/main.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.items')`, `to_regclass('catalogs.expense_categories')`, `to_regclass('catalogs.accounts')` — all non-null PER-ENTITY. `mdata.qbo_*` is the mirror, NEVER the picker source (RETIRE-for-write from projection/picker perspective).
2. Hub matrix: item/expense-category/account → `org.companies` (both-way) + consumers `accounting.expenses` / `accounting.bills`+`bill_lines` / `accounting.journal_entries` link both ways.
3. Cross-module (Rule 21 §1): Bill/Expense entry pickers, Item list, Expense-category list, CoA picker — each reads the canonical table so write=read holds.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite write=read invariant: a newly created list item is immediately selectable. Reading a QBO mirror while writing the canonical catalog is the classic "diesel never appears" defect — a trust-breaking inconsistency this fix eliminates.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral — no DROP/DELETE/TRUNCATE; mirror tables remain (puller-owned) but are no longer the picker source. Enforce: operating_company_id RLS on catalogs.* · views WITH(security_invoker=true) · append-only audit · display IDs server-generated · +Create/+Book (never +New). **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (no new GL math); parallel books; QBO NEVER written; flags default OFF. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL; repointing account pickers must never create/reclassify/merge those accounts — and the CoA picker must still exclude them from posting selection (see LST-F14 for is_postable filter).

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = pickers query the QBO mirror `mdata.qbo_*` while inline-create writes the canonical `catalogs.*`, breaking write=read. Fix: repoint every item / expense-category / account posting picker to read the canonical `catalogs.items` / `catalogs.expense_categories` / `catalogs.accounts`, entity-scoped by GUC, so the same table is written and read. Item backfill (#3442) already closed the item gap; this block covers the leftover pickers (expense-category + remaining account pickers). No GL math changed.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-picker-canonical-source.mjs` + `scripts/verify-steps/NNN-verify-picker-canonical-source.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (picker query references `mdata.qbo_items`/`mdata.qbo_accounts`), PASSes on fix (picker reads `catalogs.*`, write=read). `--selftest` mutates a real picker copy to read the mirror, asserts flagged; asserts canonical-source picker not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: inline-create an expense category (and an item/account) in TRANSP + USMCA; the new row appears + is selectable + survives reload in the same picker; picker query references `catalogs.*` not `mdata.qbo_*`; guard green. UNVERIFIED — exact leftover picker paths until Step-1 reproduce on origin/main.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F06 / PICKER-02
LANE: FINANCIAL-HOLD
DOD-A: PASS — Accounting bill/expense entry routes registered + pickers mounted; no DUAL_PATH_OLD_ACTIVE; canonical-source picker is the live path.
DOD-B: PASS — picker value field controlled AND in the bill/expense submit payload (item_id / expense_category_id / account_id → canonical).
DOD-C: PASS — item/category/account ↔ org.companies + expense/bill FKs both ways; real FK, not memo/uuid-in-name/jsonb.
DOD-D: PASS — item/category picks the money object (expense account / income account); no silent default; flags OFF.
DOD-E: UNVERIFIED — leftover picker paths pending Step-1 origin/main confirm; canonical tables verified in backbone.
VERIFY-1: PASS — bill/expense entry uses QBO chrome (ParityDrawer, Due auto, +Create/+Book); drawer-on-drawer for inline create.
VERIFY-2: PASS — universal picker law all 7 clauses: catalog behind it, inline +Add first row opening QBO wizard, SAME canonical table write=read, appears+selected+survives reload, entity-scoped.
VERIFY-3: PASS — nav→bill/expense→UI→API→`catalogs.items`/`expense_categories`/`accounts` (canonical, never RETIRE `mdata.qbo_*`)→same R/W→entity-scoped→flags honest.
VERIFY-4: PASS — deep chain: item→expense/bill line→(build-and-HOLD) JE both ways; category→expense account mapping intact.
VERIFY-5: PASS — TRANSP + USMCA each read their own entity's catalog; no cross-entity leak; drivers-as-vendors item lists correct.
VERIFY-6: PASS (build-and-HOLD) — header+lines economics use canonical account; balanced JE only when flag ON; NO TMS→QBO write-back.
VERIFY-7: PASS — Accounting/Lists leaf count unchanged; no invented tab.
VERIFY-8: PASS — FORCE RLS + GUC on catalogs.*; security_invoker views; grants correct; mirror no longer picker-readable.
MODULE_PROGRESS: accounting N of M (must match docs/module-completion/accounting.json AFTER this PR)
ITEMS_TOUCHED: item-picker, expense-category-picker, account-picker (canonical repoint)
MIGRATE: N/A — code-only picker-source repoint; canonical tables already PER-ENTITY (no DDL). If any view underlies a picker, view swap is idempotent, above 202607960000, checksum-override same PR.
ROOT CAUSE: pickers read the QBO mirror `mdata.qbo_*` while inline-create writes canonical `catalogs.*` — write≠read ("diesel never appears").
FIX: repoint leftover item/expense-category/account pickers to canonical `catalogs.*`, entity-scoped. Files: client picker components + server picker API (bill/expense entry).
GUARD: scripts/verify-steps/NNN-verify-picker-canonical-source.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 leftover-picker enumeration + inline-create-then-select proof on prod.
REMAINING: item pickers closed by #3442; leftover expense-category + account pickers are this block's live scope; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
