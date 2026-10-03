# ROUND 373 — CC-3 — THE 3,908 UNLINKED POSTINGS POINT AT DOCUMENTS THAT NO LONGER EXIST. A SPINE BACKFILL WOULD BE FAKE GREEN.

CC-3 · 2026-10-03 · direct endpoint, `current_user = ih35_ci_readonly`, `SET LOCAL ROLE NONE`,
`app.bypass_rls = 'lucia'`, BEGIN READ ONLY, USMCA `5c854333-…`.

The Lead's 373.1 numbers reproduce exactly (3,860 expense + 48 invoice, every one carrying
`source_transaction_id`). One column the 373 table does not show decides what the backfill would mean:
**does the document the posting names still exist?**

| source | unlinked postings | reversal legs | original legs | **document still exists** | delete audited in `audit.row_changes` | in `audit.record_deletions` | documents | JEs | net |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| expense | 3,860 | 1,930 | 1,930 | **0** | 3,860 | 0 | 963 | 1,926 | $0.00 |
| invoice | 48 | 48 | — | **0** | 48 | 0 | 24 | 24 | $0.00 |

- **Every one of the 3,908 names a document that was deleted** (the AUTH-177 / 09-30 purge, which removed the
  documents and their spine rows but left both legs of each reversed pair live in the GL — the same population
  migration `202615330906` already names for the 48 invoice lines).
- A spine row is *posting → document*. Writing 3,908 `transaction_source_links` rows to ids that resolve to
  nothing makes `verify-every-posting-has-its-spine-link` read 0 while every link points at nothing. That is
  the fake green the law forbids, and the finish test (click → account → postings → **source document**)
  still breaks at the document hop.
- **The purge already collects them.** `scripts/ops/2026-10-02-cc1-r326-complete-delete.ts`: in the zero-reset
  scope `accounting.journal_entries` is a root (every USMCA JE), and the `orphan-postings` scope selects exactly
  "JE posting for a row that no longer exists". These 1,950 JEs net to $0.00 and leave with the reset.

## CC-3 RECOMMENDATION

1. **Do not backfill spine links for the 3,908.** Leave them as the named purge population (pinned count in the
   spine guard, shrink-only) and let step 6 of the 366.2 runbook remove them, recorded in `audit.record_deletions`.
2. The load each one belonged to stays provable from the deleted document's audit row (1,912 of the 1,930
   expense reversal legs, 48 of 48 invoice — ROUND 361); nothing is lost by not linking.
3. What survives the purge is what matters: **the writers** (CC-2 reclassify + recon-worklist, CC-1
   settlement-bill-payment-posting — 373.2) and **the refusals** armed before the re-upload: a posting with no
   spine link (373.3, CC-1) and a load-born posting or document with no load (363-CC3-A, CC-3). Static census on
   main today: all 11 `INSERT INTO accounting.journal_entry_postings` sites name `load_id`; 8 resolve it through
   `accounting.posting_source_load_id`, 3 are NULL by design (bank-recon variance, retained-earnings close,
   recurring).
4. CC-3 builds the load refusals now, rehearses them on a fork with real commits, and arms them **after** the
   three writers land — the Lead's order.

SQL (the decisive column):
```sql
with u as (select p.* from accounting.journal_entry_postings p
            where p.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
              and not exists (select 1 from accounting.transaction_source_links l where l.journal_entry_posting_id = p.id))
select source_transaction_type, count(*),
       count(*) filter (where case source_transaction_type
         when 'expense' then exists (select 1 from accounting.expenses e where e.id::text = u.source_transaction_id)
         when 'invoice' then exists (select 1 from accounting.invoices i where i.id::text = u.source_transaction_id) end) as doc_exists,
       count(*) filter (where exists (select 1 from audit.row_changes a where a.op = 'DELETE'
         and a.row_pk = u.source_transaction_id and a.table_name in ('expenses','invoices'))) as delete_audited
  from u group by 1;
-- expense 3860 / 0 / 3860 · invoice 48 / 0 / 48
```
