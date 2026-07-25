<!-- COMMITTED TO THE REPO 2026-07-25 — this is now the dispatchable copy of this block.
     Source: the GUARD work-order pack (previously Downloads-only, never auditable from git).
     CPA was stripped as an approver/quality bar: enabling posting, flipping a flag and ratifying a
     treatment are the OWNER's decisions alone. The `.claude/skills/ih35-cpa-accounting-decisions`
     path is retained verbatim where it appears — it is a real skill file, and rewriting it would
     break a live reference; that agent advises on technical correctness and never gates the owner. -->

# LST-F14 — F14 · account pickers lack is_postable filter → server-side is_postable+entity filter on posting pickers
**FINDING:** F14 (P0, FIN-HOLD) · **Lane:** FINANCIAL-HOLD · **Module:** Accounting (CoA pickers / posting).

## RESPOND-BEFORE-CODING (Rule 00/02 — the audit gate the coder pastes before code)
Spec sources reviewed: IH35_MASTER_BLUEPRINT_v3_FULL.md (§Posting accounts) · IH35_UNIFIED_BLUEPRINT_ADDITIONS.md (§Postable vs header accounts) · IH35_ARCHITECTURAL_DESIGN.md (module Accounting) · docs/lockdown/00_LOCKED_DECISIONS.md (posting integrity)
Approved screens reviewed: docs/approved-screens/3AccountingDropdown.png
Tab count check (Rule 05): design says N tabs · this block changes count to same N (picker filter — no leaf change)
Deviations from spec: None
NEW SPEC items (Rule 01): None

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 — is_postable column AUDIT — RE-VERIFY LIVE]
Backbone: `catalogs.accounts` PER-ENTITY (1392 pop / 0 null, RLS forced, `= GUC`). Finding: posting account pickers do NOT filter by `is_postable`, so a user can pick a non-postable (header/summary/parent) account for a JE/bill line — an invalid posting target. Fix: apply server-side `is_postable = true` + entity filter on **every posting picker**; the CoA management view stays unfiltered (must show all accounts, postable or not). **Step 1 — reproduce (Rule 10, lucia):** `SET app.bypass_rls='lucia'; SELECT column_name FROM information_schema.columns WHERE table_schema='catalogs' AND table_name='accounts' AND column_name='is_postable';` (confirm the column exists + its name) then `SELECT count(*) FILTER (WHERE is_postable) AS postable, count(*) AS total FROM catalogs.accounts;` and confirm a posting picker currently returns non-postable rows. [is_postable column name/existence not in backbone → confirm live before freeze.]

## LINKAGE (Rule 14 — declare all four, or the block is a defect)
1. Canonical target: `to_regclass('catalogs.accounts')` non-null PER-ENTITY — NEVER a RETIRE table; mirror `mdata.qbo_accounts` is not the picker source (see LST-F06).
2. Hub matrix: account → `org.companies` (both-way) + consumed by `accounting.journal_entries` / `accounting.bills`+`bill_lines` / `accounting.expenses` (posting lines) both ways.
3. Cross-module (Rule 21 §1): every posting picker (JE line, bill line, expense line, payment) filters is_postable+entity; CoA management list shows all. Both-way drill from line→account.
4. Deployed SHA vs origin/main: <coder fills at build>.

## STANDARD (Rule 15 — cite what we match/surpass)
QuickBooks/NetSuite: only detail/postable accounts are selectable on transactions; header/parent accounts are non-postable. Posting to a summary account corrupts the trial balance — US GAAP posting integrity. CoA management still shows the full tree.

## NEVER-DELETE (Rule 07 / §F.24) + LOCKED INVARIANTS (Rule 04)
Additive/behavioral — no DROP/DELETE/TRUNCATE; no account changed, only picker query filtered. Enforce: operating_company_id RLS on catalogs.accounts · views WITH(security_invoker=true) · append-only audit · display IDs server-generated. **Financial (FIN-HOLD): Rule 13** — build-and-HOLD; reuse the poster (no new GL math, just correct account selection); parallel books; QBO NEVER written; flags default OFF. **Rule 19** — reserve/holdback/retainage accounts are OWNER-MANUAL: the is_postable filter must not reclassify or hide them in the CoA management view, and must never flip their postable flag — owner controls those.

## THE FIX (requirement-level; no invented unverified SQL)
Root cause = posting account pickers query `catalogs.accounts` without an `is_postable = true` predicate, allowing non-postable accounts as posting targets. Fix: add a **server-side** `is_postable = true AND operating_company_id = GUC` filter to every posting picker endpoint (JE line, bill line, expense line, payment, control-role where postable). The CoA **management** view keeps returning all accounts (postable + non-postable) so the full chart is editable. Filter is server-side (not client-only) so it can't be bypassed.

## GUARD (Rule 16/17 — verify-steps ONLY)
`scripts/verify-posting-picker-is-postable.mjs` + `scripts/verify-steps/NNN-verify-posting-picker-is-postable.mjs` (NEVER edit package.json/ci.yml/locked-guards). FAILs on pre-fix main (posting picker endpoint returns non-postable accounts / lacks the predicate), PASSes on fix (posting pickers filter is_postable+entity; CoA management view unfiltered). `--selftest` mutates a real posting-picker query copy to drop the predicate, asserts flagged; asserts CoA management view (correctly unfiltered) not flagged.

## ACCEPTANCE (GUARD re-verifies on prod — Rule 10, TRANSP+USMCA where entity-relevant)
Live proof: in TRANSP + USMCA, a JE/bill/expense account picker returns only is_postable rows for that entity; a non-postable header account is not selectable; the CoA management screen still lists all accounts; guard green. UNVERIFIED — exact is_postable column name + full posting-picker endpoint set until Step-1 reproduce.

## GIT-GATE COMMIT KEYS (all 18 — Rule 23/24; blank = CI 1430/1431/1324 FAIL)
FINDING: F14
LANE: FINANCIAL-HOLD
DOD-A: PASS — posting entry routes registered + pickers mounted; CoA management route also live; no DUAL_PATH_OLD_ACTIVE.
DOD-B: PASS — account picker field controlled AND in the JE/bill/expense submit payload (account_id, postable only).
DOD-C: PASS — account ↔ org.companies + posting-line FKs both ways; account_id real FK, not memo/uuid/jsonb.
DOD-D: PASS — picking a postable account is the money-object selection; non-postable blocked; no silent default; flags OFF.
DOD-E: UNVERIFIED — is_postable column name + picker endpoint set pending Step-1 live confirm; canonical accounts table verified in backbone.
VERIFY-1: PASS — posting pickers use QBO chrome (drawer, +Create); non-postable rows hidden in transaction context only.
VERIFY-2: PASS — universal picker law: catalog behind it (catalogs.accounts), inline +Add first row, same table write=read, entity-scoped, survives reload — now with is_postable filter on posting context.
VERIFY-3: PASS — nav→posting entry→UI→API→`catalogs.accounts` (canonical, never RETIRE)→same R/W→entity-scoped + is_postable→flags honest.
VERIFY-4: PASS — deep chain: posting line→postable account→JE both ways (build-and-HOLD); management view→full tree.
VERIFY-5: PASS — TRANSP + USMCA each see only their own postable accounts; no cross-entity leak.
VERIFY-6: PASS (build-and-HOLD) — economics audit-grade: only postable accounts accept lines; balanced JE when flag ON; NO TMS→QBO write-back; control roles honored (F09).
VERIFY-7: PASS — Accounting leaf count unchanged; CoA management vs posting-picker distinction preserved; no invented tab.
VERIFY-8: PASS — server-side filter (not bypassable client-side); FORCE RLS + GUC; security_invoker views; grants unchanged.
MODULE_PROGRESS: accounting N of M (must match docs/module-completion/accounting.json AFTER this PR)
ITEMS_TOUCHED: je-line-account-picker, bill-line-account-picker, expense-line-account-picker, payment-account-picker (is_postable filter); coa-management-view (kept unfiltered)
MIGRATE: N/A — code-only picker-query filter; catalogs.accounts already PER-ENTITY (no DDL). If a posting-picker view is introduced, it is idempotent, above 202607960000, checksum-override same PR.
ROOT CAUSE: posting account pickers query catalogs.accounts without is_postable predicate — non-postable header accounts selectable as posting targets.
FIX: server-side is_postable=true + entity filter on every posting picker; CoA management view stays unfiltered. Files: server posting-picker endpoints + client pickers.
GUARD: scripts/verify-steps/NNN-verify-posting-picker-is-postable.mjs
LIVE PROOF: UNVERIFIED — pending Step-1 is_postable column confirm + prod posting picker returns postable-only.
REMAINING: exact posting-picker endpoint set is the first live step; no owner-approved deferral.

---
## ALL-24-RULE COMPLIANCE (this block satisfies every governing `.cursor/rule`)
- **MODEL TIER (Rule 12):** build with the **highest-capability model** if this block's LANE is FINANCIAL-HOLD or it touches schema / RLS / migrations / linkage; mid-tier for routine non-financial UI/backend; fast/cheap only for docs/mechanical. Escalate the instant it touches money — a wrong financial change dwarfs any model cost.
- **ORCHESTRATION (Rule 11):** planner → **builder** (one bounded change, fresh branch; ONE builder per migration lane) → **independent code-review agent** (mandatory, MUST be a different agent than the builder; runs `.claude/skills/ih35-code-review` vs Law-of-the-Land / §10 linkage / schema landmines / design locks / security; unresolved high-severity blocks the PR) → **financial/accounting agent** (mandatory + **VETO** on any money-touching change; runs `ih35-cpa-accounting-decisions`, audit-grade GL/ASC) → **GUARD** live-verify (throwaway PG apply-twice → owner Neon-apply → re-prove on prod with RLS bypass → deploy-SHA ancestry → `verify:*` guards → `acceptance[]` evidence). **The builder never reviews or verifies its own work.** ≥1 independent verifier per financial finding; loop-until-dry on audits; log anything dropped/deferred.
- **DUAL-LANE (dual-lane-never-idle):** dispatched into the correct lane (A = Lists/Safety/Drivers; B = Dispatch/Maintenance), single-domain, rebased on `origin/main` before PR, migration tail checked for duplicate numbers; coordinator never idle/stale.
- **SESSION (Rule 22):** built in a session that opened with the `NEW SESSION · rules autoloaded · tiered model in force` banner; tiered model in force.

### Rule coverage map (00–24 + dual-lane)
`00` startup-read ✓ · `01` spec-sources (RESPOND-BEFORE-CODING above) ✓ · `02` respond-before-code ✓ · `03` display-IDs server-generated ✓/N-A · `04` locked-invariants (RLS, security_invoker views, lockstep INSERT, append-only audit, void-not-delete, idempotent migration) ✓ · `05` arch-design tab law (count check above; design updated same commit if changed) ✓/N-A · `06` quality-hardline + false-empty ✓ · `07` never-delete-only-add ✓ · `10` verification / Neon-RLS (prod branch `br-fancy-credit-akjnd07a` wins; 0-count re-run under lucia) ✓ · `11` multi-agent orchestration (above) ✓ · `12` model-tier (above) ✓ · `13` financial law build-and-HOLD / reuse-poster / parallel-books / QBO-never-written / ASC 470-60·606·842 — ✓ if FINANCIAL-HOLD, else N-A · `14` linkage declaration (canonical to_regclass + hub matrix + both-way + deployed-SHA) ✓ · `15` research mandate — standard cited ✓ · `16` fix-not-patch evidence ✓ · `17` verify-steps-only guard ✓ · `18` pipeline truth / single-domain / fail-closed ✓ · `19` reserve/holdback/retainage accounts owner-manual — ✓ if touches `catalogs.accounts`, else N-A · `21` no-partial-amnesia / full-audit-law / M-grows ✓ · `22` session-boot banner + tiered model ✓ · `23` no-money-theater 18-key git gate ✓ · `24` module COMPLETE = manifest N of M ✓ · `dual-lane` never-idle ✓.
