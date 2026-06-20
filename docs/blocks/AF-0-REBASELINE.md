# AF-0 — Accounting state re-baseline (read-only truth pass)

**Block:** AUTO-19 (LANE D · ACCOUNTING read-only — docs only, no code)
**Tracker:** AF-0 (row 1117)
**Date:** 2026-06-18
**Author:** auto-run (unattended). The financial blocks (not in this run) build on this when Jorge is back.

> **Integrity note (why some numbers say GATED).** Per CLAUDE.md §1.5, direct prod Neon access — web
> console *or* psql, **even read-only SELECTs** — is not a standing capability and must be approved per
> connection. This unattended run did **not** have that approval, so every count that requires a prod
> query is left as **GATED — not measured**, with the exact SQL to run. **No accounting count in this
> doc is estimated or fabricated.** What *is* stated as fact below comes only from non-gated sources:
> the public health endpoints and the committed `db/migrations/` (schema truth).

---

## 1. Deploy / platform snapshot (live, non-gated — public health endpoints)
- **Backend version deployed:** `fa5ea4b` (from `/api/v1/healthz/shallow`), catching up to `main` as
  merges land. `ok: true`.
- **Deep health `/api/v1/healthz`:** `ok: true`. Critical checks green — `postgres.select1`,
  `migrations.ledger`, `redis.ping`, plus R2/storage checks. The backend boots only if every
  `db/migrations/*.sql` is recorded in the ledger, so green here means the migration ledger is complete.
- **Migration files in repo:** **484** (`db/migrations/*.sql`).

## 2. Accounting schema truth (non-gated — from `db/migrations/`)
The accounting ledger lives in **`accounting.*`** (never `finance.*`). Posting model and key tables
present in migrations:
- **Journal / posting:** `accounting.journal_entries`, `accounting.journal_entry_postings`,
  `accounting.posting_batches`, `accounting.outbox_events`.
- **AR:** `accounting.invoices`, `accounting.invoice_lines`, `accounting.payments`,
  `accounting.payment_applications`, `accounting.credit_memos`, `accounting.ar_collection_tasks` /
  `ar_collection_contacts`, `accounting.customer_classifications`.
- **AP / expense:** `accounting.bills`, `accounting.bill_lines`, `accounting.bill_payments`,
  `accounting.bill_unit_allocation`, `accounting.expenses`, `accounting.expense_lines`,
  `accounting.expense_category_account_map` (Block-21 category→GL resolver),
  `accounting.line_category_load_required`.
- **Periods / basis:** `accounting.periods` (close logic added in `0183`),
  `accounting.period_cash_basis_snapshot` (closed-period cash-basis snapshot, read-only after close).
- **COA / roles:** `accounting.chart_of_accounts_roles`, `accounting.coa_account`.
- **Escrow / factoring / forecast:** `accounting.escrow_accounts` / `escrow_postings`,
  `accounting.factoring_advances`, `accounting.cash_flow_adjustments`, `accounting.cash_forecast_settings`,
  `accounting.banking_rules`, `accounting.recurring_bill_templates` / `recurring_bill_generation_log`.
- **QBO mirrors:** `accounting.qbo_accounts` / `qbo_customers` / `qbo_vendors` / `qbo_remote_counts` /
  `qbo_remote_count_collection_state`. **Product/service:** `accounting.ps_item` / `ps_category` /
  `pse_posting_policy`.

**Ledger map (from project memory, confirm before posting work):** `catalogs.accounts` is THE
entity-scoped posting ledger (UUIDv7 PKs, `security_invoker` views, `operating_company_id` RLS),
**not** a global CoA. `mdata.qbo_accounts` / `accounting.coa_account` are QBO mirrors; the bridge is
`qbo_account_id` within the same entity. The posting engine reads `accounting.expense_lines`
(`expense_account_uuid`), not the expense header. `catalogs.accounts` was created in `0010`.

## 3. Entities / COA role bindings (from constitution + memory — confirm counts gated)
- **TRANSP** — operating carrier, **active**. `operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`.
  Books are **cash basis** (LOCKED: posting is cash-primary, credit bank; AP is the rare accrual
  exception).
- **TRK** — asset holder (owns units/equipment); not the operating carrier.
- **USMCA** — future carrier, **hidden until July 2026 launch**.
- **COA partition model:** Multi-entity COA **Path B** approved (entity-partition `catalogs.accounts`).
  Per-entity account/role binding counts are **GATED** below.

## 4. Known open items / anomalies (from project memory — to reconcile in the financial blocks)
- **P1 commingling logged rows 880 / 881** — recorded under the multi-entity COA Path-B work; the
  ledger was near-empty so de-commingling is safe to do at re-baseline. Confirm these rows' current
  disposition.
- **Tracker anomaly rows 883 / 884** — referenced by the AF-0 task as open anomalies; their specific
  content was **not** independently confirmable from non-gated sources in this run. **Action:** read the
  exact tracker entries 883/884 in `docs/trackers/` and fold their disposition in here (do not assume).
- **GAP-EXPENSES Phase 2 (GL posting) is HELD** — step 1 is reconciling the merged-but-superseded doc
  to the 6 locked decisions and the `catalogs.accounts ↔ coa_account` drift. Never self-merge Phase 2.
- **Expense GL basis LOCKED** — TRANSP cash basis (books + MOR); posting cash-primary.

## 5. GATED live counts — run with Jorge's per-connection approval (§1.5), then fill in
> Set tenant scope first or counts lie: `SET app.operating_company_id = '<entity uuid>';` before any
> `accounting`/`catalogs` read. None of these are measured yet.

| Metric | Query (read-only) | Value |
|---|---|---|
| Journal posting rows | `SELECT count(*) FROM accounting.journal_entry_postings;` | **GATED** |
| Journal entries | `SELECT count(*) FROM accounting.journal_entries;` | **GATED** |
| Periods seeded / status | `SELECT period_start, period_end, status FROM accounting.periods ORDER BY period_start;` | **GATED** |
| COA accounts per entity | `SELECT operating_company_id, count(*) FROM catalogs.accounts WHERE is_active GROUP BY 1;` | **GATED** |
| COA role bindings per entity | `SELECT operating_company_id, role, count(*) FROM accounting.chart_of_accounts_roles GROUP BY 1,2;` | **GATED** |
| Uncategorized expense mappings | `SELECT count(*) FROM accounting.expense_lines WHERE expense_account_uuid IS NULL;` | **GATED** |
| Unmapped category→GL | `SELECT count(*) FROM accounting.expense_category_account_map WHERE account_id IS NULL;` | **GATED** |
| Bills / invoices / payments totals | `SELECT 'bills', count(*) FROM accounting.bills UNION ALL SELECT 'invoices', count(*) FROM accounting.invoices UNION ALL SELECT 'payments', count(*) FROM accounting.payments;` | **GATED** |
| Commingling rows 880/881 state | (locate by the multi-entity Path-B reference; confirm disposition) | **GATED** |

## 6. Acceptance
- Docs-only snapshot — **no code**, no migration, no prod write.
- All facts stated come from non-gated sources (public health + committed migrations + locked memory);
  every prod-measured count is explicitly **GATED** with the exact SQL, not estimated.
- Hand-off: when Jorge authorizes a read connection, fill §5 and reconcile §4 (esp. tracker rows
  883/884 and commingling rows 880/881) before any financial block proceeds.
