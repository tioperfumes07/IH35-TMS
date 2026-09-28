# CC-2 · ROUND 172 · CHECK CREATOR, FULL QBO WRITE-CHECK PARITY
Issued 09-25-2026 14:47 CT (19:47 UTC) by Claude-Lead. **Deadline: 09-26-2026 02:00 UTC.** If it is missed, Codex takes the surface.
Read first: `~/Downloads/09-25-26-handoff/00-READ-FIRST-HANDOFF-09-25-26.md` §0 (the laws). Branch: `claude/r154-check-engine-cc2-build`. USMCA only.

## FOLLOW THESE STEPS IN ORDER. Do not skip or reorder. Paste the proof for each step.
1. **Entry points.** Add "Check" to `Topbar.tsx` + Create (about line 272, under Vendors, exactly like QBO) → `pages/accounting/checks/CheckCreatePage.tsx`. Also add it to the Expenses list "New transaction" dropdown and the vendor/driver profile "New transaction" menu.
   Proof: a screenshot of each menu.
2. **Header, as in QBO Write Check:**
   - Payee: a vendor, driver or customer search.
   - The payee's mailing address auto-fills and stays editable.
   - Bank account: a dropdown of bank-type accounts only, showing the LIVE balance under it.
   - Payment date: defaults to today, CT.
   - Check no.: the next number per bank account, editable.
   - Print later checkbox: when ticked, the Check no. field reads "To print".
   - Tags.
   - Operating company: fixed to USMCA.
   - Proof: the screen.
3. **Category details grid:**
   - Columns: # · Category (chart of accounts, number hidden per R-83) · Description · Amount · Billable · Customer.
   - PLUS the linkage columns: Load · Driver · Truck (unit) · Trailer (`mdata.equipment`) · Work order.
   - Buttons: Add lines · Clear all lines · delete a row.
4. **Item details grid:**
   - Columns: Product/Service (item → `default_expense_account_id`) · Description · Qty · Rate · Amount · Billable · Customer, plus the same linkage columns.
   - Collapse the grid when it is empty, as QBO does.
5. **Right drawer: open bills.**
   - When the payee has open bills (vendor bills or driver bills in `driver_finance`), show them in the drawer with an "Add" button.
   - Adding a bill turns the check into a Bill Payment (Check). This is how cash advances and settlement pay post (owner rule: advances are bill payments).
   - Partial payment is allowed. The bill goes to Partial or Paid.
6. **Footer:**
   - Memo, Attachments (`docs.files`) and the Total.
   - Buttons: Cancel · Clear · Print check · Save · Save and new · Save and close.
   - Warn on a duplicate check number for the same bank account.
7. **Posting.** Use the existing `postSourceTransactionInClientTx` only; write no new poster.
   - Cr the bank for the total.
   - Dr each category line to its account, and each item line to the item's account.
   - A linked bill posts Dr A/P (or the driver payable) and Cr the bank.
   - Every JE line carries the load, driver, unit, trailer and work order it came from.
   - After posting, READ the JE back and assert Dr = Cr and the accounts are correct (the engine is idempotent and can return stale JEs).
8. **Actions after saving (the More menu):**
   - Void: keeps the record, zeroes it, stamps `voided_at` and reverses via `reversePostedSourceTransactionInClientTx`.
   - Copy.
   - Transaction journal.
   - Audit history (`appendCrudAudit` on create, edit and void).
   - Editing a posted check reverses it and reposts.
9. **Print checks queue** (Print later checks):
   - Pick the bank account and the starting check number.
   - Check style: voucher, standard or wallet.
   - Print a PDF, then confirm it printed, which assigns the numbers.
10. **Where the check must appear:**
    - vendor/driver transactions;
    - the bank register, uncleared, for later matching to the bank feed (NEVER write `banking.bank_transactions`);
    - the expenses list;
    - load costs, if it is linked to a load;
    - the driver bill (as paid);
    - the GL and the trial balance.
11. **Guard:** `scripts/verify-check-engine-parity.mjs`. It proves:
    - every check has a balanced JE;
    - the bank is credited;
    - no check credits A/P;
    - numbers are unique per bank account;
    - void has a reversal;
    - linkage is present.
12. **Patch and merge.**
    - Apply `~/Downloads/09-25-26-handoff/patches/purge-window-state-10-arms.patch`.
    - FAST-MERGE with the DoD template.
    - Paste the PR number and the Render deploy id.
13. **Owner test.** The owner creates ONE real check in Chrome. You then paste:
    - the check row;
    - its JE lines;
    - the bank register row;
    - the bill status, if one was linked.

    Only then is it DONE.
