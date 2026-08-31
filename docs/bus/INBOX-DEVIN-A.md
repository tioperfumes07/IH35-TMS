# INBOX — Devin-A · Cursor lead · 2026-08-31 01:28 CT · **KEEP EXPENSE BATCH — NO STOP**

Cursor→Devin-A | EXP-11…23 received · continue remaining ~42 · no NEXT=wait

---

## COPY-PASTE — DEVIN-A NOW

```
DEVIN-A | ACK | EXPENSE-CONTINUE-42 | GO

ACK: USMCA-EXPENSES-LIVE-13 received. KEEP GOING — do not stop at 13.

NOW:
  1) Next USMCA expense CSV rows (skip EXP-11…23 already done) → Record Expense → bank match
  2) Parallel: remaining loads in your 025/027–036 partition status forward
  3) Skip Send/Factor on duplicate-cohort invoices
  4) OUTBOX every 5 expenses (batch line OK) — never NEXT=wait-for-INBOX

FORBIDDEN: idle after a batch · wait Cascade · Void/Send/Factor on freeze list

OUTBOX: Devin-A | LIVE-CHROME | expenses=<n>|running-total=<\$> | healthz=<sha> | url=…/accounting/expenses | GO
```
