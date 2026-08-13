# PASTE → CC-1 (money)

FINDING context: MATRIX surface inventory complete — new money columns `invoice` + `bank` (+ liability/gl_je still open).

**NOW**
1. Pull `origin/main` after Cursor matrix inventory PR merges.
2. Continue Wave C on **P10 then all modules** for `gl_je` · `ap_bill` · `expense` · **`invoice`** · **`bank`** · `liability`.
3. New Required leaves (Expense/Bill/BillPayment/Match/Categorize modals etc.) owe money columns — wire writers, do **not** mark Built without guard.
4. OUTBOX one-liner: `column=<id> | Built=+N | NEXT=…`
5. Do **not** invent load FKs on historical fuel (pre-operational law).

Forbidden: claiming module complete; backfill QBO history into GL.
