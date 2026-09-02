# INBOX-CURSOR · CURRENT ROW · 2026-09-02 16:23 CT

`git pull --ff-only origin/main`

Owner: `docs/bus/OWNER-ORDER-STOP-PURGE-BUILD-ENGINES-2026-09-02.md`
FAST-MERGE: `docs/bus/FAST-MERGE-4MIN-LAW.md`. Never POST. Never seat fixtures.

## NOW

```
CURSOR — LEAD. STAY OFF driver_finance AND DISPATCH MILES (CC-1).

1. Deploy every 5–10 merges. 108 landed since 17:00Z — batch deploy, do not per-merge.
2. Lane: CC-1 owns miles + settlement engines. Do not edit driver_finance. Do not edit dispatch except the one proforma mint move.
3. Build, in order:
   a. Proforma mints at first pickup, not at book (book-load.service.ts ~1938 only).
   b. Company settlement table — does not exist. 8 sections per Settlement 5753. P&L ties to 2415.11 exactly.
   c. GO-06 shared number field on remaining create screens. next-number already exists for loads, invoices, bills, expenses, payments, credit memos, vendor credits. Empty box, hint caption, never auto-fill.
   d. Document memo carries LOAD number in its own field, never the invoice number. Invoices 004–013 say "Load Number - 004" and cannot be traced to a load. TMS memo going forward. No QBO write-back.
4. Do not purge. Do not categorize bank.
```

ACK `CURSOR | ACK | deploy batch · proforma pickup · co settlement · GO-06 · memo=load# · NEVER POST | GO`
