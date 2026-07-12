# 0091 Cluster — Disposition + Financial-Block Design (2026-07-11)

Backlog pass over the `.block-ready/0091-*.json` cluster (45 files). Each block was **verified
against live code on `main`** (base `26d762144`) per §0 VERIFY-EVERYTHING. Registry `classification`
is uniformly `FINANCIAL` and the per-file notes are generic ("faithful extraction") — real intent was
recovered from `docs/trackers/MASTER-MANIFEST-2026-07-10.json` and then re-checked in the tree.

Two genuinely-buildable **non-financial** blocks were built + guarded this session (separate commits).
Everything touching a migration / `accounting.*` / `catalogs.accounts` / posting / GL / grants / RLS /
settlement money-math is **financial cluster → §1.4 forbids a solo build**; those are captured here as
design direction and are gated on the owner's ceremony.

> Precedence note: design *direction* below (canonical picks, "reserve is an Asset", "collapse to
> `driver_finance.*`") is grounded in locked decisions + the LINKAGE canonical map. Any claim about a
> block's *current* live state that was not opened line-by-line this session is marked **UNVERIFIED —
> needs live re-check at build time**. Prod wins over this doc.

---

## A. BUILT this session (non-financial, ship-on-green)

### 0091-c2-3 — Samsara position cache scoped to operating entity  ✅ BUILT
- **File:** `apps/backend/src/jobs/samsara-position-poll-worker.ts`.
- **Root cause (verified):** the worker keyed each unit's cached position by bare
  `mdata.units.owner_company_id`. A leased unit is *operated* by the lessee (TRANSP/USMCA), *owned* by
  TRK — so leased trucks were attributed to the asset-holder and an RLS-scoped read by the operating
  carrier missed its own fleet (cross-entity leak, surfaces at USMCA launch).
- **Fix:** `COALESCE(u.currently_leased_to_company_id, u.owner_company_id)::text AS operating_company_id`
  — the operator rule used across fleet reads (§4). Read-only; no schema/write beyond the existing UPSERT.
- **Guard:** `scripts/verify-samsara-position-entity-scope.mjs` + `verify-steps/115`. Entity-scope
  baseline hash updated. `84-verify-mdata-entity-scope` OK.

### 0091-g9-h6 — total + has_more on Chart-of-Accounts list  ✅ BUILT
- **File:** `apps/backend/src/catalogs/accounts.routes.ts` (GET `/api/v1/catalogs/accounts`).
- **Root cause (verified):** the list paged with LIMIT/OFFSET but returned only `{ accounts }` — no
  total, no has_more — so a UI capped at limit=50 left the oldest accounts unreachable.
- **Fix:** COUNT(*) over the same filtered set under the same entity-scoped RLS client; return
  `{ accounts, total, limit, offset, has_more }`. Additive — existing `res.accounts` consumers unchanged.
- **Guard:** `scripts/verify-coa-list-total-pagination.mjs` + `verify-steps/116`.
- **Follow-up (not done):** the block also named the **trailer list**. The exact trailer-management
  endpoint is ambiguous (`fleet/trailer.routes.ts` has no plain list; trailers live in `mdata.units` /
  `mdata.equipment`, several `limit.max(200).default(50)` list routes share the pattern). Left for a
  follow-up once the precise trailer list endpoint is pinned — same additive total/has_more recipe.

---

## B. Already satisfied on `main` (no action — manifest was stale)

| Block | Finding (verified this session) |
|---|---|
| **m-woid-1** | Already fixed: migration `db/migrations/202607051000_woid1_next_wo_display_id_unit_company.sql` rewrote `maintenance.next_wo_display_id` off the phantom `mdata.units.operating_company_id` onto `owner_company_id`/`currently_leased_to_company_id`. |
| **m-docs-2** | Already built: `apps/backend/src/docs/upload-constraints.ts` (DOCS-2) enforces a MIME allowlist + 25 MiB cap on both upload paths (`files.routes.ts:46,92`); `documents/attachments.routes.ts:98,194` role-gates DELETE to Owner/Administrator. |
| **m-home-2** | Already built: `apps/frontend/src/api/home-widget-contract.test.ts` (HOME-2) pins cash-position reading `{ totalCents }→balance_cents` and factoring `{ reserveCents }→outstanding_cents`; the tiles read the correct backend shape. |
| **g8-1** | Already built + guarded: `apps/driver-pwa/src/lib/formatDateTime.ts` (fixed America/Chicago tz) + guard `scripts/verify-no-bare-tolocale-in-pwa.mjs` (passes). The 2 remaining `toLocale*` sites pass explicit locale + explicit `timeZone:"UTC"` (deliberate calendar renders, not device-locale bugs). |
| **g6-6** | The canonical payments list (`accounting/payments.routes.ts:27`) already defaults `status="active"` → excludes voided. (`factoring-advances.routes.ts:24` defaults `"all"`, but voided factoring advances are a distinct financial-display question — not this block's payments list.) |

## C. No-action — duplicate / stale / superseded / done (suffix-marked)

`b1-3_DISPATCH`, `c1-1-two-settlement-engines_DISPATCH`, `e1-1-qbo-mirror-home_DUPLICATE`,
`g4-idem1_DUP`, `g4-tx1_DUP`, `g6-4-bills-amount-cents-nullable_DISPATCH`, `g7-1_DISPATCH`,
`m-settle-1-settlement-gl-killswitch_DISPATCH`, `b1-2-factor-reserve-default-role_LIKELY-STALE`,
`flag-lease_SUPERSEDED`, `flag-live-confirm-flag-state_DONE` — treated as no-action per the suffix
convention. (`c1-1-settlement-engine-canonical` is the canonical design-only twin — see §D.)

## D. Blocked / not-a-code-block

- **g7-4** — the 7 "empty" e2e specs (`bill-create`, `expense-create`, `accident-create`,
  `work-order-create`, visual `sidebar`/`forms`/`map-modal`) are `test.skip(true, "TODO(P3-T11.18):
  blocked on auth-ready e2e harness")`. That is an **honest skip, not a false-green** — real assertions
  are blocked on the authenticated Playwright harness that does not yet exist. No quick win.
- **repo-public** — "make the GitHub repo private" is a repository access-control change → **§1.6
  prohibited for an agent**. Owner action only. Flagged, not touched.
- **h2-1** — replace `xlsx`(SheetJS) with `exceljs` on untrusted-parse paths is a **runtime dependency
  bump → §1.3 owner OK required**. Design/approve, not solo.

---

## E. FINANCIAL cluster — design direction only (§1.4: owner ceremony required to build)

Each of these touches a migration, `accounting.*`/`catalogs.accounts`, grants/RLS, posting/GL, or
settlement money-math. **An agent never self-builds these.** Direction below; current-state claims are
marked verified/UNVERIFIED.

### Settlement engine consolidation — c1-1 / e1-4 / g11-2 / g9-h1 / m-settle-1
- **c1-1 (canonical)** is *already a committed design doc*: `docs/specs/SETTLEMENT-ENGINE-CANONICAL.md`
  (verified 3 live paths: `postSettlement` payroll.* LIVE Bill+Payment; `postSettlementToGl` FIN-18
  dormant/unregistered; `closeLoadBookendedSettlementForDriver` driver_finance.* LIVE, no GL). Canonical
  record model = **`driver_finance.*`**; `payroll.*` is RETIRE/read-only (LINKAGE §b). **e1-4** ("collapse
  4 schemas → 1") is the same decision — do not open a new engine.
- **g11-2** (reconcile `settlement_lines` vs `driver_settlement_deductions` sub-ledgers) and **g9-h1**
  (compare-and-swap / `SELECT..FOR UPDATE` to stop settlement double-pay) and **m-settle-1** (gate
  `postSettlement()` behind `SETTLEMENT_GL_POSTING_ENABLED`) are all downstream of the canonical decision
  and are **settlement money-math / flag-gating → owner ceremony.** UNVERIFIED vs current main.

### FK + retype migrations (schema — owner ceremony)
- **e2-3** — add FKs + retype `operating_company_id` TEXT→uuid FK on `dispatch.border_crossing_events`
  (same class as the already-built E2-2 on `driver_layovers`). Migration.
- **e2-4** — add FK `driver_uuid → mdata.drivers` on `safety.da_test_records` /
  `da_program_enrollments` (drug-&-alcohol records can orphan). Migration.
- Pattern is proven (E2-2). Idempotent CREATE-only, FORCED RLS + grants (0065 pattern), fresh-DB-CI safe.

### Grants / RLS / DELETE governance (owner ceremony)
- **g10-h1** — revoke DELETE grant on `mdata.load_stops` (8 CASCADE evidence children incl POD/detention)
  and convert those children CASCADE→RESTRICT. Grant + DDL migration.
- **m-lists-1** — add opco predicate + FORCE-RLS/grants to `dispatch_flag_colors` /
  `load_cancellation_reasons` UPDATE + stub-catalog-purge (cross-entity write+read leak). Migration.

### Posting-flag classification (financial — flags govern money)
- **h3-3** — make `isPostingFlag()` recognize `*_VOID_ENABLED` (`VOID_ENFORCEMENT_ENABLED`,
  `WO_VOID_ENABLED`) as posting-class. Small code change but it governs the money kill-switch surface →
  treat as financial; owner sign-off. UNVERIFIED vs current main.

### Ledger / accounts / factoring (accounting.* — owner ceremony)
- **m-lists-2** — "Merge accounts" (CoaBatchActions) must **repoint GL references**, not only deactivate
  the source `catalogs.accounts` row. GL-repoint = financial.
- **m-factor-1** — pick ONE canonical factoring-reserve ledger; `accounting.factoring_companies.
  current_reserve_balance` has no write path (dashboard reads a dead column); 4 un-reconciled sources.
- **b1-2** (`_LIKELY-STALE`) — the underlying issue is real: `factor_reserve_default` COA-role typed
  Liability while the **locked model = reserve is an ASSET**. Remove/repoint = `catalogs.accounts` →
  owner. Re-verify staleness against prod before acting.
- **g6-4** (`_DISPATCH`) — `accounting.bills.amount_cents` nullable drops out of SUM aggregates; make it
  NOT NULL + pick one canonical money column. Migration + backfill.

### Period close / spine growth / triggers (owner ceremony)
- **g11-5** — month-close gate from "zero A/R+A/P overdue" (unsatisfiable for a factoring carrier) →
  reviewed/acknowledged sign-off + an **audited reopen route**. Accounting-period logic.
- **h5-1** — monthly range partition + maintenance cron (or R2 archive) for unbounded append-only spine
  tables (`outbox.events`, `audit.row_changes`, `event_log`). Migration + cron; append-only WORM care.
- **info-b3-3** — arm the G18 fuel-transaction trigger against a future load hard-delete path (currently
  `ON DELETE SET NULL`, trigger only fires INSERT/UPDATE). Trigger DDL migration.

### QBO sync / routes / dep (backend-financial-adjacent — verify + owner sign-off)
- **g10-h3** — build the 6 backend routes the live UI 404s on: customer-payment unapply, factoring
  bank-match apply, driver-escrow forfeit, bank mark-transfer, driver dispatch-eligibility, Pre-Flight
  DVIR. **4 of 6 are money routes → financial.** The 2 non-money routes (driver dispatch-eligibility,
  Pre-Flight DVIR) are independently buildable non-financial — recommend splitting them into their own
  blocks and building those first. UNVERIFIED which already exist on current main — re-scan at build.
- **g5-2** — move QBO HTTP calls (`createDriverWithQboVendor` / `createUnitWithQboClass`) outside the
  open DB transaction (pool exhaustion). Refactor around money-mirror writes → careful; owner sign-off.
- **g10-h4** — gate the generic-catch branch of QBO push sync on the same dead-letter attempt cap as the
  HTTP-status branches. Error-handling only, but on the accounting push path → verify + sign-off.
- **g6-1** — accounting "today" computed in UTC not Central (`companyBusinessDate` exists but the
  accounting layer doesn't use it). Affects which period a row posts to → **financial**; owner sign-off.
- **g9-h5** — profit-per-truck report double-counts via cartesian fan-out + includes cancelled/voided
  rows. Read-only reporting SQL fix (no posting) — **likely buildable non-financial** once the exact
  report query is pinned; deferred here only for scope. Recommend building next.
- **g1-3** — require `assertCompanyMembership` on settlement-approval / dispute / cash-advance-approve
  handlers (currently bare `withCurrentUser`). Auth hardening (no money-math), but on money endpoints —
  recommend building with careful per-handler verification; owner-aware.

### Namespace / library decisions (design)
- **d1-2** — vendors split `mdata.vendors` (rich create) vs `mdata.qbo_vendors` (WO/expense/CC pickers):
  canonical AP truth = **`mdata.vendors`** (LINKAGE §b); `qbo_vendors` is a mirror. Repoint writers.
- **m-driver-1** — route `/maintenance/drivers` create/edit through the canonical `CreateDriverModal`
  path instead of a shadow writer (canonical-write direction). Non-financial but large FE wiring.
- **h2-3** — plan an in-house session layer to replace deprecated `lucia` (sunset Mar 2025). Plan doc.

---

## Verification log (this session)
- Base `main` `26d762144`; worktree branch. Files opened + line-cited above.
- `84-verify-mdata-entity-scope` OK; `verify-guard-wired` PASS (0 unaccounted) after both new guards.
- Backend `tsc --noEmit` clean for `catalogs/accounts.routes.ts`.
- Prod DB **not** accessed (gated §1.5); schema claims that need prod are marked UNVERIFIED.
