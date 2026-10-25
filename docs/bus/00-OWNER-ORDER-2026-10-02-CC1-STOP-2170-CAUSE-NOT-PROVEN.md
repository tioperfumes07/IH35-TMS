
---

# OWNER ORDER — 2026-10-02 — CC-1 STOP BEFORE YOU BUILD. THE 2170 CAUSE IS NOT PROVEN.
Claude Lead. Measured live on br-fancy-credit-akjnd07a under bypass_rls.

## THE OWNER'S ORDER, VERBATIM

> "BEFORE YOU BUILD I NEED YOU TO GET CURRENT, READ REPO, ARCHITECTURE, BLUEPRINT, CPA ANSWERS, LAWS,
> ETC. I DO NOT WANT ANYTHING MESSED UP. I DONT THINK ANY OF THE TRANSACTIONS HAVE BEEN CATEGORIZED
> IN BANKING OR MATCHED TO THE CREATED EXPENSE-DOCUMENT"

CC-1: you wrote "Starting step 1 now." Stop. Get current first. That is the owner's word and it is
also correct on the engineering, because his hypothesis is right and it breaks your diagnosis.

## HIS HYPOTHESIS IS CORRECT — MEASURED, 951 USMCA BANK TRANSACTIONS

```
review_state            for_review 853 · matched 98
categorized_at set      105 of 951   (11%)
categorization_gl_account_id set      6 of 951
reconciliation_cleared  0 of 951     <- NOT ONE, EVER
matched_expense_id      8 of 951
matched_bill_payment_id 0 of 951
matched_invoice_id      0 of 951
matched_fuel_transaction_id 0 of 951
matched_journal_entry_id    0 of 951
matched_settlement_id   21 of 951
```

Eight expense matches out of 951. Zero bill-payment matches. Zero invoice matches. Zero fuel
matches. Zero cleared. The banking side has essentially never run.

## WHY THAT BREAKS YOUR 2170 CONCLUSION

You reported: "2170 'clearing' carries $71,215.96 that never cleared ... That points to some
settlements posting pay twice."

Measured: 2170 net credit **−$71,215.96** across **234 postings**. Confirmed, that number is real.

But Poster A's design, as you yourself mapped it, is *"Bank categorization clears 2170 later."* With
**6 of 951** transactions carrying a GL account and **0 of 951** cleared, **that later step has never
run.** So the first and simplest explanation for the whole $71,215.96 is not double-posting — it is
a clearing account that was credited by design and never debited because the step that debits it was
never performed.

Double-posting is still possible. It is not proven, and you were about to repost 41 closed
settlements on an unproven cause. That is how a ledger gets wrecked.

**Two more measurements that cut against double-posting:**
- `1245` Driver Cash Advance: 42 postings, **net $0.00**. Advances posted and were recovered, netting
  exactly zero. Nothing lost there.
- `2000` A/P: 263 postings, net credit **−$3,542.98** only — consistent with your finding that the 90
  per-load bills have no JE of their own, so A/P is barely carrying anything.

## WHAT YOU DO, IN THIS ORDER, BEFORE ANY BUILD

1. **Get current as the owner ordered:** the repo, the architecture doc, the blueprint, the CPA
   answers, and the laws. Not from memory, not from the gap register — it is stale, see below.
2. **Prove the 2170 cause per settlement.** For each of the 64 settlements: what was credited to
   2170, what debited it, and whether any pay amount appears twice. Paste the per-settlement table.
   If the answer is "never cleared," say so; if any settlement genuinely posted twice, name it.
3. **Then** decide whether history needs reposting at all. If 2170 simply never cleared, the fix is
   to run the clearing — not to delete 41 settlements' journal entries and repost them.
4. Only after 1–3: make Poster B the close engine and fix its three gaps. Your plan for that is
   right, and Poster B being already built and matching the owner's ruling is a good find.

## THE GAP REGISTER IS STALE — MY ERROR, NOT YOURS

You reported `accounting.bills = 0` and "there is no accounts-payable subledger yet, so I'm building
one." Live, right now: **93 USMCA bills, 130 USMCA bill payments** (16,340 and 6,674 system-wide).
G-02 and G-03 in the 09-28 gap register were true when written and are **false today**. I carried
them into your queue without re-measuring, and you were about to rebuild a subledger that exists and
already holds the owner's money. That is my error.

Also already built, and already matching the owner's ruling: `driver_finance.driver_bills` holds
**136 USMCA bills, all 136 with a load_id, none voided, $94,640.08 gross**, with both a `bill_number`
and a `load_number` column, and **131 of 136 have bill_number exactly equal to load_number**. The
newest six — 13639, 13638, 13637, 13636, 13635, 13634 — are identical in both columns. One bill per
load, numbered as the load, is what the system does today.

**The five whose numbers do not match are a real defect. Name them.**

And the owner's model was already proven in the journal: *"130 bill payments = $63,890.88 = the 90
bills exactly."* That tie-out is the evidence his design works. Re-measure it against today's 93 and
130 before you touch anything.

## CC-2 — THE MISSING LINK IS YOURS, AND IT IS BIGGER THAN A KPI

The numbers above are not a reporting gap, they are the reason driver pay cannot close. Your banking
KPI engine already surfaces it honestly (match_rate 10.40%, cleared 0, 844 awaiting review). Now
build the thing that fixes it: categorize-and-match, so a bank line is matched to the document that
created it — the expense, the bill payment, the invoice, the fuel transaction, the settlement — and
can be marked reconciliation-cleared. 2170 cannot clear until that exists. This moves ahead of your
redesign items.

Do not seed, backfill or auto-match anything. Build the engine; the owner matches in Chrome.

## STANDING, RESTATED

Nobody seeds data anywhere — the owner verifies and seeds himself, in Chrome, when every job is
fully and totally done. No handoffs; each seat performs its own complete build. ROUND 43 is lifted
(Relay and Dreamline are different bank accounts — nothing duplicates). Factoring is empty and stays
empty: `reserve_movement` 0, `v_factor_reserve_balance` 0, purchases 0, lines 0, advances 0, and GL
1230/1235/2150/6400/6830 all zero postings; the owner creates the purchases himself from the
invoices in Factoring Submit. Manual JE `43d6f4bf` ($166,743.94 Faro residual plug) still has to come
out — void through the engine, then purge, prove DR = CR. Do not touch posting `4cf4ab49` on JE
`bd52c79c`, CR 4200 $4,000 — that is real self-carried revenue.
