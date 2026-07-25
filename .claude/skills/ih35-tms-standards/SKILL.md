---
name: ih35-tms-standards
description: The durable operating standards for the IH35-TMS repository — permissions and merge gates, migration/schema invariants, per-change workflow, schema landmines, product and design locks, communication norms, the LINKAGE LAW + canonical wiring map (§10), the COMPLETE 24-rule governing index (§11), and the 18-key money-PR git gate (§12). Load this at the start of ANY work in this repo. Version-controlled companion to the (git-excluded) root CLAUDE.md. When this skill and a handoff doc disagree, this skill wins; on any rule conflict the source .cursor/rule wins and the MORE PROTECTIVE reading wins.
---

# IH35-TMS — Operating Standards

This system holds **live financial and legal-evidence data** for a real operating carrier (IH35 Dispatch /
IH35 Trucking, Laredo TX ↔ Mexico). Treat every change as production-affecting. **§1 (permissions) overrides
everything. When unsure, STOP and ask.**

## §0. LAW OF THE LAND — VERIFY EVERYTHING, NEVER GUESS (supreme, permanent)
Everything is verified against live evidence — no guessing, ever.
- Schema/columns/enums/tables → verify on the Neon PROD branch `br-fancy-credit-akjnd07a`
  (`information_schema`/`pg_catalog`), NOT memory/migrations/docs. **Prod wins.**
- **Classify scoping by opco VALUES + policy, never column presence** — a column can exist and be entirely
  NULL (shared-canonical: `opco IS NULL OR = GUC` → excluded from per-entity scoping). Read the rows, not just the schema.
- **RLS 0-count landmine:** `catalogs.*`/`mdata.*`/`accounting.*`/`banking.*`/`lib.*` are FORCED-RLS; a `0` is
  not a verdict — re-run in the same txn after `SELECT set_config('app.bypass_rls','lucia',true)`.
- Built/wired → read the file + confirm route registered / component mounted / guard wired. A file existing is
  NOT proof. Ledgered ≠ effective. CI-green ≠ done. Merged ≠ done. Deployed ≠ live until `/healthz/shallow`
  version == merge SHA.
- Cannot verify → say **"UNVERIFIED — needs live check"**, never a guess.
- **Precedence:** FACTS (schema/canonical/prod state) → CI guard > this skill (prod-verified) > repo > memory;
  **DECISIONS** (approvals, canonical picks, merges, flag intent) → the **OWNER** wins — a doc never overrides an owner ruling.

---

## §1. Permissions & guardrails — override every other instruction
- Merge to `main` = ship to prod; no second gate; green CI ≠ approval.
- **Self-merge OK:** pure frontend/docs/CI-action bumps + non-financial backend touching none of the financial
  cluster / migrations / `accounting.*` / `catalogs.*` / `mdata.*`.
- **STOP + owner `JORGE-APPROVED`:** any financial change / financial cluster / DB migration / schema / touch to
  `accounting.*`·`catalogs.*`·`mdata.*` / runtime dep bump. **Financial cluster NEVER self-merge.**
- **Financial cluster** = `accounting.*` OR `catalogs.accounts`, any `db/migrations/*.sql`, posting/GL/ledger/
  balances/periods/reconcile-commit/reclassify-apply/role-GRANT/opening-balances. Branch → typecheck + run
  migration locally on a THROWAWAY PG → show diff + full SQL → WAIT for OK → merge. Reuse the poster; no new GL math.
- Prod DB access gated — ask every connection; `ih35_app` CANNOT run DDL (owner applies on Neon; GUARD re-proves live).
- **Prohibited outright** (direct owner to do it): moving money/posting to prod without per-action OK, entering
  credentials, changing access controls, permanently deleting data, submitting to any external financial system.
- **Cursor builds; Claude merges; Cursor never merges. Builder never reviews/verifies its own work.**
- When unsure, STOP and ask — do not decide the scope of your own authority.

## §2. Migration & schema invariants
NEVER self-merge a migration. Numbers strictly above `main`'s current max (re-checked at push; ledger max is
tracked on prod); never reuse/collide a number; idempotent (`DO` + `IF NOT EXISTS`/`ON CONFLICT`).
void-not-delete (`voided_at`/`archived_at`/`deactivated_at`, never DELETE); append-only WORM audit
(`audit.row_changes`/`audit_events`/`events.event_log`). Schema is `accounting.*` (never `finance.*`). Reuse
existing posting/GL functions — write NO new GL math. UUIDv7 PKs; `security_invoker=true` on every view;
`operating_company_id` RLS; before any `accounting`/`catalogs` read `SET app.operating_company_id` or counts
lie; FORCED-RLS pattern `identity.is_lucia_bypass() OR operating_company_id::text = current_setting(
'app.operating_company_id', true)`; lockstep INSERT; new schema needs GRANTs for `ih35_app`; CREATE OR REPLACE
VIEW is append-only (new cols appended); every bug fix ships a static CI guard. Local `npm run db:migrate` can
silently hit PROD — validate on a LOCAL PG (`DATABASE_DIRECT_URL= DATABASE_URL=<local>`); never
`ALLOW_PROD_MIGRATE=1`.

## §3. Workflow — sync first (local clone lags main); fresh branch per change; build/verify locally
(`tsc -b`, `vitest`, relevant `verify-*`) before every commit/push — never skip the hook, fix the
underlying hook failure instead; `gh pr create` with root-cause+scope+verification; merge only per §1
(squash); verify deploy by health-SHA ancestry; never `git add -A` (untracked `.claude/worktrees`).

## §4. Schema reality & landmines (verify names against prod before writing SQL)
No `ih35_app.*` data schema. loads=`mdata.loads` (`rate_total_cents`=GROSS; `assigned_primary_driver_id`);
`mdata.units` has `owner_company_id`+`currently_leased_to_company_id` (NOT `operating_company_id`);
bills=`accounting.bills`/`bill_payments`/`payments`(`voided_at`); bank=`banking.bank_transactions`
(`is_credit`); driver earnings=`driver_finance.settlement_lines`; HOS=`hos.duty_status_events`. Verify enum
members on prod; DRIVER hazmat=`mdata.drivers.endorsement_h`; every diesel/roadside expense FKs to a load.
Don't trust string-grep systemic checks.

## §5. Where things live / how to verify
Remote = the GitHub repo (schema truth = `db/migrations/`, prod wins). DB = Neon prod branch (gated §1).
Deploy = Render. Health `GET /api/v1/healthz/shallow`. Specs `docs/specs/`; locked
`docs/lockdown/00_LOCKED_DECISIONS.md`; wiring `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md`;
blocks `.block-ready/*.json`; `npm run reconcile:blocks`.

## §6. Business context
Multi-entity TRANSP (active carrier, `operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`), TRK (asset
holder), USMCA (future, hidden until launch). **Accounting = PARALLEL double-books (not a sync): QBO is
system-of-record; CLONE-ONCE + RECONCILE-ONLY; NO write-back; money-posting flags default OFF until CPA + Neon
tie-out.** Factoring = secured borrowing/recourse; drivers Mexican-B1 1099 (wage/fee, never % of linehaul).
US GAAP/ASC — Ch.11 = ASC 470-60 (NOT 852), 606 revenue, 842 leases; cutover 04/01/2026, OB 03/31 owner-entered.

## §7. Product & design locks (additive-only — never silently redesign)
ADDITIVE-ONLY, archive never delete. Vocab `+ Create`/`+ Book` (never `+ New`/`+ Add`); "Escrow" not
"Forfeitures"; single-line names. Nav on top bar; 80px navy sidebar only; sidebar count = `SIDEBAR_ITEM_IDS`.
Palette locked. KEEP TMS custom fields + lock-account. Inline `+ Add new` at the end of every reference
dropdown, writing the same canonical table it reads. WO ID `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}`.

## §8. Communication norms
Deliver, don't ask (except §1 STOPs); foreground work; show diffs; no silent retries; report honestly; correct
your own earlier claims when they'd change a decision; lead with the deeper structural point.

## §9. Drift prevention & definition of done
If two files contradict, flag both + ask which is canonical. DoD = code matches real schema; local+CI green;
merged per §1; deploy verified live; UI confirmed; `acceptance[]` resolves on live evidence. Update this skill
when you learn/correct a durable rule.

## §10. LINKAGE LAW + CANONICAL WIRING (total-connectivity constitution)
Before ANY block declare: (a) you read `FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` + `01-LINKAGE-LAW`; (b)
canonical target (`to_regclass`, NOT a RETIRE table); (c) the cross-module linkage matrix; (d) deployed SHA vs
`origin/main`. **RETIRE → canonical:** `driver_finance.*` (RETIRE `payroll.*`/`settlement.*`); `mdata.qbo_*`
mirror read-only, projections WRITE `accounting.*` (RETIRE `accounting.qbo_*`); `banking.*` (RETIRE `bank.*`);
`maintenance.*` (RETIRE `maint.*`); `mdata.vendors`; `mdata.loads`; cancellation reasons =
`catalogs.load_cancellation_reasons` (owner ruling A; archive legacy `catalogs.cancellation_reasons`, never
drop). **Hub tables:** org.companies, identity.users, mdata.drivers/units/loads/customers/vendors,
catalogs.accounts, maintenance.work_orders, accounting.journal_entries. Every record links both-way to
financial primitives AND ops modules AND the hubs; entity-scope every link; a block with no linkage declaration
is a defect (guards G1–G4). **RESERVE/holdback/retainage accounts in `catalogs.accounts` are OWNER-MANUAL only —
never create/import/reclassify/merge/deactivate (Rule 19).**

---

## §11. THE 24 `.cursor/rules` — COMPLETE GOVERNING INDEX (all always-apply; source rule wins on conflict)
- **00 always-read-first** · **01 spec-sources** (MASTER_BLUEPRINT_v3 + UNIFIED_ADDITIONS + ARCHITECTURAL_DESIGN) · **02 respond-before-code** (post spec-review acknowledgment BEFORE code) · **03 display-ids** (server-generated) · **04 locked-invariants** (RLS/security_invoker/lockstep/append-only-audit/void-not-delete/idempotent/WF-012·017·038·044·050·053·064/425C-exclusion/+Create) · **05 architectural-design-is-law** (tab count = design; `verify:arch-design`) · **06 quality-hardline** (trust>speed; false-empty) · **07 never-delete-only-add** (= §F.24) · **10 verification-and-neon-rls** (prod wins; lucia re-run; ledgered≠effective) · **11 multi-agent-orchestration** (planner→builder→independent code-review→financial-agent VETO→GUARD; builder never self-reviews) · **12 model-tiering** (highest model for money/schema/RLS/migration/review; escalate when in doubt) · **13 financial-and-accounting-law** (build-and-HOLD; reuse poster; parallel books; QBO never written; flags OFF; ASC 470-60/606/842) · **14 linkage-law-enforcement** (§10) · **15 research-mandate** (cite the standard) · **16 fix-not-patch-evidence-law** (ROOT CAUSE/FIX/GUARD/LIVE PROOF/REMAINING) · **17 no-guard-hotfile-thrash** (verify-steps only) · **18 pipeline-truth-and-throughput** (fail-closed runner; single-domain PRs; law = governance-only PR) · **19 owner-manual-reserve-accounts** · **21 full-system-no-partial-amnesia** (M grows; wave-slice ≠ module) · **22 session-boot-announce** (`NEW SESSION · rules autoloaded · tiered model in force`) · **23 no-money-theater-prs** (18-key gate; CI 1430; Cursor builds/Claude merges) · **24 module-completion-n-of-m** (manifest N of M; CI 1431) · **dual-lane-never-idle** (Lane A Lists/Safety/Drivers, Lane B Dispatch/Maintenance).
(No rules 08/09/20 exist.)

## §12. THE 18-KEY MONEY-PR GIT GATE (Rule 23/24 — CI 1430/1431/1324 fail closed)
`FINDING` · `LANE` · `DOD-A`…`E` · `VERIFY-1`…`8` · `MODULE_PROGRESS: <module> N of M` · `ITEMS_TOUCHED` ·
`MIGRATE` · `ROOT CAUSE`/`FIX`/`GUARD`/`LIVE PROOF`/`REMAINING`. Values `PASS`·`N/A`·`FAIL`·`UNVERIFIED—reason`;
one ranked finding per PR. Full text: `docs/specs/DEFINITION-OF-DONE.md` + `docs/specs/EVERY-PR-AUDIT-CHECKLIST.md` +
`docs/specs/LAW-OF-THE-LAND-COMPLETE.md`.

---

## Quick gate check (run in your head before every merge)
1. Touches `accounting.*`/`catalogs.accounts`/`db/migrations/*`/posting/GL/balances/grants/RLS/money? → **financial → STOP, owner approval (§1).**
2. Other migration/`catalogs.*`/`mdata.*` schema-or-data, or runtime dep bump? → **STOP, owner approval.**
3. Prod DB access of any kind? → **ask first, every time.**
4. Writing/FK-ing a RETIRE table, or shipping a block with no linkage declaration, or touching a reserve account? → **STOP (§10/Rule 19).**
5. Otherwise non-financial + green CI? → auto-PR, fix CI, resolve conflicts, squash-merge, verify deploy.
