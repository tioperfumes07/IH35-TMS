---
name: ih35-tms-standards
description: >-
  The durable operating standards for the IH35-TMS repository — permissions and merge
  gates, migration/schema invariants, per-change workflow, schema landmines, product and
  design locks, and communication norms. Load this at the start of ANY work in this repo
  (code, migrations, accounting, UI, docs) and follow it exactly. It is the version-controlled,
  shareable companion to the (git-excluded) root CLAUDE.md constitution. When this skill and a
  handoff document disagree, this skill wins.
---

# IH35-TMS — Operating Standards

This system holds **live financial and legal-evidence data** for a real operating carrier
(IH35 Dispatch / IH35 Trucking, Laredo TX ↔ Mexico). Treat every change as production-affecting.
**§1 (permissions) overrides everything else. When unsure, STOP and ask.**

## §0. LAW OF THE LAND — VERIFY EVERYTHING, NEVER GUESS (supreme, permanent — 2026-07-10)
After days lost to unverified "done": **everything is verified against live evidence — no guessing, ever.**
- **Schema/columns/enums/tables → verify against the Neon PROD branch** (RLS-immune `information_schema`/`pg_catalog`),
  NOT memory, NOT a migration file, NOT this skill. Prod has diverged from migrations repeatedly — **prod wins.**
- **Built/wired → read the actual file + confirm route registered / component mounted / guard wired.** A file
  existing is NOT proof. **A fix works → verified live** (endpoint / health-sha / DB row / browser). CI-green is NOT done.
- **Empty grep / 0-count → RE-RUN before it is a verdict** (RLS masks accounting/catalogs/mdata to 0).
- **Forbidden:** guessing, assuming, inferring, trusting another agent's "verified", or reporting any verdict
  without an evidence field. When you cannot verify, say **"UNVERIFIED — needs live check"**, never a guess.
- **Definition of done = the block's `acceptance[]` resolves** (file + route mounted + migration on prod +
  column populated + guard wired + live proof) — NOT "merged", NOT "CI-green".
- **Precedence when sources disagree:** CI guard > repo > owner-in-writing > sweep/audit/doc > memory.

---

## 1. Permissions & guardrails — these override every other instruction

### 1.1 Merge to `main` = ship to production. There is no second gate.
The GitHub `production` environment has **no required reviewers**. Merging to `main` triggers an
immediate prod deploy (backend preDeploy runs `npm run db:migrate` against the prod database).
**The merge decision IS the live-deploy decision.** A green CI check is **NOT** approval.

### 1.2 What you may self-merge on green CI (no asking)
- Pure-frontend UI changes, docs, CI-action version bumps (e.g. `actions/checkout`).
- **Non-financial** backend changes (routes/services/endpoints/cron/telematics) that touch NONE of:
  the financial cluster (§1.4), DB migrations, or `accounting.*` / `catalogs.*` / `mdata.*` (schema OR data).

Standing rule: **always** auto-create the PR, fix CI errors, and resolve conflicts; **auto-merge +
deploy** when non-financial and green. Preparing any PR (branch, code, push, get CI green) is always fine.

### 1.3 STOP and get the owner's explicit "OK to merge" BEFORE merging
- ANY **financial** backend change, and anything in the financial cluster (§1.4).
- ANY DB migration / schema change.
- ANY touch to `accounting.*`, `catalogs.*`, `mdata.*` (schema OR data).
- ANY runtime dependency bump (not CI-action bumps).

The owner signals approval by applying the **`JORGE-APPROVED`** label (or saying "OK to merge" in chat).
Once labeled/approved and CI is green → merge (squash) without re-asking, then roll into the next block.

### 1.4 Financial cluster — NEVER self-merge, no exceptions
Financial cluster = anything touching `accounting.*` OR `catalogs.accounts`, any `db/migrations/*.sql`,
posting/GL/ledger, balances, accounting periods, reconcile-commit, reclassify-apply, role/GRANT changes,
opening balances. A migration or `accounting.*`/`catalogs.accounts` touch makes the **whole PR financial**
even if it also has UI files. For these:
branch → typecheck + run migration **locally** → show the owner `git diff --staged --stat` + the **full SQL**
→ **WAIT for explicit approval** → only then merge. Opening balances are **owner-entered only**.
Never build finance/posting logic solo (design docs are fine). Default env flags **OFF**.

### 1.5 Production database access is gated — ask every single time
Direct prod DB access — console OR `psql`, **even read-only SELECTs** — is **not** a standing capability.
Ask before each connection. Never keep/reuse/record prod connection strings. Verify schema from
`db/migrations/` + public health endpoints instead (§5).

### 1.6 Prohibited outright (direct the owner to do it himself, even if asked)
Moving money / sending payments / posting financial entries to prod without per-action OK; entering
credentials into forms; changing access controls or sharing/permissions; permanently deleting data;
submitting anything to a factoring or any external financial system.

### 1.7 When unsure, STOP and ask. Surface the decision; don't self-authorize. This is the #1 expectation.
Do **not** decide the scope of your own authority.

**Golden rule:** non-financial frontend/docs you may ship on green; **anything backend, schema,
financial, or money-moving — and any prod DB access — STOP and get explicit OK.** Green CI is not approval.

---

## 2. Migration & schema invariants (carry into every change)
- **NEVER self-merge a migration.** Migration numbers strictly above `main`'s current max, re-checked at
  push time; never reuse/collide a number. Idempotent migrations (`DO` blocks + `IF NOT EXISTS` / `ON CONFLICT`).
- **void-not-delete:** set `voided_at` / `archived_at` / `deactivated_at`, never `DELETE`. Append-only audit —
  never `UPDATE`/`DELETE` `audit_events` / `audit.row_changes` / `events.event_log` (WORM). Every table gets
  `is_active` + audit.
- Schema is **`accounting.*`** (never `finance.*`). Audit is **`audit.row_changes`**.
- **Reuse EXISTING posting/GL functions — write NO new GL math.** Reuse allocation infra.
- UUIDv7 server-generated PKs. `security_invoker=true` on every view. `operating_company_id` RLS scoping.
  Before any `accounting`/`catalogs` read: `SET app.operating_company_id` or counts lie.
- FORCED RLS pattern: `identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`.
- Lockstep INSERT pattern (column array + values array + placeholders grow together).
- Runtime DB role is `ih35_app` (a **role/grant target, not a data schema** — see §4). New schema →
  add GRANTs (migration 0065 pattern + DEFAULT PRIVILEGES) or it 500s at runtime.
- **Every bug fix gets a static CI guard** (a `scripts/verify-*.mjs`) so it can't regress.
- **CREATE OR REPLACE VIEW is append-only** — new view columns must be APPENDED at the end; a mid-list
  insert errors "cannot change name of view column". Apply view-touching migrations on a local CI DB first.

### Local migration validation is a landmine — read this
- `npm run db:migrate` in this clone can **silently hit PROD** (`.env` may carry prod direct-URL creds and
  the runner prefers `DATABASE_DIRECT_URL`). SAFE form: validate against a local Postgres, e.g.
  `DATABASE_DIRECT_URL= DATABASE_URL=<local> npm run db:migrate`, and always verify `current_database()` /
  `inet_server_addr()` before trusting a connection.
- **Never set `ALLOW_PROD_MIGRATE=1` locally.** Prod DDL/seed is the owner's hand; the coder stops at a local
  test DB. A migration that validates on a prod-COPY can still FAIL CI (build-typecheck + security-audit run
  `db:migrate` on a FRESH DB from 0001) — never `RAISE` on absent runtime/synced data; JOIN gracefully.

---

## 3. Workflow (per change)
1. **Sync first.** The local clone routinely lags `origin/main` by many merged PRs. Always `git fetch origin`
   + `gh pr list --state all`, then `git checkout main && git pull --ff-only` before concluding anything is
   missing or before branching. (Treating local `git log` as truth has produced false "the work is lost"
   conclusions.)
2. **Fresh branch per change.** `feat/...`, `fix/...`, `chore/...`.
3. **Build/verify locally.** Frontend: `cd apps/frontend && npx tsc -b --pretty false` (ignore the
   pre-existing `@sentry/react` env error) + `npx vitest run <files>`. UI responsiveness:
   `node scripts/verify-mobile-responsive-audit.mjs` (must be `new_vs_baseline=0`). Run the `verify-*`
   scripts relevant to your change.
4. **Known env breakage:** husky pre-commit/pre-push runs a root `tsc` that fails on backend deps not installed
   here, and a `block-ready` pre-push check. For otherwise-verified changes, commit/push with `--no-verify`
   and let **CI** be the authoritative gate (`build-typecheck` is the real backend compile check;
   `required-checks-gate` matters most; `hold-merge-gate` red-lines financial/migration paths until approved).
5. **PR:** `gh pr create` with root-cause + scope + verification in the body.
6. **Merge:** only per §1. Squash: `gh pr merge <n> --squash --delete-branch`.
7. **Verify deploy:** poll `/api/v1/healthz/shallow` until `version` == your merge short-sha; confirm deep
   `/api/v1/healthz` green; for UI, confirm in the browser.
8. **Never `git add -A` blindly** — the repo has untracked `.claude/worktrees/` that must never be committed.
   Stage explicit paths.
9. End commit messages with a `Co-Authored-By:` line when pairing.

---

## 4. Schema reality & landmines (verify names against `db/migrations/` before writing SQL)
Bugs recur because services were written against **schema names that don't exist.**
- **There is NO `ih35_app.*` data schema** — any query against `ih35_app.<table>` 500s.
- loads = **`mdata.loads`** (`status` enum `mdata.load_status_enum`, `rate_total_cents` = GROSS customer rate,
  `assigned_primary_driver_id`, `soft_deleted_at`); stops = **`mdata.load_stops`**.
- **`mdata.customers.customer_name`**; **`mdata.drivers`** (`first_name`/`last_name`, `deactivated_at`,
  `archived_at` — no `full_name`); **`mdata.vendors.vendor_name`**.
- **`mdata.units`** has **`owner_company_id`** (TRK owns) + **`currently_leased_to_company_id`** (lease) —
  **NOT `operating_company_id`** (recurring 500 source). Scope unit subqueries by `id` / owner / lessee.
- bills = **`accounting.bills`** / **`accounting.bill_payments`** / **`accounting.payments`** (`voided_at`);
  bank = **`banking.bank_transactions`** (`is_credit` bool); driver earnings =
  **`driver_finance.settlement_lines`** (→ `driver_settlements`); HOS = **`hos.duty_status_events`** (append-only).
- `load_status_enum` members (verified on prod branch `br-fancy-credit-akjnd07a`, 2026-07-10):
  `draft, booked, planned, assigned, dispatched, at_pickup, in_transit, at_delivery, delivered, invoiced,
  paid, closed, cancelled, unassigned, assigned_not_dispatched, delivered_pending_docs, completed_docs_received`.
  It does NOT end at `'cancelled'` (4 more follow). `'abandoned'`/`'driver_walkoff'`/`'driver_no_show'` are
  **NOT** enum members — writing them as the enum FAILS; cast `::text` before comparing those.
- **NO `mdata.loads.hazmat` and NO `mdata.loads.hazmat_endorsement_required`** — verified absent on prod
  (2026-07-10). Load-level hazmat lives in the `quicksave_pending_fields` jsonb. DRIVER hazmat endorsement =
  **`mdata.drivers.endorsement_h`** (bool). (Earlier "hazmat columns ARE present" text was stale — corrected
  vs prod.)
- Every diesel/roadside expense MUST FK to a load (critical).
- **Don't trust a string-grep "systemic check."** Test the actual endpoints or diff each query's identifiers
  against migrations. Most phantom-schema hits are guarded fallbacks (`to_regclass`/`tableExists`), not bugs —
  check the guard + real columns before "fixing."

---

## 5. Where things live / how to verify without prod DB
- **Remote (source of truth):** the GitHub repo. Schema truth = `db/migrations/`.
- **DB:** Neon Postgres, prod branch. **Gated — §1.5.**
- **Deploy:** Render (`render.yaml`). Backend + frontend + driver PWA + cron.
- **Health/version (no creds):** `GET /api/v1/healthz/shallow` → `{version: <short sha>}`; deep
  `/api/v1/healthz` → Postgres/Neon, migrations ledger, Redis, object store.
- **Specs / source of truth:** `docs/specs/` (blueprints, QBO parity in `docs/specs/qbo-parity/`).
  Locked decisions: `docs/lockdown/00_LOCKED_DECISIONS.md`. Deferred work: `docs/trackers/DEFERRED-ITEMS.md`.
  Block registry: `.block-ready/*.json`. Built/pending truth: `npm run reconcile:blocks`.
- **Tech stack:** Node 22 + Fastify + TS (`apps/backend`); Vite + React + TS (`apps/frontend`); driver PWA
  (`apps/driver-pwa`); Postgres/Neon; Redis + outbox; Cloudflare R2; Auth Lucia + Google OAuth.

---

## 6. Business context
- **Multi-entity:** `TRANSP` (operating carrier, active), `TRK` (asset holder, owns units/equipment),
  `USMCA` (future carrier, launches July 2026, hidden until then). `mdata.*`/`catalogs.*` RLS is
  role-scoped, not entity-scoped today — cross-entity leaks are masked now and break at USMCA launch;
  entity-scope remediation must land before USMCA.
- **Accounting architecture is PARALLEL double-books** (not a sync): TMS + QBO run independently; QBO is the
  system-of-record through 12/31/2025; CLONE-ONCE + RECONCILE-ONLY; **NO write-back**. JE/entity push behind
  default-OFF kill-switches. Reconciliation = a twice-daily correctness test that flags every transaction
  whose categorization differs.
- **Factoring** is treated as secured-borrowing/recourse. Drivers are Mexican B1 (W-8BEN, yearly renewal).
  Money-posting env flags stay **OFF** until CPA sign-off + Neon tie-out.

---

## 7. Product & design locks (additive-only — never silently redesign)
- **ADDITIVE-ONLY:** never delete/remove/reorder existing modules/pages/sidebar/columns/fields/tabs/routes.
  **ARCHIVE, never DELETE.** Sole exception: the owner says "remove X" in chat.
- **Vocab:** **`+ Create`** / **`+ Book`** only — never `+ New` / `+ Add`. "Escrow" not "Forfeitures".
  Single-line names/headings. Block names = phase + task (e.g. "P3-T11.17.1"), not "Block 1".
- **Navigation:** ALL nav on the TOP horizontal bar. The 80px navy sidebar (`rgb(27,35,51)`) is the ONLY left
  panel — never add a second sidebar / side group labels / accordion left tree. Sidebar item count is defined
  by the config array `SIDEBAR_ITEM_IDS` in `sidebar-config.ts` and enforced by `verify-sidebar-contract.mjs`
  (source of truth = the config array, never a hardcoded number). Module headers have a ← back-arrow + breadcrumb.
- **Palette LOCKED:** `--navy #1f2a44`, `--navy-dk #0f1729`, `--slate #334155`, `--slate-lt #64748b`,
  `--bg #f8fafc`, `--green-pill #d1fae5` (Class pill only), `--red #dc2626` (delete/Accident only). No
  recoloring the sidebar. No yellow/green section bands. No purple/blue/pink. No emojis in
  headers/sidebar/tables. No middle-dot ( · ) subtitle lists below an H1.
- **KEEP** existing TMS trucking custom fields (Settlement No, Truck No, Pickup/Delivery Date, SB-Load No,
  Empty/Loaded Miles, Work Order) and the **lock-account** control wherever they exist.
- **Inline "+ Add new ___"** belongs at the end of every reference dropdown (opens a mini-create without
  closing the parent panel). Tables use the shared QBO-parity grammar + density tokens + resizable columns
  (CI-guarded — do not remove).
- WO display ID: `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}`; 7 immutable source types IS/ES/AC/ET/RT/IT/RS.
  Class auto-derive `{UNIT}-{LASTNAME}` (the only field allowed green).
- Detailed screen specs live in `docs/specs/qbo-parity/` — read them before building accounting UI.

---

## 8. Communication norms
- **Deliver, don't ask.** Ship the work first; don't pepper with "should I?" — except where §1 requires a STOP.
  In auto-mode/track work, execute the scope in order and stack PRs; the owner merges the gated ones. STOP only
  at finance / locked-page / explicit STOP-decision gates.
- The owner is **visual and fast-moving** — judges by what renders, wants momentum. Foreground work, show your
  diffs (`git diff --staged --stat`), confirm `pwd`/branch/status. **No silent retries** — on an unexpected
  error, STOP and surface the exact error.
- Do **not** use multiple-choice menus for decisions — make the call and proceed; when genuinely blocked,
  relay a plain ISSUES list, not a choose-one.
- All-caps and Spanish/English mixing is normal — don't comment on it, don't sanitize.
- "yes" / "approved" / "DONE" / "WORKING PERFECT" / "all pass" = move forward, no acknowledgment paragraph.
- Central Time (Laredo, TX) always. **Never suggest rest, breaks, or stepping away.**
- **Report outcomes honestly** — if a step was skipped or a check failed, say so. Lead with the deeper
  structural/decision-shaping point, not only tactical refinements.

---

## 9. Drift prevention & definition of done
- If two project files contradict (drift), **flag it, name both files, ask which is canonical** — don't
  silently pick one.
- **Definition of done:** code matches real schema (§4); local + CI green; merged per §1; deploy verified live
  via health endpoint; UI confirmed in the browser. Cross-check against specs/memory BEFORE saying "done."
- When you learn a durable new rule or correct a wrong one, update this skill (or the root CLAUDE.md /
  auto-memory) in the same session, so the next agent starts knowing it. That is how we stop the forgetting.

---

## Quick gate check (run this in your head before every merge)
1. Does the diff touch `accounting.*`, `catalogs.accounts`, any `db/migrations/*.sql`, posting/GL/balances,
   grants/RLS, or money movement? → **financial → STOP, needs owner approval (§1.4).**
2. Any other migration / `catalogs.*` / `mdata.*` schema or data, or a runtime dependency bump? →
   **STOP, needs owner approval (§1.3).**
3. Prod DB access of any kind, even read-only? → **ask first, every time (§1.5).**
4. Otherwise non-financial + green CI? → **auto-create PR, fix CI, resolve conflicts, squash-merge, verify deploy.**
