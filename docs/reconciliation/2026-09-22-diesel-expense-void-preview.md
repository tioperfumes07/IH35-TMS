# Diesel expense void list — PREVIEW ONLY (Cursor, 2026-09-22, Lead round 48 ruling)

**Status: PREVIEW. Nothing has been voided. Executor: CC-2, after Lead approval.**

Lead ruling (round 48): `fuel.fuel_transactions` is canonical for fuel. Diesel rows in `accounting.expenses`
are a derived copy and must not post. This file is the row-level list of which Diesel expense rows go and
which stay.

Measured live on Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a` (production), `bypass_rls=lucia`,
USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Scope: the 34 USMCA AlwaysTrack documents (end_date >=
2026-08-07, the same selection `verify-alwaystrack-parity.mjs` uses) and their 76 loads.

## Why these rows are duplicates

Both copies of each purchase are live in the GL, both debiting 5000 Fuel & Diesel:

| | $ |
|---|---|
| AlwaysTrack fuel, 34 documents (ground truth) | 110,072.33 |
| `fuel.fuel_transactions` on those loads (all live in GL) | 123,472.02 |
| `accounting.expenses` memo `Diesel%` on those loads (all live in GL) | 63,106.32 |
| GL fuel overstated | 76,506.01 |

The two copies share the vendor invoice number: `accounting.expenses.vendor_document_number` =
`fuel.fuel_transactions.transaction_reference`. Either side may carry a `-L<load>` suffix, so the suffix is
stripped on both sides before comparing. Most matching fuel rows are `source='import'` with note
`ABSORPTION-B1 doc <n>`, so they were transcribed from the same settlement document. The expense shows the
gross amount and the fuel row shows the settlement's "actual" (net of discount), so the amounts differ by
the discount; the invoice number is the join, not the amount.

## The classification (93 rows, $63,106.32, all accounted for)

| class | meaning | rows | $ | action | id-set md5 (ids sorted, comma-joined) |
|---|---|---|---|---|---|
| **A** | a live fuel row on the SAME load carries the same invoice | 89 | 59,726.73 | **VOID** | `8c6a2eea31541c22c69481032dbfeb6c` |
| **C** | a live fuel row carries the same invoice but on a DIFFERENT load — expense `13547` (inv 1848853), expense `13557-1` (inv 99794138, live fuel row on load 13571, archived copy on 13557) | 2 | 1,590.95 | **HOLD** — CC-3 first puts the fuel row on the load the settlement document names, then void | `faf75e3a45d9982207b0120700c2115f` |
| **D** | no live fuel row anywhere with that invoice or same-day same-amount — expense `13537` (inv 99456225, $1,164.04), `13546-2` (no invoice, $624.60, doc 5788) | 2 | 1,788.64 | **KEEP** — may be the only record of the purchase; CC-3 finds the source line and creates the fuel row, then it becomes class A | `6caf42fca8e51c1de84ca681045c7b95` |

Voiding class A removes $59,726.73 from GL 5000; class C adds $1,590.95 once the attribution is fixed.
Together that is $61,317.68 — in line with the ~$61.4k document-level excess.

## Reproduce before executing (must return 89 rows, $59,726.73, md5 `8c6a2eea31541c22c69481032dbfeb6c`)

```sql
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
WITH L AS (
  SELECT l.id FROM mdata.loads l
   WHERE l.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
     AND l.load_number = ANY(ARRAY['13498','13508','13503','13509','13504','13510','13502','13507','13512',
       '13513','13497','13511','13517','13518','13506','13514','13516','13505','13515','13520','13519','13521',
       '13524','13525','13526','13527','13530','13532','13523','13534','13535','13537','13522','13528','13536',
       '13531','13538','13543','13533','13548','13549','13555','13539','13546','13552','13550','13557','13542',
       '13554','13545','13560','13547','13559','13562','13565','13566','13558','13568','13561','13567','13541',
       '13569','13577','13572','13575','13571','13574','13551','13573','13584','13570','13580','13579','13589',
       '13564','13586'])
), de AS (
  SELECT e.id, e.total_amount_cents amt, e.load_id,
         NULLIF(regexp_replace(coalesce(e.vendor_document_number,''),'-L[0-9]+$',''),'') inv
    FROM accounting.expenses e JOIN L ON L.id = e.load_id
   WHERE e.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
     AND e.voided_at IS NULL AND e.memo ILIKE 'diesel%'
)
SELECT count(*), round(sum(amt)/100.0,2), md5(string_agg(id::text, ',' ORDER BY id))
  FROM de
 WHERE inv IS NOT NULL AND inv <> 'no-invoice'
   AND EXISTS (SELECT 1 FROM fuel.fuel_transactions f
                WHERE f.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
                  AND f.archived_at IS NULL AND f.load_id = de.load_id
                  AND regexp_replace(f.transaction_reference,'-L[0-9]+$','') = de.inv
                  -- the twin must itself POST, or voiding the expense drops the cost
                  AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                                JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                               WHERE p.source_transaction_type = 'fuel_event'
                                 AND p.source_transaction_id::text = f.id::text
                                 AND je.status = 'posted' AND je.voided_at IS NULL
                                 AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
                                 AND p.reversed_by_line_id IS NULL));
ROLLBACK;
```

**Revised 2026-09-22 20:10 UTC.** At 20:03 UTC CC-3 restored 13537's fuel row (`390ee1a5-…`, FUEL-DEDUPE-05 —
its earlier archive was wrong). It came back live but **without a live GL posting**. The previous version of this
query did not test that, and now returns 90 / $60,890.77 / md5 `c9b5b7df19eb987345e3311e3bfecd9f` — which fails
the fingerprint check, as designed. With the posting test above it returns exactly the approved batch,
**89 / $59,726.73 / md5 `8c6a2eea31541c22c69481032dbfeb6c`**. **13537 stays HELD**: CC-3 re-posts the restored
fuel row through POSTING-04 (`reflushUnpostedFuelGlExpenses`) first; only then may expense 13537 be voided.

If the count, sum or md5 differs, stop: something changed since this preview, and the list must be
re-derived, not forced.

## Execution rules (CC-2)

1. Class A only, after Lead approval. Void each row through `voidDocument({ type: 'expense' })` in
   `apps/backend/src/accounting/void-document.service.ts` (on main), which calls
   `reversePostedSourceTransactionInClientTx` — no new GL math, no seventh engine, no DELETE.
2. `void_reason` names this file and the matching fuel row id, so every void has its register.
3. After: re-run the SQL above — it must return 0 rows. GL 5000 must drop by exactly $59,726.73 of live
   `expense` postings on these loads; `fuel_event` postings unchanged.
4. Liveness test for every check: `je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id
   IS NULL AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL`.
5. Class C waits for CC-3's attribution fix; class D is not voided.

## Open item this does not solve

`banking.bank_transactions` matches a bank line to a document through `matched_expense_id`. With fuel rows
canonical there is no column to match a bank line to a fuel row (Lead named this schema gap in round 48).

## Per-document dollar effect (Lead round 48, 1 of 3)

AlwaysTrack fuel vs what the GL carries on the document's loads, before and after voiding class A.
`over_after` > 0 means the document's fuel rows themselves exceed the document (Relay/duplicate fuel rows —
CC-3's half). Small negatives are the fuel rows carrying Dreamline's net-of-discount price.

| doc | AlwaysTrack fuel | fuel rows | Diesel expenses | void A | hold C | keep D | over now | over after A |
|---|---|---|---|---|---|---|---|---|
| 5769 | 1,278.22 | 1,261.65 | 1,278.22 | 1,278.22 | | | 1,261.65 | −16.57 |
| 5771 | 3,171.66 | 3,016.95 | 1,458.16 | 1,458.16 | | | 1,303.45 | −154.71 |
| 5772 | 3,979.40 | 3,924.57 | 1,800.63 | 1,800.63 | | | 1,745.80 | −54.83 |
| 5773 | 3,805.85 | 3,622.22 | 1,620.97 | 1,620.97 | | | 1,437.34 | −183.63 |
| 5774 | 2,519.78 | 4,431.17 | 962.87 | 962.87 | | | 2,874.26 | 1,911.39 |
| 5775 | 3,207.40 | 3,155.90 | 2,106.58 | 2,106.58 | | | 2,055.08 | −51.50 |
| 5776 | 4,224.49 | 4,224.49 | 2,991.65 | 2,991.65 | | | 2,991.65 | 0.00 |
| 5777 | 3,369.65 | 3,165.11 | 3,369.65 | 3,369.65 | | | 3,165.11 | −204.54 |
| 5779 | 3,299.57 | 3,292.11 | 1,418.42 | 1,418.42 | | | 1,410.96 | −7.46 |
| 5780 | 843.76 | 843.76 | 843.76 | 843.76 | | | 843.76 | 0.00 |
| 5781 | 2,385.97 | 3,232.75 | 2,385.97 | 2,385.97 | | | 3,232.75 | 846.78 |
| 5783 | 3,539.69 | 4,197.10 | 3,539.69 | 2,375.65 | | 1,164.04 | 4,197.10 | 1,821.45 |
| 5784 | 5,547.73 | 5,390.76 | 5,547.73 | 5,547.73 | | | 5,390.76 | −156.97 |
| 5785 | 4,570.14 | 4,513.46 | 2,525.64 | 2,525.64 | | | 2,468.96 | −56.68 |
| 5786 | 2,418.24 | 4,128.80 | 1,154.66 | 1,154.66 | | | 2,865.22 | 1,710.56 |
| 5787 | 1,990.55 | 2,463.62 | 1,990.55 | 1,990.55 | | | 2,463.62 | 473.07 |
| 5788 | 4,671.26 | 4,807.34 | 2,537.74 | 1,913.14 | | 624.60 | 2,673.82 | 760.68 |
| 5789 | 3,799.29 | 2,696.88 | 3,799.29 | 2,793.70 | 1,005.59 | | 2,696.88 | −96.82 |
| 5790 | 3,806.68 | 5,187.93 | 3,806.68 | 3,806.68 | | | 5,187.93 | 1,381.25 |
| 5791 | 3,840.27 | 3,690.26 | 3,840.27 | 3,840.27 | | | 3,690.26 | −150.01 |
| 5792 | 3,792.70 | 3,662.92 | 3,792.70 | 3,207.34 | 585.36 | | 3,662.92 | 455.58 |
| 5793 | 3,942.23 | 3,814.58 | 3,942.23 | 3,942.23 | | | 3,814.58 | −127.65 |
| 5794 | 3,707.91 | 5,387.70 | 3,707.91 | 3,707.91 | | | 5,387.70 | 1,679.79 |
| 5795 | 2,684.35 | 2,655.28 | 2,684.35 | 2,684.35 | | | 2,655.28 | −29.07 |

After class A: 13 documents land $7–205 under AlwaysTrack, 2 tie exactly (5776, 5780), 9 stay over by
$455–1,911 because of their fuel rows. Remaining GL fuel overstatement after A = $16,779.28 = fuel-row excess
$13,399.69 + class C $1,590.95 + class D $1,788.64.

## Corrections to class D after closer matching

- **13546-2 ($624.60, doc 5788) is a twin**: live fuel row on the same load, same day, net $624.83 (23c off),
  gross $644.08, no invoice on either side. Void on approval, with that tolerance stated in the void_reason.
- **13537 ($1,164.04, doc 5783) is the only LIVE record**: its twin (same invoice 99456225, gross exactly
  $1,164.04, net $1,049.00) is a fuel row CC-3 has ARCHIVED. Keep the expense until CC-3 says which fuel row
  carries this purchase; voiding it now would drop the cost entirely.

## Batch 2 — 13546-2, single row (Lead ruling round 50: void as its own batch, 23c stated)

Expense `6bf2bd70-202e-4469-b699-cfe493490177` (13546-2, doc 5788), $624.60, 2026-08-26, no invoice number.
Exactly one live twin on the same load and day within 25c: fuel row `a463d7ba-ff87-4abf-9535-158225ef2299`
(source import, net $624.83, gross $644.08). **The twin posts** (five-column liveness) and so does the expense —
voiding the expense leaves the purchase in the GL once. Suggested void_reason: "Diesel duplicate of fuel row
a463d7ba-ff87-4abf-9535-158225ef2299 (same load/day, net $624.83 vs $624.60, 23c basis difference) —
docs/reconciliation/2026-09-22-diesel-expense-void-preview.md batch 2".

Reproduce (must return 1 | 624.60 | 328d3394910696b1164e82ac829fce80):
```sql
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SELECT count(*), round(sum(e.total_amount_cents)/100.0,2), md5(string_agg(e.id::text, ',' ORDER BY e.id))
  FROM accounting.expenses e
 WHERE e.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND e.id = '6bf2bd70-202e-4469-b699-cfe493490177' AND e.voided_at IS NULL
   AND EXISTS (SELECT 1 FROM fuel.fuel_transactions f
                JOIN accounting.journal_entry_postings p ON p.source_transaction_type = 'fuel_event'
                                                        AND p.source_transaction_id::text = f.id::text
                JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
               WHERE f.id = 'a463d7ba-ff87-4abf-9535-158225ef2299' AND f.archived_at IS NULL
                 AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
                 AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL);
ROLLBACK;
```

**Still HELD: 13537** (twin restored 20:03 UTC without a GL posting). **Still HELD: class C** (13547, 13557-1 —
twin on another load; CC-3 fixes attribution first).
