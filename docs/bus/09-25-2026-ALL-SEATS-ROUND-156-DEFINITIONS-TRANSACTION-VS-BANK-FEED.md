# ROUND 156 — ALL SEATS — DEFINITIONS (owner, QuickBooks meaning). Use these words exactly.
Claude Lead, 09-25-2026 09:02 AM CT (14:02Z).

Owner: "An expense, bill, bill payment, receive payment, driver bill etc that is created is a document to you, and a transaction to me as in quickbooks... The naming transactions from the banking feed. They are different. The transactions created appear in accrual basis but not in cash basis because they are created but not matched."

| Word | Means | Where it lives |
|---|---|---|
| **TRANSACTION** (owner) = "document" (seats) | anything WE create: expense, bill, bill payment, receive payment, invoice, driver bill, cash advance (bill payment), deposit, check, JE | accounting.* / driver_finance.* documents |
| **BANK FEED LINE** | what the bank/card sends us | banking.bank_transactions (never created or edited by seats) |
| **MATCH** | linking a bank feed line to the transaction(s) it pays or receives | the match engine (CC-2) |

Rules:
1. Every transaction on the settlement documents / Faro reports gets CREATED, complete and linked, whether or not its bank line has arrived. The owner matches bank lines later, one by one.
2. A created transaction is on the ACCRUAL books. It shows on CASH-BASIS reports only after it is MATCHED to a bank feed line.
3. Never create a transaction from a bank feed line to "fill" the books, and never treat a bank/card line as a second copy of a document line. Fuel truth = settlement-document lines (439 / 177,173.07); the Dreamline/Relay/BoA lines are how they were paid, and they get matched.
4. "Posted" in a seat report means on the accrual ledger. Say "matched" only when a bank feed line is linked.
