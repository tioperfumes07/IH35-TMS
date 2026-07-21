# NEEDS-PROD → Neon prod verdicts — 2026-07-21

**Method:** Live READ-ONLY reads against Neon project `tiny-field-89581227`, prod branch `br-fancy-credit-akjnd07a`, db `neondb`, via MCP `run_sql_transaction`. Every batch ran `SELECT set_config('app.bypass_rls','lucia',true)` as the FIRST statement in the same transaction (FORCED-RLS false-empty law). No writes, no merges. Read at ~2026-07-21 22:55 UTC.

**Entity map (org.companies):**

| code | id | legal_name | is_active |
|---|---|---|---|
| TRANSP | 91e0bf0a-133f-4ce8-a734-2586cfa66d96 | IH 35 Transportation LLC | true |
| TRK | b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e | IH 35 Trucking LLC | true |
| USMCA | 5c854333-6ea5-4faa-af31-67cb272fef80 | USMCA Freight Solutions Inc | true |

**Schema facts established first (to_regclass):** `banking.bank_accounts`, `banking.bank_transactions`, `banking.reconciliation_sessions`, `lib.feature_flags`, `lib.feature_flag_overrides`, all six escrow tables + `driver_finance.escrow_ledger` exist. `banking.plaid_items` does NOT exist (`to_regclass` = NULL) — Plaid connection state lives on `banking.bank_accounts.sync_status`, exactly as the backlog-verify repo pass concluded. Distinct `sync_status` values on prod: only `active` and `disconnected` (no `error` / `needs_reauth` value present in data).

---

## 1. 0010-f15-plaid-amex-wf-error-status — VERDICT: **STALE**

**Question (docs/trackers/backlog-verify/banking.md:36):** Live `sync_status` for AmEx / Wells Fargo institutions cannot be confirmed from repo; needs a prod read. Original claim: Plaid AmEx/WF connections in error status.

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT ba.id, c.code AS entity, ba.institution_name, ba.account_name, ba.account_mask,
       ba.sync_status, ba.last_synced_at, ba.is_active,
       (ba.plaid_item_id IS NOT NULL) AS has_plaid_item,
       (ba.plaid_access_token IS NOT NULL) AS has_plaid_token
FROM banking.bank_accounts ba
JOIN org.companies c ON c.id = ba.operating_company_id
ORDER BY c.code, ba.institution_name, ba.account_name;
```

**Raw result (17 rows, summarized — full detail identical for each WF account):**

| entity | institution | account (mask) | sync_status | last_synced_at | is_active | token |
|---|---|---|---|---|---|---|
| TRANSP | American Express | Business Platinum (5007) | **active** | 2026-07-21T07:00:10Z | true | yes |
| TRANSP | Wells Fargo | 3500 / 6103 / 6129 / 6137 (4 accts) | **active** | 2026-07-21T07:00:42Z | true | yes |
| TRANSP | (none) | Relay Fuel Wallet | active | null | true | no (non-Plaid) |
| TRK | Wells Fargo | 3500 / 6103 / 6129 / 6137 (4 accts) | **active** | 2026-07-21T07:01:27Z | true | yes |
| TRK | Wells Fargo | same 4 masks, superseded rows | disconnected | null | **false** | no |
| USMCA | Bank of America | USMCA FREIGHT (3224) | **active** | 2026-07-21T07:00:01Z | true | yes |
| USMCA | Bank of America | same mask, superseded row | disconnected | 2026-06-30 | **false** | no |

**Verdict: STALE.** The claimed AmEx/WF error state does not exist on prod today. Every ACTIVE Plaid-linked account (AmEx 5007, all 4 TRANSP WF, all 4 TRK WF, USMCA BofA) is `sync_status='active'` with `last_synced_at` this morning (2026-07-21 07:00–07:01 UTC — the daily sync cron ran and succeeded). The only `disconnected` rows are `is_active=false` superseded/reconnect-artifact rows with no access token, which the UI/aggregation excludes. Connections are healthy; the error finding is resolved-by-time.

---

## 2. 0473-2-7-bank-transactions-uncategorized-plaid — VERDICT: **GAP-CONFIRMED** (operational backlog, not a code gap)

**Question (banking.md:37):** Do uncategorized Plaid-sourced `bank_transactions` currently exist in prod? (Placeholder record; categorization infra confirmed wired in code.)

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT c.code AS entity, bt.status, bt.source, COUNT(*) AS n,
       MIN(bt.transaction_date) AS min_date, MAX(bt.transaction_date) AS max_date
FROM banking.bank_transactions bt JOIN org.companies c ON c.id = bt.operating_company_id
GROUP BY c.code, bt.status, bt.source ORDER BY c.code, bt.status, bt.source;
-- Note: a probe on status='uncategorized' returned 0 rows — the live status value is 'pending_categorization'.
SELECT c.code, COUNT(*) FILTER (WHERE bt.status='pending_categorization' AND bt.plaid_transaction_id IS NOT NULL) AS uncategorized_plaid ...
```

**Raw result:**

| entity | status | source | n | date range |
|---|---|---|---|---|
| TRANSP | categorized | plaid | 1 | 2026-07-11 |
| TRANSP | pending_categorization | csv_import | 1,607 | 2026-03-03 → 2026-07-20 |
| TRANSP | pending_categorization | plaid | 3,991 | 2026-02-14 → 2026-07-20 |
| TRK | pending_categorization | plaid | 4,695 | 2025-07-03 → 2026-07-20 |
| USMCA | categorized | plaid | 2 | 2025-12 |
| USMCA | pending_categorization | plaid | 131 | 2025-12-12 → 2026-07-17 |

Uncategorized **Plaid-sourced**: TRANSP 3,991 + TRK 4,695 + USMCA 131 = **8,817**. Review-state cross-check: 10,424 rows `review_state='for_review'` + `status='pending_categorization'`; only 3 rows are `matched/categorized` in the entire table.

**Verdict: GAP-CONFIRMED.** 8,817 Plaid transactions (through 2026-07-20) sit uncategorized on prod. The pipeline ingests correctly; the categorization/review work itself has essentially not been done (3 categorized rows total, ever). This is a live operational/data backlog, not a wiring defect.

---

## 3. 0518-r09-plaid-amex-wf-error — VERDICT: **STALE** (dedupe of item 1)

**Question (banking.md:38):** Live status of `banking.bank_accounts.sync_status` for the AmEx and Wells Fargo rows.

**SQL + raw result:** identical query and rows as item 1 (single prod read serves the whole family).

**Verdict: STALE.** Same evidence as item 1 — AmEx 5007 and all WF accounts `sync_status='active'`, synced 2026-07-21 07:00 UTC. No ERROR state exists.

---

## 4. 0519-bk1-plaid-amex-wf-error — VERDICT: **STALE** (dedupe of item 1)

**Question (banking.md:39):** Same family — live sync_status for AmEx + Wells Fargo; record also notes status lives on `banking.bank_accounts.sync_status`, not a `banking.plaid_items` table.

**SQL + raw result:** same as item 1. Additionally confirmed `to_regclass('banking.plaid_items')` = NULL (table does not exist), so the record's schema-location note is correct.

**Verdict: STALE.** Connections healthy; claimed error state absent on prod.

---

## 5. 0519-fl1-2649-bank-tx-uncategorized_DISPATCH — VERDICT: **GAP-CONFIRMED** (backlog real; the 2,649 figure itself is stale — actual is 10,424)

**Question (banking.md:40):** The "2,649 uncategorized bank transactions" claim; a live count of uncategorized `banking.bank_transactions` is required to close it.

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT c.code AS entity, COUNT(*) AS total_tx,
       COUNT(*) FILTER (WHERE bt.status='pending_categorization') AS uncategorized,
       COUNT(*) FILTER (WHERE bt.status='pending_categorization' AND bt.plaid_transaction_id IS NOT NULL) AS uncategorized_plaid
FROM banking.bank_transactions bt JOIN org.companies c ON c.id = bt.operating_company_id
GROUP BY c.code ORDER BY c.code;
```

**Raw result:**

| entity | total_tx | uncategorized | uncategorized_plaid |
|---|---|---|---|
| TRANSP | 5,599 | 5,598 | 3,991 |
| TRK | 4,695 | 4,695 | 4,695 |
| USMCA | 133 | 131 | 131 |
| **TOTAL** | **10,427** | **10,424** | 8,817 |

**Verdict: GAP-CONFIRMED (count STALE).** The uncategorized backlog is real and has ~4x outgrown the original claim: **10,424** uncategorized bank transactions on prod (5,598 TRANSP incl. 1,607 CSV-imported; 4,695 TRK; 131 USMCA) vs the 2,649 claimed. Only 3 transactions in the entire table have ever been categorized. Any dispatch block scoped to "2,649" must be re-scoped to the live number.

---

## 6. CONN-1-plaid-reconcile-commit — VERDICT: **GAP-CONFIRMED** (built + wired, zero live usage)

**Question (banking.md:43 / BLOCK-RECONCILIATION line 101):** Routes (`/start,/match,/unmatch,/complete`) are wired in code; the claim "0 reconciliation sessions on TRANSP" is a live-usage fact only a prod read can settle. Do reconcile-commit rows exist?

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT COUNT(*) AS recon_sessions_total FROM banking.reconciliation_sessions;
SELECT c.code, rs.status, COUNT(*), MAX(rs.created_at), MAX(rs.finalized_at)
FROM banking.reconciliation_sessions rs JOIN org.companies c ON c.id = rs.operating_company_id
GROUP BY c.code, rs.status;
```

**Raw result:** `recon_sessions_total = 0`. The per-entity grouping returned **zero rows** (empty set) — with RLS bypass active in the same transaction, so this is a true zero, not a masked one. Corroborating: `banking.bank_transactions.reconciliation_session_id` cannot be populated with no sessions, and only 3 transactions are `matched` at all.

**Verdict: GAP-CONFIRMED.** `banking.reconciliation_sessions` has 0 rows for ALL entities (not just TRANSP). The reconcile-commit feature is fully built and mounted but has never been exercised in production — no session has ever been started, let alone completed/committed. This is a usage/adoption gap (and means the CHAIN-04-adjacent tie-out paths remain live-unproven), not a code gap.

---

## 7. banking-2-plaid-connections-error-state — VERDICT: **STALE** (dedupe of item 1)

**Question (banking.md:41):** Live sync_status for AmEx + Wells Fargo `bank_accounts` rows; panel/reconnect infra confirmed wired in code.

**SQL + raw result:** same read as item 1, plus `SELECT DISTINCT sync_status FROM banking.bank_accounts` → only two values exist on prod: `active`, `disconnected`. No row anywhere carries an error/needs_reauth status.

**Verdict: STALE.** No Plaid connection is in an error state on prod. All active connections synced 2026-07-21 07:00–07:01 UTC. The `disconnected` rows are exclusively deactivated (`is_active=false`) superseded rows without tokens — expected reconnect artifacts, not live errors.

---

## 8. 0007-pattern-5-split-brain-engines — VERDICT: **GAP-CONFIRMED (structural), with zero data divergence — both engines empty on prod**

**Question (accounting.md:104):** 6 escrow-related tables exist across two schemas (`accounting.escrow_accounts`, `accounting.escrow_postings`, `driver_finance.driver_escrow_separations`, `driver_finance.escrow_balances`, `driver_finance.escrow_deductions_pending`, +1); cannot determine from static code which duplicate tables are dead vs actively written. Requires live row-count / last-write-timestamp check.

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%escrow%';
SELECT 'accounting.escrow_accounts', COUNT(*), MAX(created_at), MAX(updated_at) FROM accounting.escrow_accounts
UNION ALL SELECT 'accounting.escrow_postings', COUNT(*), MAX(created_at), MAX(posted_at) FROM accounting.escrow_postings
UNION ALL SELECT 'driver_finance.driver_escrow_separations', COUNT(*), MAX(created_at), MAX(updated_at) FROM driver_finance.driver_escrow_separations
UNION ALL SELECT 'driver_finance.escrow_balances', COUNT(*), MAX(created_at), MAX(last_updated_at) FROM driver_finance.escrow_balances
UNION ALL SELECT 'driver_finance.escrow_deductions_pending', COUNT(*), MAX(created_at), MAX(updated_at) FROM driver_finance.escrow_deductions_pending
UNION ALL SELECT 'driver_finance.escrow_ledger', COUNT(*), MAX(created_at), NULL FROM driver_finance.escrow_ledger
UNION ALL SELECT 'catalogs.escrow_types', COUNT(*), MAX(created_at), MAX(updated_at) FROM catalogs.escrow_types;
```

**Raw result:** 7 escrow tables exist on prod (the 6 claimed + `driver_finance.escrow_ledger`; plus catalog `catalogs.escrow_types`).

| table | rows | last_created | last_write |
|---|---|---|---|
| accounting.escrow_accounts | **0** | – | – |
| accounting.escrow_postings | **0** | – | – |
| driver_finance.driver_escrow_separations | **0** | – | – |
| driver_finance.escrow_balances | **0** | – | – |
| driver_finance.escrow_deductions_pending | **0** | – | – |
| driver_finance.escrow_ledger | **0** | – | – |
| catalogs.escrow_types | 3 | 2026-05-13 | 2026-05-13 |

All zeros were read WITH `app.bypass_rls='lucia'` in-transaction — true zeros, not RLS masking.

**Verdict: GAP-CONFIRMED (structural) / no live divergence.** The split-brain SCHEMA exists on prod exactly as claimed — parallel escrow structures in `accounting.*` and `driver_finance.*` — but NEITHER engine has ever written a data row. There is no active split-brain writing and no data divergence to reconcile today; both engines are dormant (only the 3-row `catalogs.escrow_types` seed from 2026-05-13 exists). The correct fix window is NOW, before either engine takes live money: designate the canonical escrow store and retire/redirect the other **before** first live escrow posting. (Consistent with escrow-as-liability law.)

---

## 9. 0243-flag-live-all-9-gl-flags-on_DONE — VERDICT: **BUILT-LIVE** (all 9 GL posting flags ON for all 3 entities)

**Question (accounting.md:105):** The actual ON/OFF state of the 9 named GL posting flags per entity requires a live `lib.feature_flags` / `lib.feature_flag_overrides` read.

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
SELECT ff.flag_key, ff.default_enabled FROM lib.feature_flags ff ORDER BY ff.flag_key;
SELECT o.flag_key, COALESCE(c.code,'(user/global)') AS entity, o.enabled, o.set_at, o.expires_at
FROM lib.feature_flag_overrides o LEFT JOIN org.companies c ON c.id = o.operating_company_id
ORDER BY o.flag_key, entity;
```

**Raw result (GL posting flags; defaults all `false`, per-entity overrides below; no `expires_at` set on any):**

| flag_key | TRANSP | TRK | USMCA |
|---|---|---|---|
| GL_POSTING_ENABLED | ON (07-16) | ON (07-05) | ON (07-11) |
| BILL_GL_POSTING_ENABLED | ON (07-04) | ON (07-05) | ON (07-11) |
| BILL_PAYMENT_GL_POSTING_ENABLED | ON (07-04) | ON (07-05) | ON (07-11) |
| EXPENSE_GL_POSTING_ENABLED | ON (07-04) | ON (07-05) | ON (07-11) |
| INVOICE_AR_GL_POSTING_ENABLED | ON (07-04) | ON (07-04) | ON (07-11) |
| SETTLEMENT_GL_POSTING_ENABLED | ON (07-04) | ON (07-04) | ON (07-11) |
| FACTORING_GL_POSTING_ENABLED | ON (07-04) | ON (07-04) | ON (07-11) |
| LEASE_GL_POSTING_ENABLED | ON (07-04) | ON (07-05) | ON (07-11) |
| BANK_FEED_GL_POSTING_ENABLED | ON (07-04) | ON (07-05) | ON (07-11) |

Additional GL-family flags also ON ×3 entities: AMORTIZATION_GL_POSTING, BANK_TX_SPLIT_GL_POSTING, DRIVER_ADVANCE_GL_POSTING (07-15 ×3), TRANSFER_GL_POSTING, PROPERTY_TAX_GL_POSTING, CUSTOMER_PAYMENT_GL_POSTING. QBO write-back flags remain **OFF** everywhere: `QBO_ENTITY_PUSH_ENABLED=false ×3`, `QBO_JE_PUSH_ENABLED=false ×3`, `VOID_QBO_MIRROR_ENABLED=false ×3` — consistent with the no-TMS→QBO-write-back law.

**Verdict: BUILT-LIVE.** All 9 named GL posting flags carry `enabled=true` per-entity overrides for TRANSP, TRK, and USMCA on prod (flipped 2026-07-04 → 2026-07-16, no expiries). The `_DONE` suffix on the block id is confirmed accurate. QBO push stays OFF as required.

---

## 10. usmca-banking-ingestion-dedup — VERDICT: **BUILT-LIVE** (ingestion live, zero dup collisions; no CSV backfill exists for USMCA)

**Question (accounting.md:109):** Whether USMCA has live `banking.bank_accounts` rows, Plaid sync_status, any CSV-backfilled `banking.bank_transactions`, and whether cross-source `dedup_hash` collisions have actually been deduped for USMCA.

**SQL:**
```sql
SELECT set_config('app.bypass_rls','lucia',true);
-- accounts: see item 1 result (USMCA rows)
SELECT c.code, bt.source, COUNT(*), COUNT(bt.dedup_hash) AS with_dedup_hash, COUNT(bt.plaid_transaction_id) AS with_plaid_id
FROM banking.bank_transactions bt JOIN org.companies c ON c.id = bt.operating_company_id
WHERE c.code='USMCA' GROUP BY c.code, bt.source;
SELECT c.code, COUNT(*) AS dup_groups, SUM(n-1) AS excess_rows FROM (
  SELECT bt.operating_company_id, bt.dedup_hash, COUNT(*) AS n FROM banking.bank_transactions bt
  WHERE bt.dedup_hash IS NOT NULL GROUP BY 1,2 HAVING COUNT(*) > 1) d
JOIN org.companies c ON c.id = d.operating_company_id GROUP BY c.code;
SELECT COUNT(*) FROM (SELECT plaid_transaction_id FROM banking.bank_transactions bt
  JOIN org.companies c ON c.id=bt.operating_company_id
  WHERE c.code='USMCA' AND plaid_transaction_id IS NOT NULL
  GROUP BY 1 HAVING COUNT(*)>1) x;
```

**Raw result:**
- USMCA bank accounts: 1 ACTIVE Bank of America "USMCA FREIGHT" (mask 3224), `sync_status='active'`, token present, `last_synced_at=2026-07-21T07:00:01Z`; plus 1 superseded `is_active=false, disconnected` row for the same mask (last synced 2026-06-30) — a reconnect artifact, excluded from active surfaces.
- USMCA transactions: **133 rows, ALL `source='plaid'`**, 133/133 have `dedup_hash`, 133/133 have `plaid_transaction_id`. Zero `csv_import` rows for USMCA.
- Dedup collisions: the entity-scoped `dedup_hash` duplicate query returned **empty set for ALL entities** (0 dup groups anywhere, USMCA included). `plaid_transaction_id` duplicates for USMCA: **0**.
- org.companies: USMCA `is_active=true` (note for the adjacent `usmca-unhide-entity-switcher` item: prod contradicts the repo-era claim that USMCA is still `is_active=false`).

**Verdict: BUILT-LIVE.** USMCA banking ingestion is live and clean: one active Plaid-connected BofA account syncing daily, 133 transactions all Plaid-sourced with 100% dedup_hash coverage, and zero dedup_hash or plaid_transaction_id collisions. There is nothing cross-source to dedupe because no CSV backfill has ever been loaded for USMCA — if a CSV backfill is planned, the dedup path is in place but remains live-unexercised for USMCA specifically (it IS exercised on TRANSP, which holds 1,607 csv_import rows with zero collisions).

---

## Cross-cutting observations (not verdicts)

1. **Categorization backlog is the dominant live gap:** 10,424 of 10,427 bank transactions are uncategorized across all entities. Every downstream banking KPI, bank-feed GL posting (`BANK_FEED_GL_POSTING_ENABLED` is ON), and reconciliation depends on this work happening.
2. **Reconciliation has never been used:** 0 sessions ever, any entity.
3. **TRK/USMCA duplicate account-row pairs** (active + deactivated `disconnected` twin per mask) are reconnect artifacts; harmless now but worth a cleanup/visibility rule so aggregations never double-count if an inactive row is ever reactivated.
4. **USMCA `org.companies.is_active=true` on prod** — the repo-derived claim (in `usmca-unhide-entity-switcher`) that USMCA is still hidden via `is_active=false` is contradicted by prod; that adjacent item should be re-verified (prod wins).
