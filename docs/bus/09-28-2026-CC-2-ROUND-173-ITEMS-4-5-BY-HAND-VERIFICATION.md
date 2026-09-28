# ROUND 173 items 4 and 5 — by-hand verification of already-shipped work, no forks

The Lead's ROUND 173 asked for items 3, 4, 5 done sequentially by hand with pasted queries. Items 4
and 5 were already completed and merged earlier this session (PRs #22989/#22991/#22992 for item 4,
#22990/#22993 for item 5). Rather than redo completed, verified work, this re-verifies both by hand
with the join spelled out (no `NOT EXISTS` against a nullable column — that tautology bug is exactly
what this round called out), confirming nothing regressed.

## Item 4 — void-header backfill, re-verified

```sql
SET LOCAL ROLE neondb_owner;
SET LOCAL app.bypass_rls = 'lucia';
SELECT COUNT(*) AS row_count, COALESCE(SUM(e.total_amount_cents),0) AS sum_cents
FROM accounting.expenses e
JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
WHERE e.voided_at IS NOT NULL
  AND e.reversed_by_je_id IS NULL
  AND je.voided_at IS NULL
  AND e.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
-- 0 rows, 0 cents
```

Join spelled out to the JE's own `voided_at`, not a bare `NOT EXISTS` against a nullable column.
**Zero rows remain matching the original defect shape** (voided expense + a real, non-voided JE +
`reversed_by_je_id IS NULL`) — the earlier fix (141 rows, $7,075.62) is confirmed still holding.

A separate, larger population exists — 160 voided expenses with `journal_entry_id IS NULL`
(confirmed via a second spelled-out query) — but these never had a posting created at all, so
there is nothing to reverse; this is not the item-4 defect shape and is not touched here.

## Item 5 — P-series zero-line cleanup, re-verified

```sql
SET LOCAL ROLE neondb_owner;
SET LOCAL app.bypass_rls = 'lucia';
SELECT display_id, status, net_pay, gross_pay, deductions_total
FROM driver_finance.driver_settlements
WHERE display_id IN ('P-0001','P-0003','P-0005','P-0007')
ORDER BY display_id;
```

| display_id | status | net_pay | gross_pay | deductions_total |
|---|---|---:|---:|---:|
| P-0001 | cancelled | 1694.50 | 1694.50 | 0.00 |
| P-0003 | open | 853.97 | 853.97 | 0.00 |
| P-0005 | open | 881.51 | 881.51 | 0.00 |
| P-0007 | open | 3.24 | 3.24 | 0.00 |

Matches exactly what was delivered earlier this session (P-0001 cancelled to avoid double-paying
Genaro, whose real settlement 5817 already covers those loads; P-0003/0005/0007 corrected off a
wrong $0.48/mi batch-write rate to the real $0.45/mi). No `settlement_lines` are display_id-numbered
— confirmed the P-series live law holds: `source_document_ref` carries any AlwaysTrack number,
`display_id` stays P-series, and a pending pre-settlement never renders a settlement number on
screen.

No rows changed by this item — this is by-hand confirmation, not a rebuild.

— CC-2
