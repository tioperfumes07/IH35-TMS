# Related-Party Loan Advance Note — owner template (ROUND 443.22-2c)

**Status:** draft for owner wording review before locking the final printable text.
**Engine:** `apps/backend/src/accounting/related-party-loan-posting/advance-note.service.ts`
**When minted:** every funding advance (`direction=in`, not a repayment) on create.
**Where stored:** `accounting.related_party_loan_entries.note_html` + `docs.files` / `docs.file_links`
(entity types `related_party_loan` and `related_party_loan_facility`).

---

## Fields on every note

| Field | Source |
|---|---|
| Document number | `display_id` (always-track style loan document id) |
| Advance date | `entry_date` |
| Lender | counterparty name |
| Relationship | owner / spouse / friend / employee / related_company / other |
| Borrower | USMCA operating company legal name |
| Principal advanced | `principal_cents` |
| Interest rate (APR) | `interest_rate_bps` ÷ 100 |
| Liability account | CoA account number + name (2410 family) |
| Facility id | running LOC facility UUID |
| Signature blocks | Lender · Borrower (USMCA) authorized signature + date |

---

## Plain-English body (current mint)

> This note records a funding advance from the lender named below to **USMCA** (the borrower).
> It is issued at the moment of the advance and is the company's record of the loan document for
> this funding.
>
> The principal shown above is added to the lender's running related-party loan facility.
> Repayments reduce that facility balance and do not create a new advance note.

---

## Owner review

Edit wording here first. The next Cursor PR that touches advance-note.service must keep
`buildAdvanceNoteHtml` aligned with this file (guard 18366 asserts both).
