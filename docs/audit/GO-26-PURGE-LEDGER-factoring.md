# GO-26 PURGE LEDGER — factoring schema — 2026-09-02

Fourth of six schema PRs (`accounting` → `driver_finance` → `banking` → **`factoring`** →
`dispatch` → `fuel`). Only one purge target in this schema:
`factoring.customer_factor_assignment` (1,221 rows, customer factoring setup) and `factoring.factor`
(1 row, Faro Factoring — real partner) are both PART-2 keep-list config, untouched.

## Stopped to verify before touching this — did NOT purge blind

`factoring.batch` (4 rows) does not carry an obvious "TEST DATA" marker the way most of this
purge's rows do, and one row (`583d6d03`) is explicitly tagged KEEP in this session's own earlier
history ("KEEP batch 583d6d03" / "FACT-F1-F4 on batch 583d6d03 / invoice 6708d422 (KEEP)"). The
4 batches total $30,000+ face value across 13 invoice references, factor_id pointing at the real
Faro Factoring partner. This did not read as an obvious fixture, so checked live before deleting
anything.

**Resolved live**: `accounting.invoices` has **zero** USMCA rows (confirmed: `SELECT count(*)
FROM accounting.invoices WHERE operating_company_id='5c854333-...' ` = 0), and every specific
invoice_id these 4 batches reference (`6708d422`, `b497b3ba`, `35ce61d1`, and 10 more) does not
exist in that table at all. The batches reference already-purged fixture invoices from earlier in
the build — the "KEEP" tag was a prior-state marker on data that existed at the time it was
written, now superseded by the same 2026-09-02 blanket owner order that supersedes every other
"TEST DATA keep" tag this purge has already overridden (sample driver, several accounting rows).
Not a guess — the live invoice-count check made the call, not the earlier tag.

## Rows captured before deletion

- `583d6d03` — BATCH-20260828-053812-5U73, $50.00, status=submitted, invoice 6708d422 (does not exist)
- `0232d1cb` — BATCH-20260831-030412-A6PW, $800.00, status=submitted, invoice b497b3ba (does not exist)
- `2ae21a3c` — BATCH-20260831-030909-YP47, $30,000.00, status=submitted, 10 invoice_ids (none exist)
- `b6e0cd21` — BATCH-20260831-094524-4KJQ, $4,200.00, status=draft, 2 invoice_ids (neither exists)

No void columns on `factoring.batch` (checked live) — full row JSON above is the register.
`has_table_privilege('ih35_app','factoring.batch','DELETE')` = false; deleted under `RESET ROLE`
like every other table this purge has touched — no hard append-only block on this one.

## RESULT — live on Neon, before vs after

AFTER (2 nonzero, both KEEP-list):
```
customer_factor_assignment 1221 · factor 1 (Faro Factoring, real partner)
```
Zero non-keep-list rows remain in `factoring`.
