# IH35-TMS — Architecture & Blueprint (live, honest, verified)

> **Status:** authoritative current-state document.
> **Verified:** 2026-06-27 full audit — `origin/main` (`git ls-tree`/`git grep`), Render live `/healthz`,
> `gh` PR data, **and an owner-authorized read-only introspection of the production Neon database**
> (`br-fancy-credit-akjnd07a`, `default_transaction_read_only`). Every figure is measured, not remembered.
> Earlier drafts used a stale local clone + migration-grep estimates and were wrong; this revision replaces
> them with live truth (e.g. **619 live tables**, not the ~440 grep estimate).
> **Git history:** `origin/main` is **498 commits, first commit 2026-06-15** (history was re-baselined that
> day; 0 merge-commits). **1,454 merged PRs** (1,450 to `main`) span the full project life; **7 open**;
> **2 authors**; 1,468 remote branches. Render prod runs `origin/main` HEAD — current.
> **Supersedes:** `docs/IH35-TMS-ARCHITECTURE.md` + `docs/IH35-TMS-BLUEPRINT.md` (both last updated
> 2026-06-15, now stale: they say "2 entities / 4 trucks"; reality is **3 entities**, see §2).
> **Authority over this doc:** the root `CLAUDE.md` constitution and `docs/lockdown/00_LOCKED_DECISIONS.md`
> win on any conflict; where this doc and those disagree it is a drift to fix (see §11).

---

## 0. The one-paragraph truth

IH35-TMS is a **production, single-tenant-per-company trucking ERP** for a real operating motor carrier
running Laredo, TX ↔ Mexico freight. It is not a generic TMS demo: it holds **live financial and
legal-evidence data** for a company **in active Chapter 11 reorganization**, where the audit trail is not a
feature but an existential, legal obligation. The whole system is built so that **money and evidence are
append-only, entity-isolated, and reconcilable to QuickBooks Online** — every other module (dispatch,
maintenance, fuel, safety, driver settlements, factoring) exists to feed that financial + compliance spine
truthfully. The hard rule everything bends to: **the three legal entities share nothing**, nothing is ever
deleted (only voided), and QBO remains the accounting system of record.

---

## 1. The real purpose & goal (why this exists)

1. **Run the live carrier end-to-end** — book loads, dispatch drivers, track the fleet (Samsara), buy fuel
   (Relay/Love's), maintain equipment, pay drivers (settlements), bill customers, factor invoices (Faro),
   and keep the books — in one system instead of spreadsheets + QBO + paper.
2. **Survive and document Chapter 11.** TRANSP (the operating carrier) is a Chapter 11 DIP. The system's
   reason-for-being is a **tamper-evident, append-only audit spine** and clean per-entity books that hold up
   to a trustee / court / lender. "Trust IS the product."
3. **Keep three legal entities truly separate.** TRK (assets), TRANSP (operations), USMCA (future carrier)
   must never commingle money, accounts, or data — this is the keystone the entire accounting design serves.
4. **Reach/surpass QuickBooks / McLeod / NetSuite / Alvys-grade integrity** while staying a tool a
   non-technical owner can drive visually. Agents build; the owner (Jorge) decides every money-moving and
   schema gate.
5. **Be productizable later.** Multi-tenancy (`org.companies` / `org.user_company_access`) is foundational,
   so the same platform could become SaaS for other carriers.

---

## 2. Business reality (the ground the software stands on)

**Three legal entities** (`org.companies`), each an isolated tenant:

| Code | Entity | Role | UUID | Notes |
|------|--------|------|------|-------|
| `TRANSP` | IH 35 Transportation LLC | **Operating carrier** (active) | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | Chapter 11 DIP; QBO-connected; the only live posting tenant today |
| `TRK` | IH 35 Trucking LLC | **Asset holder** | `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` | Owns units/equipment; leases to TRANSP |
| `USMCA` | (future carrier) | **Pre-launch** | `5c854333-6ea5-4faa-af31-67cb272fef80` | Hidden until **July 2026** (`is_active=false`) |

- **Asset ownership model:** `mdata.units` carries `owner_company_id` (TRK owns) **and**
  `currently_leased_to_company_id` (leased to TRANSP) — there is deliberately **no `operating_company_id`**
  on units (a recurring 500-bug source when code assumes otherwise).
- **Factoring:** **Faro Factoring** today; planned migration **Faro → RTS**. Equipment financing via
  **Commercial Credit Group (CCG)**. Customer credit-limit sources: `factor` / `manual` / `rmis_future`.
- **Geography / tax:** Laredo, TX entities; cross-border (USMCA lanes are the future business).
- **Posting basis:** TRANSP keeps **cash basis** (books + MOR); posting is cash-primary (credit bank), AP
  accrual is the rare exception. **QBO is the system of record** — TMS mirrors and reconciles to it.

---

## 3. Core design principles (non-negotiable invariants)

These are enforced by CI guards and the constitution; violating them is a production/legal risk.

1. **Entity independence — per-entity, never global.** Every row scoped by `operating_company_id`; RLS on
   every table; `security_invoker=true` on every view. Never join across entities.
2. **Void, never delete.** Set `voided_at` / `is_active=false`; never `DELETE`. Evidence (POD, detention,
   load stops) is never destroyed — archive via status, never `DELETE` (CASCADE would erase legal evidence).
3. **Append-only audit.** `audit.row_changes` and `audit_events` are never `UPDATE`/`DELETE`. Every table
   gets `is_active` + audit.
4. **QBO is the accounting system of record.** TMS posts/mirrors via the `outbox` event queue and
   reconciles drift; it does not replace QBO.
5. **Reuse the posting/GL infra — write no new GL math.** One canonical resolver per concern; reuse
   allocation infra.
6. **Additive-only product surface.** Never remove/reorder modules, pages, columns, fields, routes —
   **archive, never delete**. Only the owner changes a locked list, in writing.
7. **Owner-gated money & schema.** Migrations, anything touching `accounting.*` / `catalogs.accounts`, any
   posting/GL, and any prod-DB access **stop for the owner's explicit OK**. Posting feature-flags default
   **OFF**. (See `CLAUDE.md §1`.)
8. **UUIDv7 server-generated PKs; lockstep INSERTs;** runtime DB role `ih35_app` (a GRANT target —
   **there is no `ih35_app.*` data schema**).

---

## 4. System topology

### Apps (`apps/`)
| App | Path | Stack | Purpose |
|-----|------|-------|---------|
| Backend API | `apps/backend` | Node 22 + Fastify + TypeScript | REST API, business logic, integrations, cron |
| Office web | `apps/frontend` | Vite + React + TS (project refs) | The desktop office product |
| Driver PWA | `apps/driver-pwa` | Vite + React + TS + i18next | Driver mobile app — dark, EN/ES, offline IndexedDB queue |

(`apps/web-office`, `apps/web-driver-pwa` are legacy/secondary dirs; the live products are the three above.)

### Deploy (Render, `render.yaml`)
- `ih35-tms-backend` (web) — auto-deploys `main`; preDeploy runs `npm run db:migrate` against Neon.
- `ih35-tms-frontend` (static) — **separate** service; HTML edge-cached via Cloudflare (~5 min lag).
- `ih35-tms-driver` (static) — driver PWA.
- `loves-card-import` (cron) — fuel-card import; other crons run in-process.
- **Domains:** `app.ih35dispatch.com` (office) · `driver.ih35dispatch.com` (PWA) ·
  `api.ih35dispatch.com` / `ih35-tms.onrender.com` (API).
- **Health/version:** `GET /api/v1/healthz/shallow` → `{version:<short-sha>}`; deep `/api/v1/healthz`.

### Database
- **Neon Postgres**, project `tiny-field-89581227`, prod branch `br-fancy-credit-akjnd07a`, db `neondb`,
  runtime role `ih35_app`. **The default branch IS production.** Direct prod access is gated.
- **Schema = `db/migrations/` (the source of truth).** **508 migration files** on `origin/main`, highest
  sequence `202606260200` (mixed 4-digit + 12-digit timestamp numbering; new migrations must exceed main's
  current max, idempotent `DO`/`IF NOT EXISTS`).
- **Live prod is current and healthy** (measured 2026-06-27): Render backend serves `origin/main` HEAD
  (`8ac7cf2`); deep `/api/v1/healthz` reports all critical checks green — `postgres.select1` ✓,
  `migrations.ledger` ✓ (no pending), `redis.ping` ✓, plus `r2.head_bucket` / `qbo.sync_alerts` /
  `email.queue` / `background_jobs` all ✓.

---

## 5. Data model — LIVE PROD (introspected read-only, 2026-06-27, authorized)

Measured directly from the **production Neon branch `br-fancy-credit-akjnd07a`** (read-only,
`default_transaction_read_only`, via `neonctl` as `neondb_owner`):

| Live prod metric | Value |
|------------------|------:|
| User schemas | **72** |
| **Base tables** | **619** |
| Views | **47** |
| Migrations applied (ledger) | **512** |
| Estimated total rows | **~2,439,703 (≈2.44M)** |

> **Correction:** my earlier "~440 net tables" was a **migration-grep estimate and was wrong** — the live DB
> has **619 tables**. Grep undercounts because many tables are created via functions, partitions, seed
> migrations, and non-`schema.table` DDL the regex never saw. The 619 figure is the live truth.

Largest domains by **live table count** (prod `pg_tables`):

| Schema | Live tables | Owns |
|--------|-----------:|------|
| `catalogs` | **108** | **chart of accounts (`catalogs.accounts`)**, classes, + many factory/reference catalogs |
| `safety` | 60 | accidents, inspections, violations, claims, expiry tracking |
| `public` | 52 | legacy/uncategorized + framework tables |
| `accounting` | 47 | bills, payments, invoices, journal entries, posting, periods |
| `mdata` (master_data) | 43 | `loads`, `load_stops`, `units`, `drivers`, `customers`, `vendors`, `equipment` |
| `maintenance` | 33 | work orders, parts, PM schedules |
| `dispatch` | 23 | assignment history, detention, in-transit, ETA |
| `driver_finance` | 22 | `driver_settlements`, settlement_lines, advances, deductions |
| `integrations` | 21 | QBO/Samsara/Plaid sync state + logs |
| `compliance` | 16 | HOS/DOT/IFTA |
| `identity` / `legal` | 10 / 10 | users, sessions / lease-to-own contracts |
| `insurance` / `banking` / `reports` / `reference` | 8 each | policies / bank feeds / report defs / reference data |

(Note: prod has 72 schemas vs 70 seen in migration grep, and `catalogs` is **108 tables live** vs 36 from
grep — the factory/reference catalog tables are created by seed migrations the regex didn't match.)

**Schema landmines (verify names against `db/migrations/` before writing SQL):**
- **No `ih35_app.*` data schema** — `ih35_app` is a role; `ih35_app.<table>` 500s.
- loads = `mdata.loads` (`rate_total_cents` = GROSS rate; `assigned_primary_driver_id`; `soft_deleted_at`).
  **`mdata.loads` has no `trailer_id`** (trailer lives in assignment history).
- `mdata.drivers` has `first_name`/`last_name` — **no `full_name`** (use `CONCAT_WS`); `mdata.units` has
  `owner_company_id`/`currently_leased_to_company_id`, **not** `operating_company_id`.
- bills = `accounting.bills`; bank = `banking.bank_transactions` (`is_credit`);
  driver earnings = `driver_finance.settlement_lines`. Audit = `audit.row_changes`.
- **`catalogs.accounts` is GLOBAL today** (operating_company_id nullable, 2 global UNIQUEs) — violates
  entity independence; **AF-1** is the migration that makes it per-entity (built, **HOLD** — see §7).
- **Naming canon = `accounting.*`** (never `finance.*`); a `finance.*` drift exists in places
  (e.g. `finance.loans`) and is a known cleanup, not the standard.

---

## 5a. Live operational reality — BUILT vs IN-USE (the honest progress truth)

The single most important finding of this audit: **the software is extensively built but barely transacting
yet.** Master data is loaded; the money/operations flows are essentially empty. Live prod row counts
(read-only, 2026-06-27):

| Live dataset | Rows | Read |
|--------------|-----:|------|
| Companies (entities) | **3** | TRANSP + TRK active, USMCA inactive |
| Users | 23 | staff onboarded |
| Drivers | **92** | master data loaded (Samsara) |
| Units (trucks) | **93** | fleet loaded (Samsara) |
| Customers | **1,213** | imported (QBO/RMIS) |
| Vendors | **878** | imported (QBO) |
| Chart of accounts (`catalogs.accounts`) | **385** | QBO-mirror present |
| Bank transactions | **2,649** | Plaid feed flowing |
| Audit row-changes (evidence) | **2,025** | audit spine active |
| **Loads** | **10** | ← real dispatch volume is tiny |
| **Invoices (AR)** | **1** | ← AR barely started |
| **Bills (AP)** | **0** | ← no AP posted |
| **Driver settlements** | **0** | ← none run |
| **Fuel transactions** | **0** | ← none recorded |

**Interpretation (honest):** build progress is very high (619 tables, 1,850 endpoints, 920 pages, all
modules present); **operational/financial usage is pre-launch.** Master data (drivers, units, customers,
vendors, CoA, bank feed) is in place, but the transactional spine (loads → invoices → bills → settlements →
fuel → GL posting) has **near-zero live data** — consistent with posting flags being OFF (§7) and real
transacting not yet started. "Done building" ≠ "in production use." The remaining work is therefore less
about new features and more about **activating + verifying the financial flows on real data** (§9, and the
pending-tasks companion doc).

---

## 6. Module map (the locked 23-item sidebar)

Navigation is a fixed **navy 80px left rail** (`rgb(27,35,51)`); all other nav is the **top horizontal
bar**. The owner-locked, **additive-only** order (`docs/lockdown/00_LOCKED_DECISIONS.md §1`, enforced by
`verify-sidebar-contract.mjs`):

```
 1 home          9 eld              17 form_425 (425C)
 2 maintenance  10 cash-flow*       18 drv_app (driver PWA)
 3 fuel         11 accounting       19 lists
 4 dispatch     12 bank             20 reports
 5 driver-hub*  13 factoring        21 docs
 6 safety       14 vendors          22 users
 7 drivers      15 customers        23 help
 8 insurance    16 legal
```
`*` driver-hub (#5) and cash-flow (#10, a **module not a report**) are the newest; main currently ships the
21-array and grows to 23 as those land. **Frontend scale today: 906 page components, 447 routes.**

> **Honesty note:** `CLAUDE.md §7` still says "15 fixed modules." That is **stale** — the locked,
> CI-enforced reality is this **23-item** list. Flagged in §11 as a doc drift to reconcile.

---

## 7. The financial spine (the heart of the system)

- **QBO parity (locked 2026-06-08, `docs/specs/qbo-parity/`):** the CoA page must render the **QBO-mirror**
  (~199 accounts via `/api/v1/mdata/accounts`), not the ~50-row local seed; QBO "Location" = driver/operator;
  inline "+ Add new" mandatory in every reference dropdown; shared QBO-parity table grammar with density
  toggle; right-drawer create/edit (~30% viewport), full-page transaction editors.
- **Posting model:** cash-basis for TRANSP; **reuse existing posting/GL functions** (e.g. one canonical
  bill-account-resolver), never new GL math. Posting is **flag-gated and default OFF**
  (`BILL_GL_POSTING_ENABLED`, `EXPENSE_GL_POSTING_ENABLED`, `FINANCE_HUB_*_POST_ENABLED`, …).
- **Entity-COA keystone (AF-1):** `catalogs.accounts` is global today; AF-1 makes it per-entity (backfill +
  split + re-key 26 live FKs + composite uniques + entity RLS). **Built and branch-tested on Neon, held as a
  `[HOLD-FOR-JORGE — TIER 1]` PR — never merged, never run on prod.** Every other financial posting flag
  depends on AF-1 landing first.
- **The gated financial frontier** (Jorge + GUARD full-ceremony, never self-merged): AF-0…AF-8, CHAIN-01…07
  (vendor/bill/payment/bank/invoice/settlement chains), STMT-1/2/3 (statements/opening balances), VOID
  (void-everywhere), block-37 (QBO sync repair), block-40 (accounting audit trail), CONN-1…4 (Plaid / Faro /
  Relay / EDI), and the 29-block enterprise/hardening series (depreciation, escrow, IFTA, 1099, audit-hash).
- **Money is stored in integer cents** end-to-end; display divides by 100 (a recurring "10× bug" guard).

---

## 8. Integrations (live — do not break)

| Integration | Role |
|-------------|------|
| **QuickBooks Online** | Accounting **system of record** for bills/expenses/payments/invoices; office payroll. Sync via `outbox`; drift surfaced by the QBO Sync Drift dashboard |
| **Samsara** | Telematics — vehicle GPS, HOS, mileage (fleet board, ~100 vehicles in scope). "Samsara login IS the assignment" |
| **Relay / Love's** | Fuel-card networks — pump transactions → fuel expenses → IFTA gallons (`loves-card-import` cron) |
| **Plaid** | Bank-feed connectivity for the Banking module (`banking.bank_transactions`) |
| **Faro Factoring** | Invoice factoring (current); **Faro → RTS** migration planned |
| **CCG** | Commercial Credit Group — equipment financing |
| **Cloudflare R2** | Evidence/document object store (`ih35-tms-evidence`), chain-of-custody |
| **Auth** | Lucia sessions + Google OAuth |

---

## 8a. Core logic & domain flows (how the software actually works)

The whole system is a set of pipelines that converge on the **financial + audit spine**. Each flow is
entity-scoped (RLS `app.operating_company_id`) and append-only (void, never delete).

1. **Load → cash (the revenue spine):** Book Load (`mdata.loads`, `rate_total_cents` = GROSS customer rate)
   → assign driver/unit (`dispatch.load_assignment_history`; trailer is a trailer-only assignment row,
   **not** a column on loads) → stops/POD (`mdata.load_stops` — evidence, never deleted) → deliver → close →
   **invoice** (`accounting.invoices`, `source_load_id`, cents) → **factor** (Faro: `factoring.*`
   advance/reserve/fee) → **AR payment** → bank.
2. **Fuel → expense → IFTA:** Relay/Love's pump txn → `fuel.fuel_transactions` (**must FK to a load**, G18)
   → fuel expense → IFTA gallons.
3. **Driver pay:** earnings (`driver_finance.settlement_lines`) → `driver_finance.driver_settlements`
   (`net_pay`) with advances/deductions → pay via bank txn → 1099 at year end.
4. **Bill/expense → GL (flag-gated):** bill (`accounting.bills`) → category→GL resolver
   (`accounting.expense_category_account_map`) → **posting engine (default OFF —
   `BILL_GL_POSTING_ENABLED` / `EXPENSE_GL_POSTING_ENABLED`)** → QBO mirror via `outbox`.
5. **Bank reconciliation:** Plaid → `banking.bank_transactions` (For review / Categorized / Excluded) →
   categorize → match to bill/invoice/settlement → reconcile.
6. **QBO sync (system of record):** every master/txn write → `outbox` event → push handlers (mostly default
   ON) → `mdata.qbo_*` mirrors; the **QBO Sync Drift** dashboard surfaces divergence.
7. **Audit spine (the reason the system exists):** every write → `audit.row_changes` (append-only) +
   `audit.audit_events`; voids set `voided_at`/`is_active=false`. This is the Chapter-11 evidence trail.

## 8b. Per-module build status (files present on origin/main)

Every module is substantially built (backend domain files · frontend pages):

| Module | Backend files | Frontend pages | Notes |
|--------|-------------:|---------------:|-------|
| accounting | 204 | 79 | largest domain; posting engine present but **flag-gated OFF** |
| safety | 113 | 121 | accidents / inspections / claims / expiry |
| dispatch | 113 | 87 | board, book-load, assignment, ETA |
| maintenance | 90 | 85 | work orders, PM, parts |
| reports | 77 | 73 | incl. Reports→Audit (7 pages) |
| driver_finance | 46 | 20 | settlements, advances, deductions |
| banking | 37 | 50 | Plaid feeds, reconcile, transactions |
| insurance | 38 | 12 | policies, claims |
| compliance | 20 | 7 | HOS / DOT / IFTA |
| factoring | 19 | 11 | Faro advances / reserves |
| lists | 18 | 120 | reference catalogs |
| drivers | 17 | 44 | driver profiles |
| legal | 14 | 19 | lease-to-own contracts (**flag-gated**) |
| finance (hub) | 10 | 7 | amortization / loan / calculator (**flag-gated**) |
| customers · vendors · fuel · docs · eld | 2–7 | 2–14 | logic also lives in `catalogs/*`, `integrations/*`, `compliance/hos` |

(`fuel` backend is thin because fuel logic lives in `catalogs/fuel`, `integrations/fuel`,
`safety/fuel-gps-match`; `eld` is a frontend view over `compliance`/HOS data.)

**Full pending/missing task list:** see the companion file
`docs/IH35-TMS-PENDING-AND-MISSING-TASKS.md`.

---

## 9. Current scale & build state (measured on origin/main, 2026-06-27)

### Real software scale (measured against `origin/main`, not the local clone)
| Metric | Count |
|--------|------:|
| Backend route files (`*.routes.ts`) | **505** |
| Backend HTTP handlers (`app.get/post/put/patch/delete`) | **1,850** |
| Backend source `.ts` (excl. tests) | 1,287 |
| Frontend page components (`pages/**/*.tsx`) | **920** |
| Frontend routes (`<Route>` in manifest) | **448** |
| Frontend `.tsx` (excl. tests) | 1,130 |
| CI guard scripts (`scripts/verify-*`) | **1,007** |
| DB migration files | **508** |
| DISTINCT tables defined / net of drops | 478 / **~440** |
| Schemas | **70** |

> Earlier figures (475 routes, 1,779 handlers, 906 pages, 702 guards) were read from a **stale local clone
> that was 3 commits behind `origin/main`**, and the table counts were `CREATE TABLE` statements (645), not
> distinct tables. The numbers above are the corrected, `origin/main`-true values.

### Build state — the block tracker (a project-management abstraction, NOT a software metric)
`npm run reconcile:blocks` rolls up **"blocks"** (planned units of work) across 5 doc sources
(`.block-ready` 294 · program 61 · enterprise-29 29 · accounting 26 · gap-spec 57, de-duped = **467**):
**DONE 420 · NEEDS-VERIFY 19 (all financial) · PENDING 4 · PENDING (GATED) 24** → TOTAL PENDING 28. This
measures the *plan*, not the codebase — the codebase scale is the table above. The non-financial board is
effectively complete; the ~44 not-DONE blocks are the financial frontier behind the owner+GUARD Tier-1 gate,
led by AF-1.

---

## 10. How work is governed (so the numbers stay trustworthy)

- **Constitution:** root `CLAUDE.md` auto-loads every session (permissions, schema invariants, workflow,
  product locks). `docs/lockdown/00_LOCKED_DECISIONS.md` holds owner-locked decisions.
- **Merge = deploy.** Merging to `main` ships to prod immediately (no second gate). Non-financial green-CI
  changes self-merge; **anything financial/schema/migration/`catalogs.accounts`/money stops for the owner.**
- **Maker ≠ checker on money.** Coder builds + holds; GUARD live-verifies; the owner signs (applies
  `JORGE-APPROVED`). Tier-1 financial blocks are built **solo-and-hold** (open `[HOLD-FOR-JORGE]` PR, never
  merge, never flip a posting flag, never run on prod).
- **Every bug fix ships a CI guard** so it can't regress; the **block reconciler** (`reconcile:blocks`) is
  the single source of built-vs-pending truth, now emitting a per-block PR list + delta + source universe.
- **Verification, not vibes:** "done" = code matches real schema + local & CI green + merged per gate +
  deploy verified via health endpoint + UI confirmed in browser.

---

## 11. Known drifts (flagged honestly, not hidden)

1. **Module count:** `CLAUDE.md §7` says "15 fixed modules"; the locked, CI-enforced sidebar is **23 items**
   (§6). → reconcile `CLAUDE.md` to the 23-array.
2. **Entity count in old docs:** `docs/IH35-TMS-ARCHITECTURE.md` / `BLUEPRINT.md` (2026-06-15) say "2
   entities / 4 trucks." Reality is **3 entities** (USMCA pre-launch). → this file supersedes them.
3. **`catalogs.accounts` is global** (not yet per-entity) — violates entity independence until **AF-1**
   lands. Tracked, gated.
4. **`finance.*` vs `accounting.*`:** canon is `accounting.*`; stray `finance.*` objects (e.g.
   `finance.loans`) are a known cleanup.
5. **Prod schema drift:** prod ≠ `db/migrations` in some catalog tables (missing tables → 42P01); fix path
   is new idempotent `CREATE IF NOT EXISTS` migrations.
6. **Hazmat fields:** `CLAUDE.md §4` says "no hazmat fields" yet `mdata.loads` has `hazmat_*` columns —
   unresolved, owner to declare canonical.

> When any two project files contradict, the rule is: **flag both, name them, ask which is canonical** —
> never silently pick one. This section is that flag.

---

## 12. Provenance & method (how every figure was measured, 2026-06-27)

**All measured against `origin/main` (not the working tree) after a first pass used a stale local clone.**
- Tables: `git grep -hiE 'CREATE TABLE' origin/main -- 'db/migrations/*.sql'` → distinct `schema.table`
  (lowercased, `sort -u`) minus distinct `DROP TABLE` → defined / dropped / **net**. Migration count =
  `git ls-tree origin/main` file count.
- Backend: `git ls-tree origin/main` file counts + `git grep -hoE 'app\.(get|post|put|patch|delete)\('`.
- Frontend: `pages/**/*.tsx` + `<Route` counts via `git ls-tree` / `git grep` on `origin/main`.
- CI guards: `scripts/verify-*.{mjs,ts,cjs}` via `git ls-tree origin/main`.
- Git: `git rev-list --count origin/main`, `git shortlog -sn`, `gh pr list --state {merged,open}`.
- Render live: `curl /api/v1/healthz/shallow` (version) + `/api/v1/healthz` (critical checks).
- Entities/sidebar/principles: `org.companies` seeds, `00_LOCKED_DECISIONS.md`, `CLAUDE.md`.
- "Blocks": `npm run reconcile:blocks` — a doc-roll-up of planned work, explicitly **not** a code metric.

### Live database (owner-authorized read-only introspection, 2026-06-27)
Per `CLAUDE.md §1.5` direct Neon access is gated and asked-for each time; the owner authorized this one.
Method: `neonctl connection-string … --role-name neondb_owner` on prod branch `br-fancy-credit-akjnd07a`,
all queries under `SET default_transaction_read_only = on` (zero writes), counts from `information_schema`
/ `pg_tables` and **row estimates from `pg_class.reltuples`** (fast, no table scans). The connection string
was held in-memory only and never persisted (per §1.5). Live results: **72 schemas, 619 base tables, 47
views, 512 migrations applied, ~2.44M rows** + the business-data counts in §5a.

_If any number here disagrees with a fresh `git grep` on `origin/main`, a live `/healthz`, or a DB
introspection, trust the live source and regenerate this file — it is meant to be re-measured, not trusted
blindly._
