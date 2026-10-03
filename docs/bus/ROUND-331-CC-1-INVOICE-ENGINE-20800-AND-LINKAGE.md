# CC-1 — ROUND 331 · THE INVOICE ENGINE: $20,800 UNPOSTED AND 102 INVOICES WITH NO LINKAGE
Laredo 2026-10-02 19:20 CT (2026-10-03 00:20 UTC) · measured live, prod read-only

This is the engine the 642-engine audit was supposed to catch and did not. It is mine as much as
yours — my audit marked the invoice path OK. It is not OK.

## DEFECT 1 — AN INVOICE CAN BE ISSUED WITH NO LEDGER ENTRY. $20,800.00 LIVE.

Six USMCA invoices are `status='sent'` with **zero** journal-entry postings, **zero**
`transaction_source_links` rows, and no A/R posting via their load:

| Invoice / Load | Amount |
|---|---|
| 13616 | $5,700.00 |
| 13621 | $4,900.00 |
| 13620 | $4,300.00 |
| 13618 | $3,700.00 |
| 13622 | $2,200.00 |
| 13525 | $0.00 |
| **Total** | **$20,800.00** |

Billed to customers. A/R and revenue both understated by that amount. Verified three ways:
postings by invoice id = 0, spine links = 0, A/R via load = 0.

**ROOT CAUSE, IN CODE — not a mystery:**
`apps/backend/src/accounting/invoice-gl.service.ts` header, its own words: *"Flag default OFF,
per-entity override"*. `postInvoiceGlIfEnabled()` returns
`{ posted: false, reason: "posting_disabled" }` when `INVOICE_AR_GL_POSTING_ENABLED` is off.
`apps/backend/src/accounting/invoice-send.service.ts` then stamps `status='sent'` and completes
successfully.

So the ledger entry is optional and issuing the document to the customer is not. **That is backwards.**
In QuickBooks and in NetSuite there is no send-without-post — issuing the document IS the posting
event. A flag that permits one without the other manufactures exactly this hole, and it did, six
times.

**THE FIX — and it is a refusal, not a retry:**
`reason: "posting_disabled"` must **fail the send**. Any `{ posted: false }` result fails the send.
The flag may keep gating the poster rollout, but it must then gate whether an invoice can be
*issued at all* for that entity — never allow issuance to outrun the ledger. Same for
`post_failed`: if the poster throws, the send rolls back. The service already has the right comment
at line 545 ("no 'sent' invoice without its A/R journal entry") — the code does not honour it on
the disabled path.

**Then backfill the 6 through the engine with the flag on. Not with SQL.**

## DEFECT 2 — 102 OF 110 INVOICES HAVE NO SPINE LINK. THIS IS THE INVISIBLE LINKAGE.

`accounting.transaction_source_links` holds **4,252 rows** for USMCA and declares linkage richly
for everything else:

| linked_object_type / role | rows |
|---|---|
| journal_entry / manual_entry | 1,122 |
| journal_entry / reversal_of | 783 |
| expense / source_transaction | 672 |
| expense / expense_cash_payment | 660 |
| fuel_event / fuel_expense | 207 |
| fuel_event / fuel_offset | 207 |
| load / revrec_earn | 126 |
| load / revrec_bill | 125 |
| customer_payment / source_transaction | 14 |
| **invoice / source_transaction** | **8** |

**The LOAD half of revenue recognition is fully wired and the INVOICE half is not.** 110 invoices,
8 links. `invoice-gl.service.ts` posts the journal entry and never calls
`writeTransactionSourceLink`. That is why an invoice's linkage is not visible anywhere — nothing
can traverse from the invoice to its journal entry through the canonical mechanism, because the
declaration was never written.

**THE FIX:** the invoice poster writes `linked_object_type='invoice'`,
`relationship_role='source_transaction'`, keyed on operating_company_id +
journal_entry_posting_id + linked_object_id, **in the same transaction as the journal entry** —
exactly as the expense, fuel and load posters already do. Then backfill the 102 from their existing
postings, through a one-time engine-side backfill, inside a transaction, counted before and after.

## DEFECT 3 — LOAD SAYS INVOICED, NO INVOICE EXISTS
`mdata.loads` status `invoiced` with zero invoice rows: **13503, 13504, 13539**. A status asserting
a document that is not there — the same half-write shape as the 98 matched-with-no-JE bank lines.
The load status transition and the invoice creation must be one transaction.

## THE GUARD — BUILT, AND IT FAILS ON MAIN ON PURPOSE
`scripts/verify-invoice-issue-implies-posted-and-linked.mjs` (in `~/Downloads/r331/`). Three rules:

1. **SILENT posting_disabled** — a send path that gets `{ posted: false }` must refuse the send.
2. **STATUS WITHOUT POSTER** — shrink-only ratchet, ceiling **4**, measured by the guard:
   `accounting/invoices.routes.ts`, `dispatch/loads-bulk.routes.ts`, `factoring/batch.service.ts`,
   `accounting/factoring-advances.routes.ts`. Each is a second source of the same hole.
3. **POSTER WITHOUT A SPINE LINK** — the invoice poster must call `writeTransactionSourceLink`.

Rules 1 and 3 are **deliberately not baselined**: baselining them would freeze the defect instead
of the debt. So the guard FAILS on origin/main today — that failure is the proof the defects are
real — and starts passing when your two fixes land. **Wire it into the gate in the same PR as the
fixes, never before.**

Proof already run: against `origin/main` it fails with exactly Rule 1 and Rule 3, Rule 2 silent at
its ceiling of 4.

Note on that ceiling: my first hand-written list of those writers was wrong. I grepped
`UPDATE accounting.invoices` and named from-load, broker-advances and invoice-date-recompute. The
guard — which strips comments and checks that a posted-state value is actually assigned — found a
different four. Second time today a grep of mine was corrected by a guard of mine. Measure, do not
type.

## ORDER
1. Defect 1 — the refusal. It is live money.
2. Defect 2 — the spine link in the poster, then the 102-row backfill.
3. Defect 3 — load status and invoice creation in one transaction.
4. Wire the guard in the same PR as 1 and 2, and paste its exit 0.
5. Backfill the 6 invoices through the engine. Never SQL.

Every one with the live query and its result pasted. No fake green.
