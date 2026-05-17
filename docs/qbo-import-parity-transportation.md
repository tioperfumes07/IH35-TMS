# QBO Import Parity-Evidence Precheck — IH 35 Transportation

Scope note: `operating_company_id` `4cfdfc32-5498-44ae-aced-75ccd9c51599` does **not** resolve to IH 35 Transportation LLC in this database.  
Resolved/used operating company: `91e0bf0a-133f-4ce8-a734-2586cfa66d96` (`code=TRANSP`, `legal_name=IH 35 Transportation LLC`).  
QBO realm used: `123145885549599`.

## 1) MIRROR SNAPSHOT (IH35 DB)

Mirror source tables used:
- `qbo_archive.entities_snapshot` for Account/Customer/Vendor/Item/Class.
- `qbo_archive.transactions_snapshot` for imported transaction entities and amount totals.

### Entity counts (Account, Class, Customer, Item, Vendor)

Query used:
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

Results:
- Account: `365`
- Class: `172`
- Customer: `1209`
- Item: `179`
- Vendor: `872`

### Transaction counts + amount totals

Query used:
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

Results:
- Bill: `3028` rows, `2,605,903,268` cents
- BillPayment: `6046` rows, `2,479,891,134` cents
- Deposit: `1965` rows, `2,354,927,069` cents
- Invoice: `11772` rows, `3,967,381,679` cents
- JournalEntry: `1779` rows, `0` cents
- Payment: `23540` rows, `3,899,448,159` cents
- SalesReceipt: `2` rows, `66,800` cents
- Transfer: `4914` rows, `1,698,567,317` cents
- VendorCredit: `6` rows, `219,913` cents

## 2) IMPORTER EVIDENCE SNAPSHOT

Importer evidence source set:
- `qbo_archive.import_batches`
- `qbo_archive.import_batch_audit_log`

Batch used for this precheck evidence: `ba14f9bc-e907-4184-90bc-7c133ffe18ab` (latest completed TRANSP batch for realm `123145885549599` at extraction time).

### Import batch summary (importer claim)

Query used:
```sql
select id::text as batch_id, status, entities_imported, transactions_imported, attachments_imported, errors_count, started_at, completed_at
from qbo_archive.import_batches
where id = 'ba14f9bc-e907-4184-90bc-7c133ffe18ab'::uuid;
```

Importer-recorded figures:
- status: `partial`
- entities_imported: `0`
- transactions_imported: `40334`
- attachments_imported: `0`
- errors_count: `315`

### Importer per-entity processed counts where explicitly logged

Query used:
```sql
select entity_type, sum(records_processed)::bigint as importer_records_processed
from qbo_archive.import_batch_audit_log
where batch_id = 'ba14f9bc-e907-4184-90bc-7c133ffe18ab'::uuid
  and event_type = 'page_fetched'
group by entity_type
order by entity_type;
```

Logged per-entity counts:
- Bill: `1000`
- Customer: `300`
- Invoice: `2400`
- Item: `51`
- Payment: `200`
- Transfer: `300`
- Vendor: `85`

Totals by transaction type are **not logged** in importer evidence tables for this batch (`import_batch_audit_log` has row counts, no per-type amount sums).

## 3) RECONCILIATION (#1 vs #2)

Reconciliation basis:
- Mirror side: `qbo_archive.entities_snapshot` + `qbo_archive.transactions_snapshot` (latest deduped mirror state for TRANSP/realm).
- Importer side: per-entity `page_fetched` counts from `qbo_archive.import_batch_audit_log` for batch `ba14f9bc-e907-4184-90bc-7c133ffe18ab`.

| Entity | Importer count | Mirror count | Delta (mirror-importer) | Importer total cents | Mirror total cents | Delta total cents |
|---|---:|---:|---:|---:|---:|---:|
| Account | not logged | 365 | n/a | not logged | n/a | n/a |
| Bill | 1000 | 3028 | 2028 | not logged | 2605903268 | n/a |
| BillPayment | not logged | 6046 | n/a | not logged | 2479891134 | n/a |
| Class | not logged | 172 | n/a | not logged | n/a | n/a |
| Customer | 300 | 1209 | 909 | not logged | n/a | n/a |
| Deposit | not logged | 1965 | n/a | not logged | 2354927069 | n/a |
| Invoice | 2400 | 11772 | 9372 | not logged | 3967381679 | n/a |
| Item | 51 | 179 | 128 | not logged | n/a | n/a |
| JournalEntry | not logged | 1779 | n/a | not logged | 0 | n/a |
| Payment | 200 | 23540 | 23340 | not logged | 3899448159 | n/a |
| SalesReceipt | not logged | 2 | n/a | not logged | 66800 | n/a |
| Transfer | 300 | 4914 | 4614 | not logged | 1698567317 | n/a |
| Vendor | 85 | 872 | 787 | not logged | n/a | n/a |
| VendorCredit | not logged | 6 | n/a | not logged | 219913 | n/a |

### Mismatch list (record-level)

Query used to inspect importer error-keyed IDs:
```sql
with error_ids as (
  select distinct metadata #>> '{context_json,last_qbo_entity_id}' as qbo_id
  from qbo_archive.import_batch_audit_log
  where batch_id='ba14f9bc-e907-4184-90bc-7c133ffe18ab'::uuid
    and event_type='forensic_import_error'
    and metadata #>> '{context_json,last_qbo_entity_id}' is not null
), presence as (
  select e.qbo_id,
         exists (
           select 1 from qbo_archive.transactions_snapshot t
           where t.operating_company_id='91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
             and t.qbo_realm_id='123145885549599'
             and t.qbo_txn_id=e.qbo_id
         ) as in_txn,
         exists (
           select 1 from qbo_archive.entities_snapshot s
           where s.operating_company_id='91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
             and s.qbo_realm_id='123145885549599'
             and s.qbo_entity_id=e.qbo_id
         ) as in_entity,
         exists (
           select 1 from qbo_archive.attachments_snapshot a
           where a.operating_company_id='91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
             and a.qbo_attachment_id=e.qbo_id
         ) as in_attachment
  from error_ids e
)
select
  count(*)::int as error_ids_total,
  count(*) filter (where not in_txn and not in_entity and not in_attachment)::int as error_ids_absent_everywhere,
  count(*) filter (where in_txn or in_entity or in_attachment)::int as error_ids_present_in_mirror
from presence;
```

Mismatch outcomes:
- Importer-reported IDs absent from mirror: **none observed** in this evidence slice (`0` of `209` error-keyed IDs absent; all 209 appear in mirror snapshots).
- Mirror IDs absent from importer per-record evidence: **not knowable from current logs**, because this importer evidence set does not provide a complete per-record success manifest keyed by `qbo_id`.

## 4) PARITY VERDICT

**NOT VERIFIED AGAINST SOURCE** — no live QBO source counts/totals were included in this run.

Internal-consistency result (`#1` vs `#2` in this precheck): **discrepancies present / partial reconciliation only**.
- Importer evidence is incomplete at per-entity/per-amount granularity (many entities have no per-type importer count; importer totals by amount are not logged by type).
- Batch-level importer counters conflict with other logged figures (e.g., `transactions_imported=40334` vs `transactions_phase_completed=12718` in audit log rows).

## 5) EXACT REMAINING REQUIREMENTS

To upgrade this precheck to full source-vs-mirror certification for TRANSP realm `123145885549599`, required inputs are:
1. Live QBO source pull (same date window as the import run) with **entity-by-entity counts and amount totals** for Account, Customer, Vendor, Item, Class, and each imported transaction type.
2. Export of source-side record IDs (`qbo_id`) per entity/transaction type from that same live pull.
3. Deterministic comparison job producing:
   - count/amount deltas per entity/type (QBO source vs IH35 mirror), and
   - full record-level mismatch list keyed by `qbo_id` (source-only vs mirror-only).
4. If importer logs are to be used as an audit source, add/obtain a per-record importer manifest (success + failure) keyed by `qbo_id`; current repository evidence does not contain a complete one.
