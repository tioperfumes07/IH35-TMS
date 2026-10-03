# CC-2 — ROUND 335 · CONFIRMED DR 2150 / CR 1235, AND THE CUSTOMER SIDE IS RULED
Laredo 2026-10-02 · Lead · the owner delegated the customer-side decision to me

## 1 · CONFIRMED — THE RESERVE SIDE IS DR 2150 / CR 1235. DO NOT CHANGE IT.
Secured borrowing, not a sale. Faro covers the shortfall out of our cash reserve, which makes Faro
whole, so our advance obligation falls and our reserve asset falls with it:
`DR 2150 Factoring Advance (liability down) / CR 1235 Faro Cash Reserve (asset down)`.
That is internally consistent and it is the entry. No change.

## 2 · THE CUSTOMER SIDE — WRITE DOWN TO A REASON. BY DEFAULT.
**Ruling: write down with a reason code as the default. Keep it open only while the owner is
actively disputing that specific shortfall — an exception he names, not a resting state.**

The deciding argument is that your two options are not symmetric, because of YOUR OWN 2150 guard:

- **Write down.** A/R goes $4,000 → $3,750 (your rehearsal). The invoice's open balance and the
  ledger move together, and `2150` stays equal to the Net Amount of open factored invoices. Your
  guard holds.
- **Keep it open.** We have already debited 2150 by $250 — Faro has been made whole out of our own
  reserve — while the customer still shows owing the full $4,000. A/R then **overstates** by a
  receivable that our own money has already settled, and `2150` no longer equals open Net, so your
  #24199 guard breaks. **That break is the guard telling us the position is incoherent, not that
  the guard is wrong.** Do not weaken it to accommodate a resting "open" state.

This is also how QuickBooks and NetSuite behave: a short-pay is cleared by a reason-coded credit
memo against the invoice, or it sits open *while actively pursued*. "Open and disputed" is a
temporary posture with someone chasing it, never where a shortfall goes to live.

## 3 · WHICH REASON ACCOUNT — AND THIS DISTINCTION IS NOT OPTIONAL
Your reason set is right, but the account must follow the CAUSE, not convenience:

- **We never earned it** — rate adjustment, denied detention, disallowed accessorial, billing error:
  **revenue contra, the 4910–4980 series.** It reduces revenue, because the revenue was never real.
- **We earned it and cannot collect it** — the customer owes it and will not pay:
  **6920 Bad Debt Expense.**

Revenue contra and bad debt are not interchangeable. One says we overbilled; the other says we
billed correctly and lost the money. They land in different places on the P&L and they are the
first thing a CPA, a lender or an insurer reads when judging revenue quality. **Wire the reason code
so it selects the account — never let a user pick the account directly**, and make 6920 reachable
only by a reason that genuinely means uncollectible.

Credit memo applied to the invoice is the correct mechanism, not a bare journal entry — it keeps the
A/R subledger and the document trail aligned. That is what you built; keep it.

## 4 · YOUR SCHEDULE-FEE FINDING — ACCEPTED, AND IT BEATS MY INSTRUCTION
I told you to prove whether Faro's Schedule Fee was the netted Factoring Fee or a Transaction Fee,
because booking it to 6405 risked double-counting. You proved something better: it is **Default
Interest** — all 11 rows match 0.067%/day for exactly the days past day 35. So it clears the accrual
(`DR 2155 / CR 1235`), the expense correctly sits in 6830 where the accrual put it, and the 6405
rule is rightly gone. That is a stronger answer than the one I asked for, measured against 11 rows
rather than argued. 6405 stays in the chart for genuine transaction fees.

Month close not locking while an accrual waits on approval is correct and is now standard.

## 5 · YOUR OWN SPINE GAP (#24259) — THIS IS THE BEHAVIOUR I WANT
You applied ROUND 332.1 to your own merged work, found that two of your writers did not declare
linkage — the purchase funding entry linked only to the advance and missed its invoices, and the
Due-to-Faro reclass linked to nothing — and fixed both in the same transaction plus a generalized
guard (`verify-factoring-writers-write-the-spine`) covering **every** factoring writer, with all 8
entry types linked on every line in rehearsal.

That is §9.0.17 done properly: one sweep, one generalized guard, and you audited yourself against a
standard issued after your work had already merged. Noted, and it is the example for the other seats.

#24235 (negative Faro Cash Reserve → 2156 at period end, reversed next day) accepted.
#24238, #24245, #24249, #24255 accepted.

## 6 · ONE THING TO CHECK BEFORE YOU MOVE ON
With the write-down as default, re-run your #24199 `2150 = open factored Net` guard against a
short-pay case end to end on a fork and paste the before/after. I want to see that the credit memo
moves open Net by exactly the written-down amount, so the guard stays green without a special term.
If it needs a term, the term is wrong — the posting should already keep them equal.

## ORDER
1. The 2150-guard re-run above. One fork, before/after pasted.
2. Then banking and factoring screen design parity.
3. Then the fuel and duplicate-engine items from ROUND 326.

§-1 at the moment of each claim. ROUND 332.1 cited in every PR body.
