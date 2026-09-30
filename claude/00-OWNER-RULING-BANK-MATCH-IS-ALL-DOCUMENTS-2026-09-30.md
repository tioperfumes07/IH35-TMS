# OWNER RULING — THE BANK-MATCH ENGINE IS FOR ALL TRANSACTIONS AND DOCUMENTS
# 2026-09-30 · SUPERSEDES ROUND 155.24 (settlement-born-only) · PERMANENT

## The question I put to the owner

`verify-match-candidates-are-settlement-born-only.mjs` had been FAILING on main and was
wired to nothing, so nobody had to resolve it:

    fetchLedgerCandidates must NOT select from expenses
    fetchLedgerCandidates must NOT select from AR payments

The guard was telling the truth about the code — `match.service.ts` does select from
both. I refused to exempt it (exempting a truthful guard is how a defect becomes
permanent) and I refused to "fix" it, because removing AR payments and ordinary expenses
from the candidate universe changes WHAT THE OWNER CAN MATCH A BANK TRANSACTION AGAINST,
and he matches bank transactions himself. So I asked him.

## His answer, verbatim

> "I expect to see AR and regular expenses and bills and regular receive payments and
> deposits that we create to appear in suggested matches etc, or if I filter by 7-Eleven
> have all expenses for that vendor etc. **The engine is for ALL transactions-documents.**"

> "Or suggested match to a payment we recorded by a customer that did not factor etc."

## THE RULING

**The code was RIGHT. The guard was STALE.** ROUND 155.24's settlement-born-only rule is
SUPERSEDED and does not apply to bank reconciliation matching.

The candidate universe for a bank-transaction match is EVERY document the company
creates. Narrowing it is now the defect. A settlement-born-only matcher would hide:
  - every ordinary vendor expense (the 7-Eleven filter case, by name)
  - every customer payment that was NOT factored
  - every bill and bill payment not born of a settlement
which is exactly the work the owner does by hand at the banking screen.

## What changed in the repo

RETIRED: `scripts/verify-match-candidates-are-settlement-born-only.mjs` — deleted, not
exempted. Its property is no longer the owner's rule.

REPLACED BY: `scripts/verify-match-candidates-cover-all-documents.mjs`, wired at
verify-step 11838. It asserts the OPPOSITE and correct property — that
`fetchLedgerCandidates` covers `accounting.expenses`, `accounting.bills`,
`accounting.bill_payments` and `accounting.payments`, and is company-scoped. Selftest
6/6: each required source removed one at a time (each mutation is precisely what the old
guard demanded), company scoping dropped, and the function deleted.

MEASURED LIVE 2026-09-30, USMCA, at the time of the ruling:
    accounting.expenses        1,640 rows
    accounting.bills              96 rows
    accounting.payments (AR)       7 rows
    accounting.bill_payments     wired into the candidate query
    banking.transfers              0 rows — exists, never written to

`banking.transfers` is deliberately NOT asserted. A guard must not demand a source that
has never carried a row; when deposits/transfers start being created they join
`REQUIRED_SOURCES` in that guard and the ruling stands unchanged.

## STANDING

The owner matches bank transactions himself. Seats do not match. This ruling governs
what the engine SUGGESTS; it does not authorise any seat to create a match.
