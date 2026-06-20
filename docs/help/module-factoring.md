# Factoring

The Factoring module (FACTORING) manages the carrier's relationship with its factor — the company that advances cash against customer invoices — including what gets submitted, what's held in reserve, and how factor activity reconciles back into the books.

## Overview
The carrier factors invoices to get paid quickly instead of waiting on customer terms. The current factor is **Faro Factoring**. The module tracks submissions, the reserve the factor holds back, and the imports used to reconcile factor statements against the carrier's own records.

## Key tasks
- **Submit invoices to the factor** — track which customer invoices have been sent for advance.
- **Track the reserve** — the factor holds back a reserve on each advance and releases it later; the module keeps that balance visible.
- **Import factor statements** — bring in the factor's CSV activity and reconcile it against submitted invoices and expected reserve releases.
- **Watch customer credit limits** — credit-limit sources are tracked as `factor`, `manual`, or `rmis_future`, so dispatch knows a customer's available credit before booking.

## Tips & gotchas
- The current factor is Faro Factoring; a future migration to RTS is planned, so keep factor-specific assumptions out of permanent records where possible.
- Reserve is money owed back to the carrier later — reconcile releases so it isn't lost track of.
- A customer's credit-limit source (`factor` / `manual` / `rmis_future`) tells you how trustworthy the limit is when deciding whether to book.

## FAQ
- **Who is the current factor?** Faro Factoring.
- **What is the reserve?** The portion of each invoice the factor withholds on the advance and releases later; the module tracks it so it gets collected.
- **What does the credit-limit source mean?** It records where a customer's credit limit came from — the factor, a manual override, or a future RMIS feed.
