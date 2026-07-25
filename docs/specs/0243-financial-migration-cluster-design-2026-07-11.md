# 0243 cluster — financial / migration remediation design (owner-gated)

**Date:** 2026-07-11 (CST) · **Author:** agent (non-stop 0243 backlog pass)
**Scope:** the `.block-ready/0243-*` blocks that are **financial-cluster (§1.4) or require a DB migration
(§2)** and therefore **must NOT be built solo** — this is a design/plan only. Non-financial blocks in the
same cluster were built and shipped separately (see "Built this pass" below). Every root cause here was
recovered from `docs/trackers/MASTER-MANIFEST-2026-07-10.json` and cross-checked against live repo code;
schema/enums/columns marked **UNVERIFIED — needs prod check** were NOT confirmable against the gated Neon
prod branch this session (§0/§1.5) and must be verified against prod before any migration is authored.

> **Gate reminder (§1.4/§2):** a migration or any `accounting.*`/`catalogs.accounts` touch makes the whole
> PR financial. Build the migration locally against a throwaway Postgres, show the owner the full SQL +
> `git diff --staged --stat`, **WAIT for explicit "OK to merge."** Never `npm run db:migrate` in this
> clone (it can hit prod). Reuse existing posting/GL functions — write NO new GL math. Migration numbers
> strictly above main's current max, idempotent (`IF NOT EXISTS` / `DO` guards). Opening/financial entries
> are owner-entered only.

---

## Built and shipped this pass (non-financial — for context, NOT in this doc's gated scope)
- **0243-c2-3** samsara position-poll entity-scope → `COALESCE(currently_leased_to_company_id, owner_company_id)` + guard.
- **0243-h1-2** CORS prod defaults consolidated + fail-loud + guard.
- **0243-g7-4** e2e assert-or-skip regression guard (the 7 specs were already `test.skip(true)`).
- **0243-d4-1** samsara webhook units-primary unit resolution + guard.
- **Already-built (verified live, no action):** g8-4 (a11y-input-labels guard), g8-5 (list error states),
  swl-1 (spine-emit logging), swl-2 (recon/finance-hub error surfacing), c2-4 (push-notification opco scope),
  d1-4 (sub-customer parent validation).

## No-action (suffix-marked in registry)
`_DUPLICATE` (b1-3, d2-2/`_DUP`, e1-1, g6-4), `_DISPATCH` (d1-2, g11-5/7/9, g4-idem1, g4-tx1, g9-h6, h3-2),
`_DONE` (flag-live-all-9-gl-flags-on), `_SUPERSEDED` (flag-lease-on-despite-engine), `_DESIGN` (h7-1
faro-rts — already a design placeholder). These carry no build action here.

---

## A. Migration-required (financial per §2 — NEW idempotent migration, owner-gated)

### A1 · 0243-a2-5 — foundation migrations not idempotent
- **Root cause:** `202606111050/55/56/57` create tables/indexes/policies without `IF NOT EXISTS` / `DO`
  guards. Re-running on a partially-applied DB errors.
- **Constraint:** these migrations are **already applied on prod → checksum-frozen; NEVER edit them**
  (memory: `never-edit-applied-migration-checksum-freeze`). A fix is a **NEW forward migration** that makes
  the objects idempotently-present (`CREATE TABLE IF NOT EXISTS` is moot once applied; the real value is a
  **fresh-DB-from-0001 CI guard** proving the chain replays cleanly, plus wrapping the four originals'
  intent in guarded re-assert blocks only where CI actually fails).
- **Remediation:** (1) reproduce a fresh-DB `db:migrate` from 0001 on a throwaway Postgres, capture the
  exact failure; (2) author a new idempotent migration `>` main's max that `DO $$ ... IF NOT EXISTS`-guards
  only the objects CI chokes on; (3) add `verify-migration-chain-replays-fresh.mjs` if not already covered
  by `verify:no-unledgered-migrations` / `verify:migration-chain-runbook`.
- **Acceptance:** fresh-DB CI replay green; new migration idempotent; guard wired. **Gate:** §2 — owner OK.

### A2 · 0243-b3-3 — fuel↔load G18 FK hard-delete gap
- **Root cause:** `fuel_transactions.load_id` is `ON DELETE SET NULL`; latent today (loads are
  void-not-delete) but a future load hard-delete would silently orphan the G18 fuel↔load linkage.
- **Remediation:** when/if a load hard-delete path is added, switch the FK to `ON DELETE RESTRICT` (new
  migration) and add `verify-fuel-load-fk-restrict.mjs`. Until then: a guard asserting **no hard-delete of
  `mdata.loads` exists in code** (void-only) closes it cheaply without a migration.
- **Acceptance:** FK is RESTRICT OR a code guard proves no loads hard-delete path. **Gate:** §2 if migration.
- **UNVERIFIED — needs prod check:** confirm current `fuel_transactions.load_id` FK action on prod.

### A3 · 0243-g6-2 — vendor create has no name dedup
- **Root cause:** `mdata/vendors` POST has no name-based dedup guard (customers have
  `assertUniqueCustomerFields`, vendors don't) → duplicate AP vendors.
- **Remediation (two parts):** (a) app-level `assertUniqueVendorFields` — case-insensitive
  `lower(trim(vendor_name))`, **entity-scoped by `operating_company_id`**, TOCTOU-safe; (b) a **partial
  UNIQUE index** migration `CREATE UNIQUE INDEX IF NOT EXISTS ... ON mdata.vendors (operating_company_id,
  lower(trim(vendor_name))) WHERE deactivated_at IS NULL`. Both touch `mdata.*` → financial.
- **Acceptance:** duplicate insert rejected at app + DB; guard `verify-vendor-dedup.mjs`. **Gate:** §1.3/§2.

### A4 · 0243-g6-3 — customer dedup case-sensitive, unscoped, TOCTOU
- **Root cause:** dedup checks `WHERE customer_name=$1` — case/whitespace-sensitive, **no
  `operating_company_id` filter**, and a read-then-insert race.
- **Remediation:** `lower(trim())` compare + `operating_company_id` filter + partial UNIQUE index migration
  (mirror A3). Pair A3+A4 into ONE migration + one guard.
- **Acceptance:** as A3. **Gate:** §1.3/§2.

### A5 · 0243-g10-h1 — load_stops DELETE grant + CASCADE wipes legal evidence
- **Root cause:** `0034` still `GRANT DELETE ON mdata.load_stops` (loads itself has none); 8 CASCADE children
  include `pod_documents` / `detention_evidence` → a stray DELETE CASCADE-wipes **legal evidence**.
- **Remediation:** gated migration `REVOKE DELETE ON mdata.load_stops FROM ih35_app;` + convert the
  evidence-bearing CASCADE children to `ON DELETE RESTRICT`. GRANT/REVOKE + FK change = financial cluster.
- **Acceptance:** grant absent on prod; RESTRICT on evidence children; `verify-load-stops-no-delete.mjs`.
- **Gate:** §1.4 (GRANT change). **UNVERIFIED — needs prod check:** confirm current grants + FK actions.

### A6 · 0243-h5-1 — append-only spine unbounded growth
- **Root cause:** `outbox.events`, `audit.row_changes`, `event_log` are append-only with zero
  retention/rolloff → monotonic Neon storage/cost growth on the highest-write tables.
- **Remediation (design, careful):** monthly **range partition** + a maintenance cron, OR scheduled
  `pg_dump`-to-R2-then-`DETACH` past the 7-yr WORM window; a size tripwire in the checksum job. Must
  preserve **append-only/WORM** guarantees (never `UPDATE`/`DELETE` audit rows) — partitioning by range is
  compatible; deletion is not. This is a schema + retention-policy change → owner + likely CPA-relevant.
- **Acceptance:** partition scheme live; retention job registered; WORM guard still green. **Gate:** §1.4/§2.

### A7 · 0243-h6-2 — cash-advance display-id no lock, no unique
- **Root cause:** `cash-advances/display-id.ts` computes `MAX+1` with no advisory lock and no UNIQUE
  constraint on `driver_advances.display_id` → two concurrent creates mint the same `CA-YYYY-NNNN`.
- **Remediation:** wrap the read+mint in `pg_advisory_xact_lock(hashtext('cash_advance_display_id:'||
  operating_company_id))` + add `UNIQUE(operating_company_id, display_id)` migration. Cash-advance =
  financial.
- **Acceptance:** concurrent create test yields distinct ids; UNIQUE on prod; guard. **Gate:** §1.4.

---

## B. Financial engine / GL / posting / settlement (design only — never solo, §1.4)

### B1 · 0243-b1-2 — stale `factor_reserve_default` Liability fallback
- **Root cause:** `factor_reserve_default` role still typed Liability fallback despite
  `factor_reserve_held` (Asset) being canonical → mis-classes the factoring reserve.
- **Remediation:** remove `factor_reserve_default` from `COA_ROLE_VALUES`/`ROLE_FALLBACKS` **or** repoint
  its fallback to Asset. Touches the CoA role map → financial. Confirm against the locked
  factoring-as-secured-borrowing + reserve-as-Asset decisions (skill `ih35-accounting-decisions`).
- **Acceptance:** role map has no Liability fallback for the reserve; `verify:factoring-treatment` green.
  **Gate:** §1.4.

### B2 · 0243-c1-1 + 0243-e1-4 — parallel settlement engines (payroll.* vs driver_finance.* vs settlement.*)
- **Root cause:** load-linkage/deduction-stamping work landed in an **orphaned `payroll.*` engine nothing
  calls**, coexisting with the canonical `driver_finance.*` and an early `settlement.*` prototype over the
  same driver pay. Owner decision (§10 canonical map): **`driver_finance.*` is canonical; `payroll.*` /
  `settlement.*` are RETIRE (read-only during retirement, never a new write/FK).**
- **Remediation:** formally bridge/retire — either collapse to `driver_finance.*` or gate `payroll.*` behind
  a shadow-run until evidence is reviewed, **before** `SETTLEMENT_GL_POSTING_ENABLED` relies on load-linkage
  data. NO new writes/FKs to the RETIRE tables (G4 guard). Design + owner review of shadow-run evidence.
- **Acceptance:** one authoritative engine wired to posting; RETIRE tables read-only; canonical-writes guard
  green. **Gate:** §1.4 (settlement/GL). Combine c1-1 + e1-4 into one remediation.

### B3 · 0243-g9-h1 — settlement double-pay race
- **Root cause:** `queuePayment`/`markPaidManually`/`markCleared` read-then-`UPDATE` with no
  `payment_state=<current>` in the WHERE and no `FOR UPDATE` → concurrent calls can double-pay a driver.
- **Remediation:** compare-and-swap — `... SET payment_state=$next WHERE id=$1 AND payment_state=$current`
  (assert 1 row affected) OR `SELECT ... FOR UPDATE` around each transition. Money-moving → financial.
- **Acceptance:** concurrent-transition test pays once; guard `verify-settlement-cas.mjs`. **Gate:** §1.4.

### B4 · 0243-g11-2 — two deduction subledgers don't reconcile
- **Root cause:** `settlement_lines` (dollars) and `driver_settlement_deductions` (cents) are independent;
  order-dependent overpay, and `abandonment_chargeback` lines have no deductions row → FIN-18
  `SETTLEMENT_TOTALS_*` assertion fires.
- **Remediation:** collapse to ONE authoritative sub-ledger (per `0008-b`) so the assertion can't fire,
  rather than merely detecting the mismatch. Unify unit (cents) and source. Financial engine.
- **Acceptance:** single sub-ledger; FIN-18 tie-out green on live. **Gate:** §1.4. STOP-GATE per manifest.

### B5 · 0243-g11-10 — month-close checklist unsatisfiable
- **Root cause:** `can_lock` requires `arOverdueCount==0 AND apOverdueCount==0`; a factoring carrier with
  slow-pay customers **always** has overdue A/R → period close is never reachable through the UI.
- **Remediation:** change the gate from "zero overdue" to a **reviewed/acknowledged sign-off** (owner/admin
  acknowledges the overdue list, close proceeds with the acknowledgement recorded). Accounting-period logic
  → financial. Confirm against locked twice-daily-recon + period-close decisions.
- **Acceptance:** close reachable with acknowledged overdue; audit records the sign-off; guard. **Gate:** §1.4.

### B6 · 0243-h6-1 — QBO refresh-token race
- **Root cause:** `refreshAccessToken` has no lock; hourly cron, 15-min watchdog, per-minute sync runner,
  and request-path refresh can all race the same connection → Intuit invalidates the token.
- **Remediation:** `pg_advisory_xact_lock(hashtext('qbo_refresh:'||connection_id))` (or in-process
  single-flight) around read+refresh+write. Touches QBO connection state; db_touch. STOP-GATE.
- **Acceptance:** concurrent-refresh test single-flights; guard `verify-qbo-refresh-lock.mjs`. **Gate:** §1.3/§1.4.

---

## C. Authorization / entity-scope on financial routes (design — money routes, §1.4-adjacent)

### C1 · 0243-g1-3 — settlement/cash-advance approval handlers no membership assertion
- **Root cause:** `settlements/approval`, `settlement-dispute` review/resolve, `cash-advance` approve take a
  client `operating_company_id` in bare `withCurrentUser`, **no membership assertion** → an authenticated
  user can approve money movements for another company.
- **Remediation:** route through `withCompanyScope`/`assertCompanyMembership` like `bills.routes.ts`. Pure
  authorization hardening (no GL math), but these are **money-approval routes** → treat as financial-gated.
- **Acceptance:** cross-company approval rejected; guard `verify-settlement-routes-membership.mjs`. **Gate:** §1.4.

### C2 · 0243-g2-2 — operating_company_id trusted raw as tenant scope
- **Root cause:** `operating_company_id` trusted raw across settlements/dispatch/alerts routes — the
  authorization gap behind the cross-entity-leak class.
- **Remediation:** apply `z.string().uuid()` + `resolveOperatingCompanyId(with membership)` across
  `settlements/*`, `driver-finance/*`, `dispatch/loads.routes.ts`, `alerts/*`. The `dispatch/alerts` subset
  is arguably non-financial and could ship first behind a guard; the `settlements/*` + `driver-finance/*`
  subset is financial-gated. Recommend splitting: **non-financial routes → build now behind
  `verify-raw-opco-scope.mjs`; financial routes → this doc.**
- **Acceptance:** raw opco rejected; membership resolved; guard. **Gate:** §1.4 for the finance subset.

---

## D. Canonical schema / stranded tables (design — cross-ref existing canonicalization blocks)

### D1 · 0243-e1-3 — two scheduled-report engines
- `reports.scheduled_reports` (0058) and `reporting.scheduled_reports` (0164) both live — a report scheduled
  in one is invisible to the other. **Cross-ref `0008-g2-reporting-schema-canonical`** — pick the canonical
  schema, view-alias/retire the other. Owner decision open (§10 lists `reporting.*` lockdown-vs-guard as
  undecided). **Gate:** §2 (schema).

### D2 · 0243-e1-6 — bank/geo schema stranded
- `bank.reconciliation_matches` and `geo.*` stranded next to canonical `banking.*` / `geofence.*`. **First
  step is investigation, not a migration:** confirm via migration history + prod whether these were dropped,
  view-aliased, or are orphan tables with no code path. **UNVERIFIED — needs prod check.** If orphaned →
  archive per void-not-delete; if live-divergent → canonicalize to `banking.*`/`geofence.*`. **Gate:** §2.

---

## E. Money-path state-machine / write-path (design — mdata writes, §1.3)

### E1 · 0243-g9-h4 — load-status advisory not enforced
- Driver-PWA arrival can set `status='at_pickup'` with no state-machine check, resurrecting a cancelled load.
  Funnel driver-pwa arrival/departure status writes through the guarded `load-state-machine` helper. Writes
  `mdata.loads` → §1.3. Guard `verify-pwa-status-through-state-machine.mjs`.

### E2 · 0243-b3-1 — legacy WO-create endpoint mints non-canonical numbers
- A second, older `POST /api/v1/work-orders` hardcodes `source_type='IS'` and mints a non-canonical WO
  number. **Additive-only (§7): 410-Gone the legacy route or delegate it** to `wo-number.service.ts` + the
  7-type enum — do NOT delete. Writes `maintenance.work_orders`. Guard that the legacy path is disabled/
  delegated. **Gate:** §1.3 (borderline; WO create). **UNVERIFIED — needs prod check:** confirm the legacy
  route still registered.

### E3 · 0243-g9-m — eight workflow status defects (bundle)
- Re-verify + fix individually: auto-pay cron statuses (`auto-pay.cron.ts:34`), load-number `MAX+1` 500 under
  concurrency (advisory lock, `load-id-reservation.service.ts:54`), unguarded bulk `set_status`
  (`invoices-bulk.routes.ts:64`), load-cancel min-role (`cancellation.routes.ts:46`), void-WO startable,
  driver-archive one-way, status accretion. Mixed financial (auto-pay/invoices) + non-financial (min-role,
  concurrency). Split at build time; the auto-pay/invoices items are financial-gated.

### E4 · 0243-g10-m — seven integrity/reliability gaps (bundle)
- HMAC/anchor the audit hash chain (currently unsigned SHA-256), `audit.row_changes` mutation-block trigger,
  standardize stop archive/re-key (POD lookup), scope the qbo-sync 401 swallow, Twilio idempotency key,
  durable notifications, preflight. Audit-chain + qbo-sync = financial-adjacent; several are non-financial
  (Twilio idempotency, durable notifications) and could ship first behind guards. Split at build time.

---

## F. Security / dependencies / performance (design — dep bumps need §1.3 owner OK)

- **0243-h1-3** — CSP still report-only; `render.yaml` has no `healthCheckPath` (TCP-only gate); preDeploy
  runs `IH35_TEST_AUTH_BYPASS=1` against prod DB. Remediation: flip CSP enforce (after verifying no resource
  breakage), add `healthCheckPath=/api/v1/healthz/shallow`, hard-gate auth-bypass to `NODE_ENV!=='production'`
  **in code**. `render.yaml` + prod-behavior → owner-gated.
- **0243-g3-5** — CSP enforce-flip never happened; Samsara webhook placeholder HMAC; some routes echo caught
  `.message`. The error-echo scrub is non-financial and small; CSP flip is prod-behavior. Split.
- **0243-g5-2** — `createDriverWithQboVendor`/`createUnitWithQboClass` hold a pooled DB connection across an
  awaited QBO HTTP call inside `withCurrentUser` → pool exhaustion. Move the QBO fetch **outside** the tx.
  Touches driver/unit create (mdata write) → §1.3. **Re-verify: may already be fixed.**
- **0243-g5-4** — `refreshDeadheadCache` N+1 (units×weeks), lane-profitability/qbo-alert per-row insert,
  `SELECT *` on wide accounting tables. Perf; reads accounting → gated. **Re-verify current state first.**
- **0243-h2-1** — `xlsx 0.18.5` (prototype-pollution + ReDoS) on upload parsers. Move parse paths to
  `exceljs` (already in tree) or patched SheetJS 0.20.2+. **Runtime dep bump → §1.3 owner OK.**
- **0243-h2-2** — stale `apps/backend/package-lock.json` (2 unshipped HIGH CVEs; Render never builds from it).
  Regenerate/delete. Dep hygiene → §1.3.
- **0243-h2-3** — Lucia 3.2.2 sunset (Mar 2025). Plan an in-house session layer reusing Arctic/Oslo (already
  in tree). Large auth migration → design + owner.
- **0243-h5-3** — no R2-evidence presence check (silent dangling pointer on purge); restore drill SKIPs
  without `NEON_API_KEY`; checksum covers only 3 tables; 7-day presigned links too long. Nightly R2 reconcile
  + expand checksum to money/evidence/audit tables + shorten presigned links + confirm bucket WORM. Infra +
  db_touch → gated.
- **0243-h7-2** — vendor runtime hygiene: Plaid dead `development` branch, QBO health probe `minorversion=65`
  (bump to 75), Node 22 EOL Apr-2027, root-vs-frontend TS major mismatch (5 vs 6). The `minorversion` bump +
  Plaid dead-branch removal are small and **non-financial-buildable next**; TS/Node are roadmap.
- **0243-d1-3** — inline New-Customer/New-Vendor drawers collect ~8 fields but the create payload accepts only
  4; the rest silently discarded. Wiring the dropped fields through changes the `mdata.customers`/`vendors`
  create payload → §1.3. Diff form fields vs payload, forward the rest.

---

## Recommended build order (owner-gated)
1. **Pair A3+A4** (vendor/customer dedup) — one migration + one guard; high dup-risk, self-contained.
2. **A7 / B3 / B6 / A5** — concurrency + evidence-grant safety (double-pay, display-id, QBO token, load_stops).
3. **B2 (c1-1+e1-4)** settlement-engine collapse — precondition for enabling settlement GL posting.
4. **B4 / B5** deduction sub-ledger + month-close gate — unblock period close + FIN-18.
5. **C1/C2 finance subset** authz hardening.
6. **F dep/security** (h2-1/h2-2/h2-3) — each a §1.3 dep-bump conversation.
7. **A1/A6/D/E/F-infra** — larger schema/retention/canonicalization efforts.

> Split non-financial sub-items out of the E3/E4/G2-2/G3-5 bundles and ship them behind guards without the
> owner gate; keep the financial legs here.
