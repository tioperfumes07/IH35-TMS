# QBO Parity Evidence Precheck (TRANSP)

## 1) Scope & company context

- Company targeted: TRANSP (`IH 35 Transportation LLC`).
- Provided `operating_company_id` `4cfdfc32-5498-44ae-aced-75ccd9c51599` did not resolve to TRANSP in this DB.
- Resolved and used operating company id: `91e0bf0a-133f-4ce8-a734-2586cfa66d96` (`org.companies.code='TRANSP'`, `org.companies.legal_name='IH 35 Transportation LLC'`).
- QBO realm used: `123145885549599`.
- Precheck timestamp (UTC): `2026-05-17T23:33:40Z`.
- Data sources used:
  - `org.companies`
  - `qbo_archive.entities_snapshot`
  - `qbo_archive.transactions_snapshot`
  - `qbo_archive.attachments_snapshot`
  - `qbo_archive.import_batches`
  - `qbo_archive.import_batch_audit_log`

## 2) Mirror-side snapshot (IH35 DB)

Mirror table names queried: `qbo_archive.entities_snapshot`, `qbo_archive.transactions_snapshot`, `qbo_archive.attachments_snapshot`.

### Master data counts (nearest mirrored tables present)
- Account: `365`
- Customer: `1209`
- Vendor: `872`
- Item: `179`
- Class: `172`

### Transactions (only txn types present in mirror schema)
- Bill: `3028` rows, `2,605,903,268` cents
- BillPayment: `6046` rows, `2,479,891,134` cents
- Deposit: `1965` rows, `2,354,927,069` cents
- Invoice: `11772` rows, `3,967,381,679` cents
- JournalEntry: `1779` rows, `0` cents
- Payment: `23540` rows, `3,899,448,159` cents
- SalesReceipt: `2` rows, `66,800` cents
- Transfer: `4914` rows, `1,698,567,317` cents
- VendorCredit: `6` rows, `219,913` cents

Not present as distinct mirrored txn types in this snapshot set: Expense, Check, CreditCardCharge, CreditMemo, RefundReceipt.

### Attachments
- `qbo_archive.attachments_snapshot`: `0` distinct attachments for TRANSP.

### Banking-related mirrored transaction counts
- Banking-relevant txn types in `qbo_archive.transactions_snapshot`: Deposit (`1965`), Transfer (`4914`), Payment (`23540`), BillPayment (`6046`), VendorCredit (`6`), JournalEntry (`1779`).

## 3) Import-run / forensic evidence snapshot

Latest relevant TRANSP batch used for evidence:
- Batch id: `ba14f9bc-e907-4184-90bc-7c133ffe18ab`
- Realm: `123145885549599`
- Status: `partial`
- `entities_imported`: `0`
- `transactions_imported`: `40334`
- `attachments_imported`: `0`
- `errors_count`: `315`
- `completed_at`: `2026-05-17T13:42:34.054Z`

Per-entity/per-txn-type evidence available from audit log (`event_type='page_fetched'`, summed `records_processed`):
- Bill: `1000`
- Customer: `300`
- Invoice: `2400`
- Item: `51`
- Payment: `200`
- Transfer: `300`
- Vendor: `85`

What is missing in logs:
- No complete per-entity success manifest keyed by `qbo_id` for all entities/txn types.
- No importer-recorded per-txn-type amount totals.
- Incomplete per-type coverage (many mirror txn types have no per-type importer count entry).

## 4) Mirror vs import evidence reconciliation

| Entity | Importer count | Mirror count | Delta (mirror - importer) | Importer totals | Mirror totals |
|---|---:|---:|---:|---:|---:|
| Account | not logged | 365 | n/a | not logged | n/a |
| Bill | 1000 | 3028 | 2028 | not logged | 2,605,903,268 |
| BillPayment | not logged | 6046 | n/a | not logged | 2,479,891,134 |
| Class | not logged | 172 | n/a | not logged | n/a |
| Customer | 300 | 1209 | 909 | not logged | n/a |
| Deposit | not logged | 1965 | n/a | not logged | 2,354,927,069 |
| Invoice | 2400 | 11772 | 9372 | not logged | 3,967,381,679 |
| Item | 51 | 179 | 128 | not logged | n/a |
| JournalEntry | not logged | 1779 | n/a | not logged | 0 |
| Payment | 200 | 23540 | 23340 | not logged | 3,899,448,159 |
| SalesReceipt | not logged | 2 | n/a | not logged | 66,800 |
| Transfer | 300 | 4914 | 4614 | not logged | 1,698,567,317 |
| Vendor | 85 | 872 | 787 | not logged | n/a |
| VendorCredit | not logged | 6 | n/a | not logged | 219,913 |

Material mismatch flags:
- Importer evidence is partial/incomplete by type, so many entities have no importer count to reconcile.
- For entities with importer counts, mirror counts are materially higher (plausible causes: re-runs, dedupe behavior, cumulative mirror state across runs, partial-batch logs).
- Importer counters are internally inconsistent across tables/events (example from same batch: `transactions_imported=40334` vs `transactions_phase_completed records_processed=12718`).

## 5) Source-parity verdict

**NOT VERIFIED AGAINST SOURCE**.

Exact requirements to reach full source parity certification:
1. Live QBO source-side counts and amount totals per entity/txn type for realm `123145885549599`, scoped to TRANSP and aligned to the same import date window.
2. Record-level source export keyed by QBO id (`qbo_id`) per entity/txn type.
3. Deterministic mismatch list keyed by QBO id/entity id: source-only vs mirror-only vs mismatched totals/status.
4. Date-window alignment rules documented and applied consistently (same lower/upper bounds, timezone, and rerun handling).

## 6) Repro commands/queries

### Resolve company id
```sql
select id::text, code, legal_name
from org.companies
where id = '4cfdfc32-5498-44ae-aced-75ccd9c51599'::uuid
   or code ilike '%TRANSP%'
order by code;
```

### Mirror master-data counts
```sql
with latest_entities as (
  select qbo_entity_type, qbo_entity_id,
         row_number() over (partition by qbo_entity_type, qbo_entity_id order by snapshot_taken_at desc, created_at desc) as rn
  from qbo_archive.entities_snapshot
  where operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    and qbo_realm_id = '123145885549599'
)
select qbo_entity_type as entity_type, count(*)::bigint as mirror_count
from latest_entities
where rn = 1
group by qbo_entity_type
order by qbo_entity_type;
```

### Mirror transaction counts + totals
```sql
with latest_txns as (
  select qbo_txn_type, qbo_txn_id, total_cents,
         row_number() over (partition by qbo_txn_type, qbo_txn_id order by snapshot_taken_at desc, created_at desc) as rn
  from qbo_archive.transactions_snapshot
  where operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    and qbo_realm_id = '123145885549599'
)
select qbo_txn_type as txn_type,
       count(*)::bigint as mirror_count,
       coalesce(sum(total_cents),0)::bigint as mirror_total_cents
from latest_txns
where rn = 1
group by qbo_txn_type
order by qbo_txn_type;
```

### Attachments count
```sql
select count(distinct qbo_attachment_id)::bigint as attachment_count
from qbo_archive.attachments_snapshot
where operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid;
```

### Latest TRANSP import batches
```sql
select id::text as batch_id, operating_company_id::text, qbo_realm_id, status,
       entities_imported, transactions_imported, attachments_imported, errors_count,
       started_at, completed_at
from qbo_archive.import_batches
where operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
order by started_at desc
limit 10;
```

### Importer per-entity counts from audit logs
```sql
select entity_type, sum(records_processed)::bigint as importer_records_processed
from qbo_archive.import_batch_audit_log
where batch_id = 'ba14f9bc-e907-4184-90bc-7c133ffe18ab'::uuid
  and event_type = 'page_fetched'
group by entity_type
order by entity_type;
```

### Importer phase-level evidence (consistency check)
```sql
select event_type, entity_type, records_processed, occurred_at
from qbo_archive.import_batch_audit_log
where batch_id='ba14f9bc-e907-4184-90bc-7c133ffe18ab'::uuid
  and event_type in ('entities_phase_completed','transactions_phase_completed','entity_type_completed')
order by occurred_at;
```
