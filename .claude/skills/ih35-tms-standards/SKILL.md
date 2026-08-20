---
name: ih35-tms-standards
description: The durable operating standards for the IH35-TMS repository — permissions and merge gates, migration/schema invariants, per-change workflow, schema landmines, product and design locks, communication norms, the LINKAGE LAW + canonical wiring map (§10), the COMPLETE governing index of all 43 rule files (§11), and the 18-key money-PR git gate (§12). Load this at the start of ANY work in this repo. Version-controlled companion to the (git-excluded) root CLAUDE.md. When this skill and a handoff doc disagree, this skill wins; on any rule conflict the source .cursor/rule wins and the MORE PROTECTIVE reading wins.
---
**HONEST BUILT + LAUNCH (2026-08-14):** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` — launch without Live Chrome = Fully-Wired 1–11 with leaf-specific Built only; seat lanes Cursor/CC-1/Codex; no `leafRe:.*` / `|.*` / word-blanket Built; no new scoreboard columns.

**USMCA ONLY UNTIL LAUNCH (2026-08-19):** `docs/lockdown/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md` — only USMCA operating; no TRK/TRANSP work; QBO sync parked; 100% = Fully-Wired 1–12 on USMCA.


# IH35-TMS — Operating Standards

**★★ SESSION BOOT (every agent):** load `docs/specs/STANDING-SESSION-DIRECTIVE.md` (§0–§10 · §6 SEARCH BEFORE YOU ASK · §7 TEST WITH PLACEHOLDER NUMBERS · §10 FULLY WIRED),
`docs/specs/OWNER-QUALITY-COMPACT.md` (ALL QUESTIONS HAVE BEEN ASKED AND ANSWERED · Claude.docx permanized),
`docs/specs/DELIVERY-METHOD-LOCKED.md`, and `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` before other work.
Cursor = screens/janitor; Claude Coder = money/Neon;
Cascade = active-slice auditor. **Every Cursor PR title MUST begin with `Cursor-`** (rule 34 · verify-step 2377).
Presence ratchet: `scripts/verify-standing-directive-present.mjs` (2374) ·
`scripts/verify-owner-quality-compact-present.mjs` (2380) · `scripts/verify-cursor-pr-title-prefix.mjs` (2377).

**Fully wired** = the 12-item list in `FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` (surface bar + Live Chrome last). Never soft-answer “includes all.”

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
- **THE BYPASS IS NOT PROOF (2026-08-03).** `app.bypass_rls='lucia'` is **INERT on AND-gated policies** — it
  returns `0` silently, so a positive control on a DIFFERENT table proves nothing. A `0` is a verdict only with
  the **completeness discriminator on the SAME table**: `visible == n_live_tup`, `n_tup_del = 0`, `current_user`
  asserted in the same statement (the MCP role alternates `ih35_app` / `neondb_owner`), and the positive control
  on that same table. Prefer per-entity `SET app.operating_company_id` when scoping is the question. Rule 10 +
  `verify-zero-count-completeness-discriminator` (step 2039).
- Built/wired → read the file + confirm route registered / component mounted / guard wired. A file existing is
  NOT proof. Ledgered ≠ effective. CI-green ≠ done. Merged ≠ done. Deployed ≠ live until `/healthz/shallow`
  version == merge SHA.
- Cannot verify → say **"UNVERIFIED — needs live check"**, never a guess.
- **★★ CLASSIFY ROW ORIGIN BEFORE CALLING ANY GAP A DEFECT (owner ruling 2026-08-04 —
  `docs/lockdown/LOAD-LINKAGE-SCOPE-RULING-2026-08-04.md`).** Imported rows are legitimately unlinked /
  unposted; that is **EXPECTED STATE, not a defect**, and "fixing" it means **inventing** financial data.
  Same shape, twice, both verified on prod: ledger **row 665** — 16,245 of 16,250 `accounting.bills` are
  QBO clones, so "no journal entry" is CORRECT under parallel books (a backfill would DOUBLE the books);
  **LINK-F01** — all 1,548 `fuel.fuel_transactions` are `relay_ingest`, so `load_id IS NULL` is CORRECT
  because the TMS has not dispatched loads yet. **Load linkage is going-forward ONLY. NEVER invent a
  load FK.** Mark the historical cohort exempt (`load_required=false`,
  `load_exemption_reason='PRE_TMS_DISPATCH_IMPORT'`) and guard only that NEW TMS-native records link.
  **Mandatory before reporting any gap:** (1) what fraction of rows are import-origin (`qbo_*_id`,
  `notes ILIKE '%relay_bridge=1%'`, `source_system`, import-cohort dates)? (2) could the TMS ever have
  produced the "missing" thing for those rows? (3) if no → say EXPECTED STATE, open no card, and build no
  guard that reddens on it. **Guards scope to TMS-native records, never the whole table** — a guard red on
  expected state is the `expected-state-recorded-as-failure` anti-pattern. Getting this right once does
  not count; apply the origin test every time. Also: `mdata.loads` is a **RETIRE table** (§10) — its row
  count is NOT authoritative evidence; canonical emptiness lives in `dispatch.*` / `expense_attribution.*`.
- **Precedence:** FACTS (schema/canonical/prod state) → CI guard > this skill (prod-verified) > repo > memory;
  **DECISIONS** (approvals, canonical picks, merges, flag intent) → the **OWNER** wins — a doc never overrides an owner ruling.

---

## §1. Permissions & guardrails — override every other instruction
**OWNER LAW (2026-08-03, FINAL — supersedes every earlier merge/approval clause): NO HOLDS. NO `JORGE-APPROVED`
LABEL. Claude and all coders (Cursor / Cascade / Devin / Claude Coder) have FULL Neon access and merge authority.**
All owner questions are asked-and-answered up front (`PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26`); there is nothing
to wait for at merge time. Asking for approval, a label, or an "OK to merge" at merge time is itself a violation.
The owner steers by DECISION in chat (canonical picks, "turn the flag on", legal calls) — never by a keystroke or a
label. The `JORGE-APPROVED` label is deleted, not optional.

- Merge to `main` = ship to prod; green CI ≠ *done* (deploy + live proof close it), but green CI IS mergeable.
- **Coders MERGE ON GREEN — every lane, including financial/migration/`accounting.*`·`catalogs.*`·`mdata.*`.** No
  owner gate. The only thing that stops a PR is *it's wrong*, and the fix for wrong is correct-and-reopen, never a
  hold.
- **FULL NEON ACCESS.** Claude and the coders apply migrations and flip posting flags **themselves** on Neon
  (LOCKED 2026-08-02: "the coder has full access; the owner does not turn on anything in Neon"). Do NOT tell the
  owner to hand-apply or to run Neon.
- **The safeguard is PROOF, not approval.** For any financial/migration change: additive/idempotent migration + its
  own CI guard + tests → verify every premise live BEFORE apply → **apply on Neon yourself** → post the migration
  SHA → **GUARD verifies live AFTER** (independent Neon read, positive-controlled; a `0` is not proof). Reuse the
  existing poster; write NO new GL math. Posting flags default OFF per entity until the owner says "turn it on" in
  chat (a decision, not a label).
- **Retained SAFETY controls (these are proof/integrity, NOT approval holds — keep them):** WORM / void-not-delete;
  no TMS→QBO write-back ever; opening balances owner-entered; the hold-merge-gate **migration firewall** (a
  migration cannot ride to prod without the runtime firewall in `scripts/db-migrate.mjs`); the 18-key evidence
  block; GUARD's independent live verify-after (integrity check, runs AFTER merge — never a pre-merge hold).
- **Prohibited outright** (direct owner to do it): moving money / sending payments / submitting to any EXTERNAL
  financial or factoring system; entering credentials into forms; permanently deleting data (archive, never delete).
- When genuinely blocked because a fact can't be verified, say **"UNVERIFIED — needs live check"** and get the
  fact — never stop to ask for permission you already have.

## §2. Migration & schema invariants
Coders apply migrations on Neon themselves and merge on green (§1 OWNER LAW — full access, no hold). Numbers
strictly above `main`'s current max (re-checked at push; ledger max is tracked on prod); never reuse/collide a
number; idempotent (`DO` + `IF NOT EXISTS`/`ON CONFLICT`).
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
(`is_credit`); driver earnings=`driver_finance.settlement_lines` (→ `driver_settlements`; **HAS
`load_id` nullable FK to `mdata.loads`** — prefer it for settlement↔load joins; do NOT invent
"no load_id" landmines; density may be sparse / untested on older rows); HOS=`hos.duty_status_events`.
Verify enum members on prod; DRIVER hazmat=`mdata.drivers.endorsement_h`; every diesel/roadside expense
FKs to a load. Don't trust string-grep systemic checks.

## §5. Where things live / how to verify
Remote = the GitHub repo (schema truth = `db/migrations/`, prod wins). DB = Neon prod branch (gated §1).
Deploy = Render. Health `GET /api/v1/healthz/shallow`. Specs `docs/specs/`; locked
`docs/lockdown/00_LOCKED_DECISIONS.md`; wiring `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md`;
blocks `.block-ready/*.json`; `npm run reconcile:blocks`.

## §6. Business context
Multi-entity TRANSP (active carrier, `operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`), TRK (asset
holder), USMCA (**ACTIVE — the test entity; NOT hidden/future**). **Accounting = PARALLEL double-books (not a
sync): QBO is system-of-record; CLONE-ONCE + RECONCILE-ONLY; NO write-back. POSTING FLAGS ARE ON for all three
entities — the ONLY thing OFF is QBO write-back (`QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`).**
**There is NO CPA and NO CPA gate** (`DELIVERY-METHOD-LOCKED.md` §Phase 4, `.cursor/rules/11`,
`00_LOCKED_DECISIONS.md` §9.9 — owner ruled "flags on … on all", 2026-07-20). The prior wording here —
"money-posting flags default OFF until CPA + Neon tie-out" — was STALE and contradicted the owner law at every
session boot; **verified live on prod `br-fancy-credit-akjnd07a` 2026-08-05** (`lib.feature_flag_overrides`,
`org.companies`): TRANSP `is_active=true` / 22 posting flags enabled / 0 QBO-push enabled; TRK true / 21 / 0;
USMCA true / 22 / 0. Flag-key DEFAULTS remain OFF; the per-entity overrides above drive the ON state, and only
the owner decides in chat when a flag flips.
Factoring = secured borrowing/recourse; drivers Mexican-B1 1099 (wage/fee, never % of linehaul).
**§9.5 DEDUCTION AUTHORIZATION — OWNER-LOCKED 2026-07-04/07-05, reaffirmed 2026-08-05 (SUPERSEDES blueprint
MUST 3.13.3.3.A + 3.13.3.4.A):** the **signed HIRE CONTRACT authorizes payroll/settlement deductions. NO
separate driver e-sign, NO per-expense acknowledgment before auto-deduction**; the company decides the
deduction at settlement preparation. Never build `pending_acknowledgment` / `requires_acknowledgment` blocking,
and never re-add it from the blueprint (those MUSTs are struck through + annotated).
**Source of record — cite, don't re-derive:** `apps/backend/src/legal/signed-finance-handoff.service.ts:25-33`
(legacy `driver_deduction_auth` codes kept ONLY to honour pre-existing signed instances; the primary document is
the hire contract) · audit item **0008-f RESOLVED** · `00_LOCKED_DECISIONS.md` §9.5 · `docs/CLAUDE.md`.
**The ONLY settlement acknowledgment is the COMPANY USER's sign-off — `MUST 3.4.2(d)(e)`** (debt-alert
disclosure acknowledged by the user signing off + signature on file) = `driver_settlements.acknowledged_at` /
`acknowledged_by_user_id`, written with the authed company user (`settlements.routes.ts:412`). **That control
STAYS** — it is not a driver ack. Owner decision wins over spec (§0: DECISIONS → the owner).
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
mirror read-only, projections WRITE `accounting.*` (RETIRE `accounting.qbo_*`) — **PROD-VERIFIED
2026-08-05 (`pg_class`, br-fancy-credit-akjnd07a): `mdata.qbo_*` = 14 tables incl. EVERY transactional
one (`qbo_ap_bills`, `qbo_bills`, `qbo_purchases`, `qbo_ar_invoices`, `qbo_ar_payments`,
`qbo_vendor_credits`, `qbo_sync_runs`, ~125K rows); `accounting.qbo_*` = only 5 (accounts, customers,
vendors, remote_counts, remote_count_collection_state) and has NO transactional tables at all.** A
recon/loans build pointed at `accounting.qbo_*` finds no bills, purchases or payments and silently
reconciles nothing. The handoff doc `LOANS-ADVANCES-BUILD-INSTRUCTIONS-FINAL.md` had this exact
mapping INVERTED ("not `mdata.qbo_*` (use `accounting.qbo_*`)"); it is corrected + struck through
there, but that file is NOT in the repo — **this line is the durable record; trust it over any
handoff bundle.**; `banking.*` (RETIRE `bank.*`);
`maintenance.*` (RETIRE `maint.*`); `mdata.vendors`; `mdata.loads`; cancellation reasons =
`catalogs.load_cancellation_reasons` (owner ruling A; archive legacy `catalogs.cancellation_reasons`, never
drop). **Hub tables:** org.companies, identity.users, mdata.drivers/units/loads/customers/vendors,
catalogs.accounts, maintenance.work_orders, accounting.journal_entries. Every record links both-way to
financial primitives AND ops modules AND the hubs; entity-scope every link; a block with no linkage declaration
is a defect (guards G1–G4). **RESERVE/holdback/retainage accounts in `catalogs.accounts` are OWNER-MANUAL only —
never create/import/reclassify/merge/deactivate (Rule 19).**

---

## §11. THE 43 `.cursor/rules` FILES — COMPLETE GOVERNING INDEX (all always-apply; source rule wins on conflict)
- **00 always-read-first** · **01 spec-sources** (MASTER_BLUEPRINT_v3 + UNIFIED_ADDITIONS + ARCHITECTURAL_DESIGN) · **02 respond-before-code** (post spec-review acknowledgment BEFORE code) · **03 display-ids** (server-generated) · **04 locked-invariants** (RLS/security_invoker/lockstep/append-only-audit/void-not-delete/idempotent/WF-012·017·038·044·050·053·064/425C-exclusion/+Create) · **05 architectural-design-is-law** (tab count = design; `verify:arch-design`) · **06 quality-hardline** (trust>speed; false-empty) · **07 never-delete-only-add** (= §F.24) · **10 verification-and-neon-rls** (prod wins; lucia re-run; ledgered≠effective) · **11 multi-agent-orchestration** (planner→builder→independent code-review→financial-agent VETO→GUARD; builder never self-reviews) · **12 model-tiering** (highest model for money/schema/RLS/migration/review; escalate when in doubt) · **13 financial-and-accounting-law** (financial cluster = merge on green, no owner gate — OWNER LAW 2026-08-03; reuse poster; parallel books; QBO never written; flags OFF until owner chat-decision to flip) · **14 linkage-law-enforcement** (§10) · **15 research-mandate** (cite the standard) · **16 fix-not-patch-evidence-law** (ROOT CAUSE/FIX/GUARD/LIVE PROOF/REMAINING) · **17 no-guard-hotfile-thrash** (verify-steps only) · **18 pipeline-truth-and-throughput** (fail-closed runner; single-domain PRs; law = governance-only PR) · **19 owner-manual-reserve-accounts** · **21 full-system-no-partial-amnesia** (M grows; wave-slice ≠ module) · **22 session-boot-announce** (`NEW SESSION · rules autoloaded · tiered model in force`) · **23 no-money-theater-prs** (18-key gate; CI 1430; every coder builds AND merges on green — OWNER LAW 2026-08-03) · **24 module-completion-n-of-m** (manifest N of M; CI 1431) · **25 one-push-money-fail-fast** (`money-pr-local-gate` first in pre-push; amend hole closed; CI 1702; no CI cancel thrash) · **29 cursor-claude-parity-ship** (expanded local gate: migration HH band + EVEN steps + no CLAIMED edit + EntityLink; never `--no-verify`; CI 1998) · **30 claude-green-evidence-format** (FINDING-first body/commit; `LIVE PROOF: … exit 0`; never stack/soft-reset; `cursor-pr-body-gate` before `gh pr create`; CI 2088) · **dual-lane-never-idle** (Lane A Lists/Safety/Drivers, Lane B Dispatch/Maintenance).
· **26 serialize-scoreboard-hotfiles** (at most ONE ready PR may edit `docs/module-completion/*.json`, the ACCT surface matrix, or `CLAIMED-NUMBERS.json`; `gh pr list` BEFORE opening) · **27 one-open-pr-per-area** (ONE open PR per area — accounting/money, banking, settlements, dispatch, safety, lists, migrations; NEVER open the next same-area PR until the current is squash-merged and the branch deleted; cross-area parallel only when scopes are disjoint) · **28 audit-coverage-single-source** (`docs/audit/AUDIT-COVERAGE-LIVE.md` is THE source; build only Verdict=FAIL + Status=OPEN rows in your lane; column ownership — CASCADE owns Module/Layer/Entity/Verdict/Evidence and APPENDS rows, CODER owns Status + Block/PR only, GUARD owns VERIFIED/REOPENED; never delete a row, supersede instead; `git pull --ff-only` before editing).

**COUNT THE FILES, NOT THE NUMBERS — three numbers are used TWICE and the second file is easy to miss:**
`21-full-system-no-partial-amnesia` **and** `21-session-operating-decree` (roles: Jorge answers questions before code · every coder applies Neon + merges on green themselves (OWNER LAW 2026-08-03 supersedes the old "Cursor applies Neon · Devin merges" split) · Claude plans/CPA/inventories; `JORGE-APPROVED` label DELETED) ·
`23-no-money-theater-prs` **and** `23-per-pr-checklist` ·
`25-one-push-money-fail-fast` **and** `25-verify-step-odd-even-bands` (Claude = ODD verify-step numbers, Cursor = EVEN).
· **31-cursor-never-idle-wave-drain** · **31-full-system-audit-mandatory** · **32-continuous-mode-no-idle** (never end a turn idle; the next action starts in the same turn) · **32-load-linkage-pre-operational** · **33-standing-session-directive** · **34-cursor-pr-title-prefix** (verify-step 2377) · **35-fix-failures-no-ci-babysit** (read the failing log line once, fix the root cause; no `--watch` loops) · **36-claude-serial-ship-sequence** (tip-main before every push; max 1 open CLAIMED PR) · **37-claim-merge-then-author** (a verify-step number must be on `origin/main` BEFORE the step file is authored; never claim+author in one PR) · `ih35-deep-linkage-audit`.

**COUNTED 2026-08-05 (CC-3, corrected): 43 files** = **41 numbered** across 00–37 — with **00, 21, 23, 25, 31 and 32 each used TWICE** — plus the two unnumbered `dual-lane-never-idle` and `ih35-deep-linkage-audit`. No rules 08/09/20 exist. **Verify with `ls .cursor/rules/*.mdc | wc -l`.**

The previous line here said "COUNTED 2026-08-03: 32 files … 00–30", omitting rules **31–37 entirely** — including 36 (serial ship) and 37 (claim→merge→author), the two that govern how every PR is pushed. That is the same failure this section already warns about one paragraph below, repeated: on 2026-08-03 the index said "25" while 26/27/28 existed, and work proceeded against live rules nobody had read. An index that lags the directory is worse than no index, because it is trusted. **Never trust the number written here — run the `ls` and reconcile.**

This index was headed "25" (and this skill's own frontmatter still said "24-rule") while omitting 26/27/28 outright. That is exactly how an agent violates a live rule while believing it had read them all — it happened on 2026-08-03, when work proceeded against Rule 27 (one open PR per area) and Rule 28 (audit column ownership) because neither appeared here. **Never trust this count: run `ls .cursor/rules/*.mdc | wc -l` and reconcile against this list at session start.** A summary of the law is not the law.

## §12. THE 18-KEY MONEY-PR GIT GATE (Rule 23/24/25/29/30 — CI 1430/1431/1324/1702/1998/2088 fail closed)
`FINDING` · `LANE` · `DOD-A`…`E` · `VERIFY-1`…`8` · `MODULE_PROGRESS: <module> N of M` · `ITEMS_TOUCHED` ·
`MIGRATE` · `ROOT CAUSE`/`FIX`/`GUARD`/`LIVE PROOF`/`REMAINING`. Values `PASS`·`N/A`·`FAIL`·`UNVERIFIED—reason`;
one ranked finding per PR. **Local fail-fast:** `scripts/money-pr-local-gate.mjs` (first husky pre-push step; Rule 29+30 suite) — do not push until it PASSes; run it explicitly (do not rely on husky); never `--no-verify`; one push; never rebase while `build-typecheck` runs. Before `gh pr create|edit`: `node scripts/cursor-pr-body-gate.mjs --body-file …`.
Full text: `docs/specs/DEFINITION-OF-DONE.md` + `docs/specs/EVERY-PR-AUDIT-CHECKLIST.md` +
`docs/specs/LAW-OF-THE-LAND-COMPLETE.md`.

---

## Quick gate check (run in your head before every merge — OWNER LAW 2026-08-03: no owner-approval gate anywhere below)
1. Touches `accounting.*`/`catalogs.accounts`/`db/migrations/*`/posting/GL/balances/grants/RLS/money? → **financial cluster — proof gate, not approval: independent code-review + financial-agent pass, 18-key evidence block, migration firewall, then merge on green yourself.**
2. Other migration/`catalogs.*`/`mdata.*` schema-or-data, or runtime dep bump? → **same proof gate as #1 — build, verify live, merge on green yourself.**
3. Prod DB access of any kind? → **verify the branch/connection every time (§0); this is a safety check, not a permission ask.**
4. Writing/FK-ing a RETIRE table, or shipping a block with no linkage declaration, or touching a reserve account? → **STOP and fix the linkage/target — this is a correctness gate (§10/Rule 19), not an owner-approval gate.**
5. Green CI + independent review pass (+ financial-agent pass if money)? → auto-PR, fix CI, resolve conflicts, squash-merge yourself, verify deploy, GUARD re-proves live after.

---

## ★ PERMANENT LAW (owner-locked 2026-08-05, session-boot) — read at every session start

1. **FINDINGS FLOW AGENT→BOARD→AGENT, NEVER THROUGH THE OWNER.** Find a defect in another lane → WRITE an
   OPEN row into `docs/audit/GUARD-WORKORDERS.md` yourself + commit. Target coder pulls it next loop. Owner
   is NOT a message bus, ever, any session. Row shape: `| id | OWNER lane (CC-1 money/CC-3 mechanical) | fix
   + standard | live evidence | OPEN |`.
2. **LAW = ENFORCED GUARD OR IT'S NOT LAW (phased).** Every NEW rule ships a guard registered in
   `docs/law/LAW.json`; `verify-law-registry.mjs` (required check, <2s, existence-only, adds ZERO PR time)
   fails the build if a registered law's guard file is missing. Old rules migrate as a backlog class,
   non-blocking. Judgment rules ("professional/honest/McLeod-quality") stay JUDGMENT — not force-guarded.
3. **ROLES** (until owner changes in chat): CC-1 = money/GL/WORM. CC-3 = mechanical/entity-scope/FE/CI-guards.
   CC-2 = GUARD verify-live-never-build (GL-DARK/DUAL-PATH prod+fork only). Cascade = merger via direct API +
   scribe.
4. **VOID = reversal, nothing deletable.** TRANSP/USMCA own no assets today (archive USMCA 1500/1510/1600,
   keep 2400 generic). ALL TMS data is test; only the TRANSP QBO mirror is real; an empty TMS table is
   expected. RLS is NOT a backstop for Owner sessions (`org.user_accessible_company_ids()` returns all
   entities) — every unscoped read is load-bearing on its own predicate.
5. **EVERY loop, EVERY agent:** read board → grep-verify top OPEN row against main (done → mark DONE w/ SHA;
   wrong card → fix the REAL defect) → build ONE complete atomic block → find another lane's defect? write it
   to the board → push → next. Never idle, never pause to summarize, never half-edit.


---

## PERMANENT OWNER PRIORITY (locked 2026-08-07) — FINISH THE SOFTWARE IN USMCA
**Standing mission, does not expire. Owner decides — no CPA, no approval gates, no "locked-law" ceremony.**
- Finish the software completely (wiring, linkage, functionality, expenses); focus ONLY on USMCA.
- METHOD: create EVERY possible transaction in EVERY module / tab / sub-tab / create-surface in USMCA.
  The instant it's created you see if it registers (balanced JE in GL, both-way linkage, economics).
  Not green = wiring gap → fix root cause → re-create → repeat until green. Exhaustive creation IS the test.
- Same fleet as transportation: TRANSP closes in weeks; USMCA uses the SAME driver+truck+GPS/tracking DB,
  carried over (shared, not rebuilt/split). USMCA keeps its OWN books.
- No QuickBooks, no mapping. Account resolution = wiring (create accounts as needed, owner edits later).
- Full text: docs/standing-orders/OWNER-RULE-2026-08-07-NO-MAPPING-WIRE-TEST.md
