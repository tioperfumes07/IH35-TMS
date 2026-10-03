# ROUND 378 — ALL SEATS — THE POSTING MAP, MEASURED FROM THE LEDGER ITSELF, AND THE FIVE DEFECTS IT EXPOSES
Lead · 2026-10-03 · every debit and credit on USMCA grouped by source document type and account
Full output committed: `docs/audit/2026-10-03-MEASURED-POSTING-MAP-USMCA.txt`

365.2 asked each seat to declare what every document type posts. **This is the answer read off the ledger
instead of declared** — what the engines actually did, not what anyone believes they do.

---

## 378.1 — `fuel_event` IS EXACTLY THE SHAPE I FIXED, AND NOW IT IS COUNTED (CC-2)

```
### fuel_event
   Dr  5000  Fuel & Diesel          207   108,602.28
   Cr  1090  Undeposited Funds      207   108,602.28
   Dr  1090  Undeposited Funds       48    16,485.10
   Cr  5000  Fuel & Diesel           48    16,485.10
```

**207 perfect pairs: debit Fuel, credit Undeposited Funds.** Not a scattering — the poster did this every
single time. The 48 in the other direction are their reversals.

That is ROUND 377.1 confirmed from the data side. The fix is in `claude/r377-fuel-credit-and-posting-writers`:
cash fuel now resolves `operating_bank` and the `cash_like` fallback is deleted. **The 207 still have to be
reversed and voided through the engine.**

## 378.2 — THE 166,868.94 PLUG IS A HAND-WRITTEN BANK DEPOSIT (CC-1)

```
### manual_je
   Dr  1000  Bank of America - Operating (USMCA)    3   167,070.93
   Cr  1090  Undeposited Funds                      2   166,868.94
```

Someone recorded, **by hand**, a **167,070.93 debit to the bank** against a **166,868.94 credit to
Undeposited Funds**. In plain terms: *a deposit*. Money moved from the holding pen into the bank.

**Two things are wrong with that and they are different wrongs.**

1. **A deposit is a document, not a journal entry.** This is exactly the Deposit engine that 373.4 says is not
   built. The document would have carried which receipts it deposited; the journal entry carries nothing.
2. **Undeposited Funds never held that money.** Its only real debits are **7 customer payments totalling
   15,507.60**. You cannot deposit 166,868.94 out of an account that received 15,507.60 — and the credit side
   of the pairing was being supplied by the fuel bug (378.1), which was crediting 1090 for every fuel
   purchase. **So the plug was almost certainly written to make a bank balance tie while the real cause was a
   mis-posted fuel credit.**

**That is the whole anatomy of a patch**: a symptom made to balance by hand, while the writer that caused it
ran for another ten weeks. It is the clearest example of what the owner means by "no patches, only permanent
fixes", and I want it named in the blueprint as such.

**Required:** name what the 167,070.93 bank debit actually represents — real cash that arrived, or a balancing
figure. **If the bank truly received it, the credit belongs to whatever was really paid, not to Undeposited
Funds.** Reverse and void; never adjust with a third entry.

## 378.3 — ESCROW RELEASES CREDIT UNDEPOSITED FUNDS (CC-1)

```
### escrow_account
   Dr  2100-00-nnn  (eight driver escrow sub-accounts)   16     500.00
   Cr  1090         Undeposited Funds                    16     500.00
```

Releasing a driver's escrow debits his escrow — correct — and credits **Undeposited Funds**. Wrong for the
same reason as the fuel: releasing escrow pays the driver, so the credit belongs to the **bank** he was paid
from, or to **2170 Driver Net-Pay Clearing** if it is settled through his pay.

**And these 16 are the same releases CC-1 traced to `escrow/service.ts:370`** — the ones that released $25
deductions that had already been voided. One defect, two visible faces: the wrong counterparty here, the
negative escrow balances in ROUND 374.

## 378.4 — EXPENSES DEBIT THE BANK 611 TIMES (CC-2)

```
### expense
   Dr  1000  Bank of America - Operating (USMCA)   611    30,160.17
   Cr  1000  Bank of America - Operating (USMCA)   853    42,358.04
```

An expense **credits** the bank — money leaves. 853 do that correctly. **611 postings debit it**, which means
money came back: a refund, a reversal, or a sign error.

Reversals explain some, not necessarily 611. **Split them: how many of the 611 carry `reversal_of_line_id`?**
Those are reversals and are fine. **The remainder are a sign defect and must be named one by one.**

## 378.5 — `9000 Ask My Accountant` IS CARRYING REAL MONEY (CC-1 · CC-2)

```
expense        Dr 9000   60   2,976.63      Cr 9000   60   2,976.63
journal_entry  Dr 9000   64   3,631.73
manual_je                                   Cr 9000    4     655.10
```

9000 is the `uncategorized_expense` role — QBO's "Ask My Accountant". **It is a question, not an account**, and
every balance in it is something the engine could not classify.

**Before the purge, each of the 60 expense rows and 64 journal-entry rows is categorized or named.** The owner
is about to re-upload the same data, so whatever sent them to 9000 sends them there again. And this is exactly
what the reclassify tab is for — **9000 is where the owner's first reclassify batch should land.**

**CC-2:** when you validated your register against production you mentioned "the 9000 discrepancy case". That
is this account. Do not special-case it in the UI — report the number and the cause.

---

## 378.6 — WHAT THE MAP CONFIRMS IS **CORRECT**, AND IT IS WORTH SAYING

Not everything is broken, and a measurement that only lists faults is not a measurement:

| Document type | Posts | Verdict |
|---|---|---|
| `customer_payment` | Dr 1090 Undeposited Funds / Cr 1100 A/R | **Correct. Textbook QBO.** |
| `driver_cash_advance` | Dr 1245 Advances Receivable / Cr 1000 Bank | **Correct.** |
| `load` | Dr 1150 Unbilled Revenue / Cr 4000 Freight Income | **Correct accrual.** Revenue earned at delivery. |
| `invoice` | Dr 1100 A/R, relieving 1150 | **Correct**, and it pairs with the `load` accrual above. |
| `driver_settlement` | Dr 6890 Cost of Labor / Cr 2170 Net-Pay Clearing, escrows, 1245 | **Correct shape.** The per-load split (372.5) is what is missing, not the accounts. |
| `bill` | Cr 2170 for driver bills, Cr 2000 A/P for vendor bills | **Correct** — driver bills clearing through 2170 is the owner's design, already ruled. |

**The accrual chain is right.** Load earns revenue into Unbilled, the invoice moves it to A/R, the payment
moves it to Undeposited Funds, and a deposit should move it to the bank. **Four of those five steps work. The
fifth — the deposit — does not exist, which is why someone wrote it by hand (378.2).**

## 378.7 — THE ONE SENTENCE THAT EXPLAINS FOUR OF THE FIVE DEFECTS

**Undeposited Funds is being used as a general-purpose cash clearing account.** Fuel credits it, escrow
releases credit it, a hand-written plug debits out of it, and only 7 of its 440 postings are the customer
payments it exists for.

1090 is bound to **two roles** — `undeposited_funds` **and** `cash_clearing` — and that is the root of the
root. **A poster asking for "cash clearing" gets Undeposited Funds.** Those are not the same account and they
must not share one.

**Permanent fix, and it closes 378.1, 378.2, 378.3 and most of 378.4 at once:**

1. **Unbind `cash_clearing` from 1090.** If a real clearing account is needed, it is its own account with its
   own number. **One role, one meaning.**
2. **A database refusal: 1090 accepts a debit only from a `customer_payment` and a credit only from a
   `deposit`.** Two counterparties, enforced by the ledger, not by code review.
3. **Build the Deposit document (373.4)** so the fifth step of the chain exists and nobody has to write it by
   hand again.
4. Then reverse and void what the old writers produced — **through the engine, never a second journal entry.**

**Required value:** 1090 holds only `customer_payment` debits and `deposit` credits; its balance is a **debit**
or zero; the refusal proven by attempting a violation and being refused.

**Guard:** `verify-undeposited-funds-has-only-two-counterparties.mjs`.
