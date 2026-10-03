# ROUND 374 — ALL SEATS — THE PRE-PURGE BASELINE IS MEASURED, AND THE FIVE WRONG-SIGN ACCOUNTS NOW HAVE AMOUNTS
Lead · 2026-10-03 21:37Z · measured by the Lead, DIRECT endpoint, `ih35_ci_readonly`, BEGIN READ ONLY, USMCA only

365.5 is built and run. New script, committed: `scripts/lead-pre-purge-baseline.mjs`. Output committed to
`docs/audit/2026-10-03-PRE-PURGE-BASELINE-USMCA.md`. Every number below is **derived from
`accounting.journal_entry_postings`** — no stored total is read anywhere.

---

## 374.1 — THE BASELINE

```
TRIAL BALANCE
  debits       2,178,029.25
  credits      2,178,029.25
  difference           0.00   — BALANCED
  postings             7,909

CHART OF ACCOUNTS       217 accounts, zeros included
LINEAGE                 3,908 postings with no spine link · 0 postings carrying load_id
```

**The book balances exactly, and it has balanced across every chart-of-accounts move made today.** That is
the "before" side of the control: after the re-upload, the same documents must reproduce this trial balance.
Every difference is named per account with its cause. **No plugs. Ever.**

## 374.2 — THE FIVE WRONG-SIGN ACCOUNTS, WITH THEIR AMOUNTS. EACH ONE IS EXPLAINED BEFORE THE PURGE.

The family is bounded at exactly five and now carries numbers:

| Account | Type | Natural | Actually holds |
|---|---|---|---|
| **1090 Undeposited Funds** | Asset | debit | **credit 151,736.34** |
| **1295 Relay Fuel Wallet** | Asset | debit | **credit 33,839.80** |
| 2100-00-002 Neftali Coronado Urbano — Driver Escrow | Liability | credit | debit 50.00 |
| 2100-00-004 Rafael Rogelio Rivero Reynoso — Driver Escrow | Liability | credit | debit 25.00 |
| 2100-00-027 Jorge Luis Infante Corona — Driver Escrow | Liability | credit | debit 150.00 |

A wrong side is not automatically an error — a contra account belongs there by design. **These five are not
contra accounts.** Each one is explained, with its writer named, before the purge, because **a sign that is
wrong today comes back the moment the same data is re-entered.**

### 1090 Undeposited Funds, credit 151,736.34 — CC-2

An asset holding a large credit means **more was swept OUT of Undeposited Funds than was ever put IN.**

The hypothesis to test first, because it fits exactly: `sweepMatchedReceiptToBank` posts a deposit **at match
time** (LAW 363.6, one of the six match-time posters in 369.4). It credits 1090 to move money to the bank —
but the matching **debit** to 1090 only exists if a receive-payment put the money there first. Where the
payment went straight to the bank, or where the sweep fired on something that never sat in Undeposited Funds,
the credit lands with no debit behind it.

**Prove or disprove it.** Count 1090's debits and credits separately, by `source_transaction_type`, and name
the writer on each side. If the credits come from the sweep and the debits do not come from
`customer_payment`, the hypothesis holds and **369.4's deposit document is the fix** — the deposit exists
before the bank line is matched to it, and the match posts nothing.

### 1295 Relay Fuel Wallet, credit 33,839.80 — CC-2

A prepaid fuel wallet is an **asset**: we fund it, then draw fuel against it. A credit balance means **more
fuel was expensed against the wallet than was ever funded into it** — the draws post and the funding does
not, or the funding posts somewhere else.

Relay fuel ingest is yours and you rebuilt it this session (#24627). Count the two sides, name the writer on
each, and say whether wallet **funding** has a posting path at all. **If it does not, that is the finding**,
and it is a real asset that the book currently says we owe rather than own.

### The three driver escrows, debit 225.00 total — CC-1

An escrow is money **held in trust for the driver**. A debit balance means **we released more than we held**
for that driver — the account says the driver owes us his own escrow.

Owner's closed law: the driver escrow is the **Driver Damage** account, one per driver, where the **$25
deductions** go. The amounts are 50.00, 25.00 and 150.00 — **exact multiples of 25**, which says these are
whole deductions released that were never collected, not a rounding artifact.

Migration `202615340100` already refuses escrow **over-release**. These three predate it. Name the release
that put each one negative, correct it through **reverse → void**, never a hand-written adjustment, and
confirm the refusal blocks a repeat. 2100 is the hub; the per-driver sub-accounts are `2100-00-nnn` and the
**GL is the only escrow balance** — the two stored tables that disagreed are not consulted.

## 374.3 — AND A STORED BALANCE IS SITTING IN THE CHART OF ACCOUNTS

While reading the shape of `catalogs.accounts` I found three columns that store what must be derived:

```
opening_balance_cents · opening_balance_qbo_snapshot_cents · opening_balance_adjustment_cents
```

Under the store-versus-derive law, **case 1 is absolute: a GL account balance is always derived, never
stored.** An opening balance is the one legitimate exception — it is a **point-in-time record** (case 3),
true on a date, and QBO stores it the same way. So the columns may stay, with two hard conditions:

- **Nothing may add them to a derived balance.** If any surface shows opening balance + postings as one
  number, that is the second system and it is removed. CC-2: check this in the reclassify register before
  it ships, because that register is where the owner will be reading balances.
- `opening_balance_as_of` must be set wherever a balance is non-zero. **A stored opening balance with no
  as-of date is not a point-in-time record. It is a floating number**, and it is exactly what the law
  forbids.

**CC-2 owns the check. Required value:** the count of accounts with a non-zero stored opening balance and no
`opening_balance_as_of`, and the count of surfaces that add the stored opening balance to a derived total.
**Both should be 0.** If either is not, say so.

---

**The baseline is re-measured at the moment of the purge, not read from this file.** This run is the
rehearsal and the shape; a number from hours earlier is not a baseline. The script is committed and takes one
command.
