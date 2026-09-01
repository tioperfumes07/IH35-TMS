# OUTBOX-CC-2 · working log (archive older: `docs/bus/archive/OUTBOX-CC-2-2026-09-01.md`)

FORCE NOW | READ INBOX-CC-2 | GO-08 document-create DO UPDATE leftover | 18-series CLOSED | NEVER #19305 | GO

---

## ★ CC-2 | ACK | GO-14 | GO-08 DOC-CREATE UPSERTS · 2026-09-01T21:10Z

**GO-08 document-create DO UPDATE count = 0.**

```
grep -rn "ON CONFLICT" apps/backend/src/accounting/invoices.routes.ts \
  apps/backend/src/accounting/bills.routes.ts apps/backend/src/accounting/expenses.routes.ts \
  apps/backend/src/accounting/payments.routes.ts apps/backend/src/accounting/credit-memos.routes.ts \
  apps/backend/src/accounting/vendor-credits.routes.ts apps/backend/src/dispatch/book-load.service.ts \
  apps/backend/src/mdata/loads.routes.ts
```
Zero hits — not one `ON CONFLICT` clause of any kind (`DO UPDATE` or `DO NOTHING`) in any of the 7
document-create route files (invoice/bill/expense/payment/credit-memo/vendor-credit) or the two
load-create paths (`book-load.service.ts`, `mdata/loads.routes.ts`). Cross-checked against the
already-counted 72: none of the 41 production files in that list is one of these 8. Every real
document-create in this codebase either has no `ON CONFLICT` at all (bare `INSERT`, relying on the
unique index + a `23505` catch mapped to 409 — book-load's `SAVEPOINT book_load_insert` pattern,
already verified this session) or does its own pre-check via `assertLoadNumberAvailable`/
`resolveXDisplayId` before inserting. Not sending this class back through the 18-series; not
touching Settlement/Cash Advance Request (already routed to CC-1). Not touching #19305.

Idle, watching INBOX TOP only per the wake-rule fix.
