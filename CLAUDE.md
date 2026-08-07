# IH35-TMS — Agent Operating Constitution

**This file auto-loads at the start of every session. Read it fully before touching anything.**
It is the durable, slow-changing law for working in this repo. Evolving project state
(current blocks, held PRs, in-flight decisions) lives in the auto-memory (`MEMORY.md` +
`/memory/*.md`) and `docs/trackers/` — not here. When this file and a handoff `.docx`/`.rtf`
on the Desktop disagree, **this file wins** (those are historical archives).

This system holds **live financial and legal-evidence data** for a real operating carrier
(IH35 Dispatch / IH35 Trucking, Laredo TX ↔ Mexico). Treat every change as production-affecting.
**§1 (permissions) overrides everything else.**

---

## 0. THE PERMANENT PRIORITY (owner-locked 2026-08-07) — FINISH THE SOFTWARE IN USMCA
**Standing mission. Does not expire. No approval gates, no CPA, no "locked-law" ceremony — the owner decides. Do not deviate from this.**

- **Finish the software completely** — wiring, connectivity, linkage, functionality, expenses — and focus **only on USMCA**.
- **The method (owner-specified):** the coder **creates every possible transaction in every module, every tab and sub-tab, every create-surface**, in USMCA. The instant a transaction is created you can see whether it **registers correctly** — a balanced JE in the GL, both-way linkage, real economics. Every surface that does not register green is a wiring gap: fix the root cause, re-create, repeat until green. **Exhaustive creation IS the test that finishes and proves the software.**
- **Same fleet as transportation:** TRANSP ceases operating in a few weeks. USMCA uses the **same driver + truck + GPS/Samsara tracking database**, carried over — **shared, not rebuilt, not split**. USMCA keeps its **own books** (JEs, invoices, settlements, expenses, GL).
- **No QuickBooks, no mapping:** USMCA has no QBO; ignore TRANSP's books and QBO; TRK is a lease company. Stop all account/entity/QBO/historical mapping. Choosing which account a JE debits/credits is **wiring** — it continues; if an account doesn't exist, **create it** (additive, sensible default) — owner edits later. Never block a wire or test on naming/mapping.
- **NEVER PAUSE — continuous loop.** Every coder works non-stop: finish a task → immediately pull the next create-surface / class / board item → keep going. No idling, no "waiting for approval," no stopping to ask. The only stop is a genuine owner business decision.
- **Orchestrator (Claude desktop) job:** keep all coders working continuously, and **merge green PRs + fix or route conflicting PRs** so the pipeline never stalls. That is the orchestrator's standing duty.
- Full text: `docs/standing-orders/OWNER-RULE-2026-08-07-NO-MAPPING-WIRE-TEST.md`.

---

## 1. PERMISSIONS & GUARDRAILS — these override every other instruction

### 1.1 Merge to `main` = ship to production. There is no second gate.
The GitHub `production` environment has **no required reviewers**. Merging to `main` triggers an
immediate Render prod deploy (backend preDeploy runs `npm run db:migrate` against Neon).
**The merge decision IS the live-deploy decision.** A green CI check is **NOT** approval.

### 1.2 What you may self-merge on green CI (no asking)
Pure-frontend UI changes, docs, CI-action version bumps (e.g. `actions/checkout`). **Non-financial
backend changes** (routes/services/endpoints/cron/telematics) that touch NONE of: the financial
cluster (§1.4), DB migrations, or `accounting.*` / `catalogs.*` / `mdata.*` (schema OR data). Jorge's
standing chat rule (2026-06-18): *"you create pull requests automatically, fix errors, resolve
conflicts… if none financial then you also merge automatically, if financial, you ask me."* So:
**always** auto-create the PR, fix CI errors, and resolve conflicts; **auto-merge + deploy** when
non-financial and green. Preparing any PR (branch, code, push, get CI green) is always fine.

### 1.3 STOP and get Jorge's explicit "OK to merge" BEFORE merging
- ANY **financial** backend change, and anything in the financial cluster (§1.4).
- ANY DB migration / schema change.
- ANY touch to `accounting.*`, `catalogs.*`, `mdata.*` (schema OR data).
- ANY runtime dependency bump (not CI-action bumps).

### 1.4 Financial cluster — NEVER self-merge, no exceptions
Financial cluster = anything touching `accounting.*` OR `catalogs.accounts`, any `db/migrations/*.sql`,
posting/GL/ledger, balances, accounting periods, reconcile-commit, reclassify-apply, role/GRANT
changes, opening balances. A migration or `accounting.*`/`catalogs.accounts` touch makes the **whole
PR financial** even if it also has UI files. For these:
branch → typecheck + run migration **locally** → show Jorge `git diff --staged --stat` + the **full SQL**
→ **WAIT for explicit "OK to merge"** → only then merge. Opening balances are **owner-entered only**.
Never build finance/posting logic solo (design docs are fine). Default env flags **OFF**.

### 1.5 Production database access is gated — ask every single time
Direct prod Neon access — web console OR `psql`, **even read-only SELECTs** — is **not** a standing
capability. Ask before each connection. Never keep/reuse/record prod connection strings. A prod
`DATABASE_URL` exists in the sibling `IH35-TMS-cleanup2-fresh/.env` — **do not use it.** Verify from
`db/migrations/` + public health endpoints instead (§5).

### 1.6 Prohibited outright (direct Jorge to do it himself, even if asked)
Moving money / sending payments / posting financial entries to prod without per-action OK; entering
credentials into forms; changing access controls or sharing/permissions; permanently deleting data;
submitting anything to Faro/factoring or any external financial system.

### 1.7 When unsure, STOP and ask. Surface the decision; don't self-authorize. This is the #1 expectation.
Jorge has been burned by agents overstepping. Do **not** decide the scope of your own authority.

---

## 2. Migration & schema invariants (carry into every block)
- **NEVER self-merge a migration.** Migration numbers strictly above main's current max, re-checked at
  push time; never reuse/collide a number. Idempotent migrations (`DO` + `IF NOT EXISTS`).
- **void-not-delete:** set `voided_at`, never `DELETE`. Append-only audit — never `UPDATE`/`DELETE`
  `audit_events` / `audit.row_changes`. Every table gets `is_active` + audit.
- Schema is **`accounting.*`** (never `finance.*`). Audit is **`audit.row_changes`**.
- **Reuse EXISTING posting/GL functions — write NO new GL math.** Reuse allocation infra.
- UUIDv7 server-generated PKs. `security_invoker=true` on every view. `operating_company_id` RLS
  scoping. Before any `accounting`/`catalogs` read: `SET app.operating_company_id` or counts lie.
- Lockstep INSERT pattern (column array + values array + placeholders grow together).
- Runtime DB role is `ih35_app` (a **role/grant target, not a data schema** — see §4). New schema →
  add GRANTs (migration 0065 + DEFAULT PRIVILEGES) or it 500s at runtime.
- **Every bug fix gets a static CI guard** so it can't regress.

---

## 3. Workflow (per change)
1. **Sync first.** The local clone routinely lags `origin/main` by many merged PRs. Always
   `git fetch origin` + `gh pr list --state all`, then `git checkout main && git pull --ff-only`
   before concluding anything is missing or before branching. (Treating local `git log` as truth has
   produced false "the work is lost" conclusions.)
2. **Fresh branch per block.** `feat/...`, `fix/...`, `chore/...`.
3. **Build/verify locally.** Frontend: `cd apps/frontend && npx tsc -b --pretty false` (ignore the
   pre-existing `@sentry/react` env error) + `npx vitest run <files>`. UI: `node
   scripts/verify-mobile-responsive-audit.mjs` (must be `new_vs_baseline=0`). Run the `verify-*`
   scripts relevant to your block.
4. **Known env breakage:** husky pre-commit/pre-push runs a root `tsc` that fails on missing backend
   deps (`opossum`, `@fastify/helmet`) not installed here. For otherwise-verified changes, commit/push
   with `--no-verify` and let **CI** be the authoritative gate (`build-typecheck` is the real backend
   compile check; `required-checks-gate` matters most).
5. **PR:** `gh pr create` with root-cause + scope + verification in the body.
6. **Merge:** only per §1. Squash (`gh pr merge <n> --squash --delete-branch`).
7. **Verify deploy:** poll `/api/v1/healthz/shallow` until `version` == your merge short-sha; confirm
   deep `/healthz` green; for UI, confirm in the browser.
8. **Never `git add -A` blindly** — the repo has untracked `.claude/` worktrees that must never be
   committed. Stage explicit paths.
9. End commit messages with the `Co-Authored-By:` line when pairing.

---

## 4. Schema reality & landmines (verify names against `db/migrations/` before writing SQL)
Bugs recur because services were written against **schema names that don't exist.**
- **There is NO `ih35_app.*` data schema** — any query against `ih35_app.<table>` 500s.
- loads = **`mdata.loads`** (`status` enum `mdata.load_status_enum`, `rate_total_cents` = GROSS
  customer rate, `assigned_primary_driver_id`, `soft_deleted_at`); stops = **`mdata.load_stops`**.
- **`mdata.customers.customer_name`**; **`mdata.drivers`** (`first_name`/`last_name`,
  `deactivated_at`, `archived_at` — no `full_name`); **`mdata.vendors.vendor_name`**.
- **`mdata.units`** has **`owner_company_id`** (TRK owns) + **`currently_leased_to_company_id`**
  (TRANSP/USMCA lease) — **NOT `operating_company_id`** (recurring 500 source).
- bills = **`accounting.bills`** / **`accounting.bill_payments`** (no `voided_at`) /
  **`accounting.payments`** (`voided_at`); bank = **`banking.bank_transactions`** (`is_credit` bool);
  driver earnings = **`driver_finance.settlement_lines`** (→ `driver_settlements`; **no `load_id`**);
  HOS = **`hos.duty_status_events`** (append-only).
- `load_status_enum` **now includes** `'abandoned'`/`'driver_walkoff'`/`'driver_no_show'` — migration
  `0094` added them via `ALTER TYPE ... ADD VALUE` (they are REAL members; the abandonment→escrow
  path writes them directly, correctly — do NOT re-add a `::text` cast or "fix" that write). The
  earlier "enum ends at `'cancelled'`, cast `::text`" rule was stale — corrected 2026-07-04 sweep (verified vs `db/migrations/0094`).
- **Don't trust a string-grep "systemic check."** Test the actual endpoints or diff each query's
  identifiers against migrations.
- Every diesel/roadside expense MUST FK to a load (G18, critical). **HAZMAT — corrected 2026-07-04
  sweep (verified vs `db/migrations/`):** there is **NO** `mdata.loads.hazmat` and **NO**
  `mdata.loads.hazmat_endorsement_required` column (the 2026-06-27 claim was WRONG). Load-level hazmat is
  stored in the `quicksave_pending_fields` jsonb. **DRIVER hazmat endorsement — re-corrected 2026-07-04
  (verified vs migrations + live-DB `verify-sql-read-targets`):** there is **NO**
  `mdata.drivers.hazmat_endorsement` — that bool lives on **`mdata.units`** (migration `0295`, vehicle
  profile). The real DRIVER hazmat boolean is **`mdata.drivers.endorsement_h`** (bool, migration `0301`;
  the `0343` trigger syncs it into `mdata.driver_cdl_endorsements` → `reference.cdl_endorsements` code
  `'H'`), plus expiry **`mdata.drivers.hazmat_endorsement_expires_at`** (`0008`). The 2026-07-04 "driver
  column = `hazmat_endorsement`" claim was WRONG. The shared driver-qualification gate
  (`dispatch/driver-qualification.service.ts`, G9-C1/D3-1) now enforces the H-endorsement using
  `endorsement_h` — earlier the gap where a hazmat load could reach an unendorsed driver is closed.

---

## 5. Where things live / how to verify without prod DB
- **Local clone (work here):** `/Users/jorgemunoz/IH35-TMS-clean`. Sibling
  `IH35-TMS-cleanup2-fresh` has a real prod `.env` — **do not use it.**
- **Remote (source of truth):** `github.com/tioperfumes07/IH35-TMS` (gh authenticated `tioperfumes07`).
- **DB:** Neon Postgres, project **IH35-TMS** `tiny-field-89581227`, prod branch
  `br-fancy-credit-akjnd07a`, db `neondb`, role `ih35_app`. **Gated — §1.5.** Schema truth =
  `db/migrations/`.
- **Deploy:** Render (`render.yaml`). Backend `https://ih35-tms.onrender.com` (API also
  `https://api.ih35dispatch.com`); frontend `https://app.ih35dispatch.com`; driver PWA; cron.
- **Health/version:** `GET /api/v1/healthz/shallow` → `{version: <short sha>}`; deep `/api/v1/healthz`
  → Postgres/Neon, migrations ledger, Redis, R2. No creds needed.
- **Specs/source of truth:** `docs/specs/` (blueprints, locked specs; QBO parity in
  `docs/specs/qbo-parity/`). Progress: `docs/specs/qbo-parity/MASTER_PROGRESS_REPORT.md`. Locked
  decisions: `docs/lockdown/00_LOCKED_DECISIONS.md`. Deeper handoff: `docs/CLAUDE.md`. Block registry:
  `.block-ready/*.json`. Trackers: `docs/trackers/phase-*.md`.
- **Tech stack:** Node 22 + Fastify + TS (`apps/backend`); Vite + React + TS (`apps/frontend`);
  driver PWA (`apps/driver-pwa`); Postgres/Neon; Redis + outbox; Cloudflare R2 (`ih35-tms-evidence`);
  Auth Lucia + Google OAuth.

---

## 6. Business context
- **Multi-entity:** `TRANSP` (operating carrier, active —
  `operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`), `TRK` (asset holder, owns
  units/equipment), `USMCA` (future carrier, launches July 2026, hidden until then).
- **Factoring:** Faro Factoring (current); planned migration Faro → RTS. Equipment financing:
  Commercial Credit Group (CCG). Customer credit-limit sources: `factor` / `manual` / `rmis_future`.
- Laredo tax entities; Ch.11 confirmed (see finance memory).

---

## 7. Product/domain locks (additive-only — never silently redesign)
- **ADDITIVE-ONLY:** never delete/remove/reorder existing modules/pages/sidebar/columns/fields/tabs/
  routes. **ARCHIVE, never DELETE.** Sole exception: Jorge says "remove X" in chat.
- **Vocab:** **`+ Create`** / **`+ Book`** only — never `+ New` / `+ Add`. "Escrow" not "Forfeitures".
  Single-line names/headings. Block names = phase + task ("P3-T11.17.1"), not "Block 1".
- **Navigation:** ALL nav on the TOP horizontal bar. The 80px navy sidebar (`rgb(27,35,51)`) is the
  ONLY left panel — never add a second sidebar / side group labels / accordion left tree. **Sidebar/module
  count rule now lives in the tracked `AGENTS.md` (canonical): 28 items in `sidebar-config.ts`
  (`SIDEBAR_ITEM_IDS`), enforced by `verify-sidebar-contract.mjs`; render count is role-dependent. Source of
  truth = the config array, never a hardcoded number.** (This local CLAUDE.md is git-excluded — do not assert
  a count here.) Module headers have ← back-arrow + breadcrumb.
- **Palette LOCKED:** `--navy #1f2a44`, `--navy-dk #0f1729`, `--slate #334155`, `--slate-lt #64748b`,
  `--bg #f8fafc`, `--green-pill #d1fae5` (Class pill only), `--red #dc2626` (delete/Accident only).
  No recoloring the sidebar. No yellow/green section bands. No purple/blue/pink. No emojis in
  headers/sidebar/tables. No middle-dot ( · ) subtitle lists below an H1.
- **KEEP** existing TMS trucking custom fields (Settlement No, Truck No, Pickup/Delivery Date,
  SB-Load No, Empty/Loaded Miles, Work Order) and the **lock-account** control wherever they exist.
- **Inline "+ Add new ___"** belongs at the end of every reference dropdown (opens a mini-create
  without closing the parent panel). Tables use the shared QBO-parity grammar + density tokens.
- WO display ID: `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}`; 7 immutable source types
  IS/ES/AC/ET/RT/IT/RS. Class auto-derive `{UNIT}-{LASTNAME}` (the only field allowed green).
- Detailed screen specs live in `docs/specs/qbo-parity/` — read them before building accounting UI.

---

## 8. Working with Jorge (communication norms)
- **Deliver, don't ask.** Ship the work first; don't pepper with "should I?" — except where §1 requires
  a STOP. In auto-mode/track work, execute the scope in order and stack PRs; Jorge merges. STOP only at
  finance / locked-page / explicit STOP-decision gates.
- He is **visual and fast-moving** — judges by what renders, wants momentum. Foreground work, show your
  diffs (`git diff --staged --stat`), confirm `pwd`/branch/status. **No silent retries** — on an
  unexpected error, STOP and surface the exact error.
- **All-caps and Spanish/English mixing is normal** — don't comment on it, don't sanitize.
- **"yes" / "approved" / "DONE" / "WORKING PERFECT" / "all pass" = move forward**, no acknowledgment
  paragraph. Central Time always.
- **Never suggest rest, breaks, or stepping away. Ever.**

---

## 9. Drift prevention
- If two project files contradict (drift), **flag it, name both files, ask which is canonical** — don't
  silently pick one.
- Cross-check work against specs/memory BEFORE saying "done." Definition of done: code matches real
  schema (§4); local + CI green; merged per §1; deploy verified live via health endpoint; UI confirmed
  in the browser. Report outcomes honestly — if a step was skipped or a check failed, say so.
- When you learn a durable new rule or correct a wrong one, update **this file** or the auto-memory in
  the same session, so the next agent starts knowing it. That is how we stop the forgetting.

---

## 10b. ★ LAW OF THE LAND — VERIFY EVERYTHING, NEVER GUESS (permanent, supreme — Jorge 2026-07-10)
After 10 days lost to unverified "done": **everything is verified against live evidence — no more guessing, ever.**
Every fact, status, or "done" MUST be backed by live proof produced this session:
- **Schema/columns/enums/tables → verified against the Neon PROD branch** (RLS-immune `information_schema`/`pg_catalog`),
  NOT memory, NOT a migration file, NOT a skill. Prod has diverged from migrations repeatedly — **prod wins.**
- **Code built/wired → read the actual file + confirm the route is registered / component mounted / guard wired.**
  A file existing is NOT proof. **A fix works → verified live** (endpoint/health-sha/DB row/browser). CI-green is NOT done.
- **Empty grep / 0-count → RE-RUN before it is a verdict** (RLS masks accounting/catalogs/mdata to 0).
- **Forbidden:** guessing, assuming, inferring, trusting another agent's "verified", trusting a doc/skill/memory over
  prod, or reporting any verdict without an evidence field. When you cannot verify: say **"UNVERIFIED — needs live check"**,
  never a guess. **Precedence:** CI guard > repo > Jorge-in-writing > sweep/audit/doc > memory. See auto-memory
  `verify-everything-never-guess-law`.

## 10a. ★ LAW OF THE LAND — TOTAL CONNECTIVITY (permanent, supreme — Jorge 2026-07-05)
**Everything must be wired, linked, and connected — always.** Every module, tab, motion, and transaction
connects to its financial primitives (vendor/customer/expense/bill/bill-payment/journal-entry/liability-or-asset
account) AND to every operational module (legal, insurance, assets, safety, maintenance, dispatch, driver
profiles, customers, vendors — every module and tab). No record is an island; forward AND reverse drill-through,
audit + RLS, verified on live data. **A screen or record missing a link is NOT done.** See auto-memory
`law-of-the-land-total-connectivity`.

## 10. HARDLINE QUALITY RULE (permanent — Jorge 2026-07-05, "these are the permanent hard line rules")
We are building to reach and **surpass** QuickBooks / NetSuite / McLeod / Alvys and any serious TMS/ERP/
accounting software in the world. Every change is made as if a **CPA, auditor, attorney, insurer, lender,
DOT/FMCSA reviewer, architect, or court** will review it.
- **NEVER** take the short/easy way, **NEVER** defer a root problem, **NEVER** patch over it, **NEVER**
  guess or assume, **NEVER** fake-green, **NEVER** claim "done" without proof. **Fix the root cause.**
- **Investigate before recommending.** Ground every recommendation in verified live state (current
  repo/branch/prod/DB/PR) + accepted accounting principles + a **deep-dive research of how QBO/NetSuite/
  McLeod/Alvys actually do it** — not from memory when memory may be stale.
- Conflicts resolve one way: **speed < trust, easy < correct, guess < verify, move-forward < protect-the-
  company.** Jorge follows honest, researched, verified recommendations — earn that trust every time.
- **DRIVER MODEL:** drivers are **hired Mexican-B1 1099 contractors, NOT owner-operators** — driver pay is
  a wage/fee, never a % of the customer linehaul (linehaul = company revenue). See auto-memory
  `finance-build-directive-and-driver-model`.

**Golden rule:** non-financial frontend/docs you may ship on green; **anything backend, schema,
financial, or money-moving — and any prod DB access — STOP and get Jorge's explicit OK.**
Green CI is not approval. When unsure, ask.

---

## ★★ PERMANENT LAW — owner-locked 2026-08-05 (supreme; applies to every agent, every session)

**1. FINDINGS FLOW AGENT → BOARD → AGENT, NEVER THROUGH THE OWNER.** Find a defect in another lane →
**WRITE an OPEN row into `docs/audit/GUARD-WORKORDERS.md` yourself and commit it**; the target coder pulls
it on their next loop. **The owner is NOT a message bus — ever, in any session.**

**2. LAW = ENFORCED GUARD, OR IT IS NOT LAW** (phased). Every NEW rule ships with a guard registered in
`docs/law/LAW.json`. `verify-law-registry.mjs` is a required check (<2s, existence-only) and fails the
build if a registered law's guard file is missing. Old rules migrate as a backlog class. Judgment rules
stay judgment.

**3. ROLES.** CC-1 = money / GL / WORM. CC-3 = mechanical / entity-scope / FE / CI-guards. CC-2 = GUARD,
**verify live, never build**. CASCADE = merger (direct merge API — auto-merge is broken on our rulesets,
community #190610).

**4. ENTITY + DATA LAW.** VOID = reversal; **nothing is deletable**. TRANSP / USMCA own **no assets
today**. **ALL TMS-native data is TEST** — only the TRANSP QBO mirror is real. **RLS is NOT a backstop for
Owner sessions**: `org.user_accessible_company_ids()` returns EVERY active company when the role is Owner,
so **every unscoped read is load-bearing on its own predicate**.

**5. EVERY LOOP.** read board → **grep-verify the card against main** → build **ONE complete atomic block**
→ found another lane's defect? **write it to the board** → push → next. Never idle, never pause to
summarize, never half-edit.
