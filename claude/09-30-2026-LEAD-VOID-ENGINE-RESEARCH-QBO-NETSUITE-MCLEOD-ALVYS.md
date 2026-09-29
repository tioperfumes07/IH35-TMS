# VOID ENGINE — RESEARCH FINDING · QBO vs NETSUITE vs McLEOD / ALVYS
Claude Lead, 2026-09-30. Sources named. Where a source could not be obtained, that is stated plainly
rather than filled in from memory.

## 1. QUICKBOOKS ONLINE — from Intuit's own help documentation
**VOID:** "you keep a record of the transaction in your books that don't affect your totals." The
transaction stays visible, shows as zero, **keeps its transaction number**, and cannot be undone.
**DELETE:** removes the transaction "from most areas except the audit log." The audit log preserves
it and a deleted transaction can be re-entered from it. Cannot be undone.
**Voidable types:** invoices, bill payments, payments, sales orders, checks, expenses.
**The weakness:** QBO's void ZEROES THE TRANSACTION IN PLACE, on its original date. If that date sits
in a closed period, the closed period's totals change. For a company that will be reviewed, that is
the wrong behaviour.

## 2. NETSUITE — from Oracle's own NetSuite documentation. THIS IS THE SUPERIOR METHOD.
NetSuite has a preference: **"Void Transactions Using Reversing Journals."**
**When ON:**
- The original transaction is **NOT zeroed**. It keeps its original amount and is marked **Voided**.
- A **separate reversing journal entry is created, dated on the VOID DATE** — not the original date.
- The journal lines autofill as the exact reverse of the original.
- A **"Void Of"** field links the reversal to the original; the original carries a **"Voided On"**
  date linking forward to the reversal.
- Journal entry forms do NOT show a Void button.
**Hard constraint after voiding:** "you can't make any changes that have general ledger impact to the
original transaction including changing the posting period."
**Why:** it lets you void in a different day or period from the original **without ever altering the
closed period**. Oracle states this design supports closed-period accounting and audit compliance.
**Types it voids this way:** Bill Payment · Payroll Liability Payment · Customer Refund · Tax Payment
· Tax Liability Check. With the preference ON you CANNOT void Sales Order, Estimate, Cash Sale,
Invoice, Return Authorization, Cash Refund or Credit Memo — those are corrected another way.

## 3. McLEOD LOADMASTER and ALVYS — NOT OBTAINABLE PUBLICLY. I AM NOT INVENTING IT.
McLeod's public material states a "fully integrated general ledger" with financial activity
"captured and traceable," and real-time driver settlement access with integrated A/P. It does **not**
publicly document void, reversal, settlement-correction mechanics, audit-trail structure or
duplicate-prevention rules. Alvys' public accounting page is likewise feature-level.
**Conclusion:** the mechanics live behind customer documentation. I will not state how McLeod or
Alvys void a settlement, because I cannot verify it. If the owner wants it, the route is a demo or a
direct request to McLeod (205-823-5100) — not a guess from me.
What IS usable from them is the principle both assert: every financial action traceable, settlements
and billing inside one integrated ledger, no side systems.

## 4. THE RULING — WE FOLLOW NETSUITE, NOT QUICKBOOKS
**And we are already built this way.** `accounting.expenses` carries `journal_entry_id`,
`reversed_by_je_id`, `voided_at`, `void_reason`, `voided_by_user_id`, `status_before_void`,
`reinstated_at`, `reinstate_reason`, `reinstated_from_void_je_id`. That is NetSuite's model, not
QBO's.
**Measured proof it is working:** all **790** voided expenses carrying both a JE and a reversal JE
were checked line by line — original debit equals reversal credit and vice versa on **790 of 790**,
**$0.00 not offsetting**.
So: **CC-1 must NOT replace this with QBO's zero-in-place void.** Correcting my own earlier
instruction — I told CC-1 to build to QBO's standard. QBO is the right model for the *user-facing
words* (void keeps the number, delete removes it from the app but the archive keeps it). NetSuite is
the right model for the *GL mechanics* (original untouched, dated reversing JE, linked both ways).

### THE RULES, FINAL
1. **VOID = original transaction untouched, marked voided, plus a reversing JE dated the VOID date.**
   Never zero a posted transaction in place. Never alter a closed period.
2. **The transaction NUMBER is retained on void.** A voided check keeps its number so the sequence
   stays intact — this is why 1001-1005 stay consumed and the next real check is 1006.
3. **After voiding, no GL-impacting change to the original is permitted**, including its posting
   period. Enforce it in the database.
4. **DELETE removes it from the app; the archive table is our audit log.** Nothing is ever deleted
   without its full pre-image in `archive.*` first. That is QBO's delete semantics, done properly.
5. **Duplicate identity** = `(operating_company_id, vendor_uuid, vendor_document_number,
   transaction_date, total_amount_cents)`, and every decision ALSO records `unit_id`, `load_id`,
   `driver_id`, `payment_type`. Owner ruling: date, vendor, unit, load and amount — many variables,
   never two. A NULL vendor document number means the rows are NOT comparable — human review queue,
   never auto-void. AUTH-089 keyed on (load, amount) and destroyed $132.50 of real charges.
6. **Every void names** WHO · WHEN · WHY from a catalog · the exact superseded row · the reversal JE.
   A void with no named supersede target is itself a defect.
7. **No transaction is ever lost or stuck.** Every expense, bill, bill payment, invoice, receive
   payment and fuel transaction sits in exactly ONE terminal state: posted · draft · voided ·
   in-review-queue · deleted-with-archive. Guard:
   `verify-no-transaction-is-orphaned.mjs`, ratchet to 0.

## SOURCES
- Intuit — Void or delete transactions in QuickBooks Online
- Oracle — NetSuite Applications Suite: Void Transactions Using Reversing Journals
- Oracle — NetSuite Applications Suite: Voiding a Check; Effect of Voiding Applied Payments
- McLeod Software — Billing and Settlements Automation (feature-level only)
- Alvys — TMS Accounting Software (feature-level only)
