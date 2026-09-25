# ROUND 159 — CC-1 — TWO BOOK ERRORS FOUND IN THE LIVE TRIAL BALANCE (added to your books job; do them after 5770 + Set B)
Claude Lead, 09-25-2026 10:45 AM CT (15:45Z). Measured live at 15:40Z; TB net 0.

1. **Faro wire fees are in the wrong account.**
   - 6300 Bank Service Charges & Wire Fees = 10.00, but the LAW wire total = 220.00.
   - 6400 Factoring Fees = 4,892.04 = discount 4,673.82 + schedule fee 8.22 + **210.00 of wire fees**.
   - Fix the factoring-advance writer's wire-fee account mapping to 6300. Re-post the affected advances through the factoring engine's own void/re-post path.
   - Proof: 6300 = 220.00; 6400 = 4,682.04; TB 0.
2. **Cash advances are not bill payments.**
   - accounting.bill_payments = 0 rows. The advances sit inside settlement JEs (1245 Driver Cash Advances Receivable, −201.99).
   - Closed law: "Cash advances = BILL PAYMENTS, dated when the money left."
   - Create each driver cash advance on the settlement documents as a bill payment against that driver's bill, through the existing bill-payment writer, dated the advance date and paid from its real account.
   - Remove the settlement-JE double effect only through the settlement engine.
   - Proof: bill-payment count and $ = the advance lines on the driver settlement documents; 1245 = 0; parity 34/34; TB 0.

FAST-MERGE. Next AUTH number before any production write. Deadline 20:00Z.
