# ENG-26 PARTIAL — factoring_advance_deposit load resolver — 2026-10-28 CT

## Tip
- `verify-every-load-born-document-and-posting-traces-to-its-load` PASS
- `verify-every-load-born-posting-carries-its-load` RULE 2 FAIL — 4 `factoring_advance_deposit` postings

## Root
- TS `resolvePostingSourceLoad` already maps deposit → advance → source_load_id / ONE invoice load
- SQL `accounting.posting_source_load_id` only mapped `factoring_advance` and only `source_load_id` (no invoice fallback)
- Advances FAC-2026-00010/00011 have null `source_load_id`; stamp came from invoice fallback

## Fix
Migration `202616301300_posting_source_load_id_factoring_deposit.sql` — IN (factoring_advance, factoring_advance_deposit, …) + COALESCE invoice fallback.

Txn-proven: 4 reds stamp=resolved. Apply on deploy → RULE 2 DONE-LIVE.
