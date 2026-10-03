# ROUND 379 — CC-2 — THE OWNER IS RIGHT ABOUT THE BANK, THE THIRD BUCKET DOES NOT EXIST, AND THE 1295 FUNDING MAY BE SEVEN LINES AWAY
Lead · 2026-10-03 · measured on the DIRECT endpoint, USMCA, BEGIN READ ONLY

Owner: *"the bank does not have any categorized transactions."* **He is right, and the screen is honest here.**
Measured per account:

```
bank account              bucket        lines
USMCA FREIGHT             for_review      508      ← Bank of America. ZERO categorized.
Dreamline Diesel Card     for_review      397      ← ZERO categorized.
Relay Fuel Wallet         categorized      69
Relay Fuel Wallet         for_review        7
                                          ----
                                           981
```

**Every one of the 69 categorized lines in the whole company is a Relay fuel line.** Bank of America and
Dreamline have none at all. So whichever of those two the owner was looking at, an empty Categorized tab is
the truth — **this is not another 367.1.** Worth saying plainly after a day of screens that lied: this one
did not.

---

## 379.1 — DEFECT: THERE IS NO `matched` BUCKET. MATCHED LINES ARE FILED AS CATEGORIZED.

```
review_bucket      for_review 912 · categorized 69          ← two values
resolution_kind    (null)     912 · matched      69          ← all 69 are MATCHED
matched_*          matched_relay_fuel_transaction_id  69     ← one column, 69 rows
```

**All 69 "categorized" lines have `resolution_kind = 'matched'`.** They were matched, not categorized, and
they are sitting in the Categorized bucket because **the third bucket does not exist in the data at all.**

That contradicts the contract and the owner's own words. He defined it himself:

> *"Matched bucket shows the categorized transactions that were matched to a created document."*

Three tabs, exactly as QBO: **For Review · Categorized · Matched**. We have two.

- `review_bucket` gains its third value, and a **matched** line sits in **Matched**, not Categorized.
- `review_bucket` says **where it sits**; `resolution_kind` says **how it got there**. They stay distinct —
  a status with two sources is never measured by one column — and `resolution_kind = 'matched'` with
  `review_bucket = 'categorized'` is exactly the contradiction that proves they are being conflated.
- **STATUS-SET-WITHOUT-ITS-GATE:** neither column is written directly. Every transition goes through the
  state-machine service.
- **Required value:** 0 lines where `resolution_kind = 'matched'` and `review_bucket <> 'matched'`.
- **Guard:** extend `verify-bank-line-buckets-are-the-three-tabs.mjs` — the name already says three.

## 379.2 — AND THIS IS WHY 1295 IS NEGATIVE. THE FUNDING MAY BE SEVEN LINES AWAY.

Follow the chain:

1. **69 Relay lines are matched** → each created or matched a **fuel expense** → each **credits 1295** and
   debits 5000. That is the 128 draws totalling 36,067.97 from ROUND 375.
2. **Not one line anywhere debits 1295 from a funding event**, which is why the wallet shows a **credit
   balance of 33,839.80** on an account that should show what we own.
3. **The Relay Fuel Wallet bank account has 7 lines still in For Review.**

**Those 7 are the first place to look for the funding.** A wire that tops up the Relay wallet appears on the
feed as money leaving Bank of America and arriving at Relay. Open them, say what they are, and if any is a
top-up then the categorize path for it is the missing posting: **debit 1295, credit the bank the wire left
from.**

If the 7 turn out to be something else, then wallet funding never reaches the feed at all and that is the
finding — report it, because it means we are drawing down an asset we never recorded receiving.

**Required value:** each of the 7 named with what it is; 1295 holds a **debit** balance equal to funding minus
draws; and it ties to **Relay's own wallet balance** on the date, with any difference named and labelled as
theirs. **Never plugged.**

## 379.3 — 905 LINES IN FOR REVIEW ARE WHAT THE OWNER RE-MATCHES AFTER THE PURGE

508 Bank of America + 397 Dreamline, all For Review, plus 7 Relay. **That is the owner's re-match queue**,
and it is exactly why 366.1 preserves the bank lines rather than deleting them: they are the bank's record,
not ours, and they are the only independent evidence that the money moved.

So the state is healthy for the reset — **the lines are there, clean, and waiting.** What must be true before
he re-matches:

- the **three buckets** exist (379.1), or his matched lines land in the wrong tab from the first one
- a **match posts nothing** (LAW 363.6 / 368.2(a)) — otherwise re-matching 905 lines writes 905 wrong postings
- a line cannot sit **matched with nothing matched** (368.2(b))
- **1090 is refused to anything but a customer payment and a deposit** (378.7), or the categorize path refills
  it the same way it did before

**Order for you:** 379.1 the third bucket → 379.2 the seven Relay lines → the 1090 counterparty refusal →
then your reclassify register and the Faro unmatch cascade.

## 379.4 — AND THE `status` COLUMN IS A THIRD OPINION

```
status    pending_categorization 781 · uncategorized 200
```

Neither value agrees with the 912/69 split in `review_bucket`, and **781 + 200 = 981 across a different
cut entirely.** Three columns now describe the same line's state: `review_bucket`, `review_state` and
`status`. Two of them agree; the third does not.

**Say what `status` is for, or retire it.** A third opinion about where a line sits is a second system by
another name, and the owner has already ruled that one of those is one too many.
