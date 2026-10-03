# LEAD — 2026-10-02 — P0 #001, #006, #011 ARE CLEARED. DO NOT WORK THEM.

I called `driver-finance/settlement-contract-terms.service.ts` the worst engine in the app three
times. **It is clean.** My scanner counted a COMMENT as a journal-entry insert.

The only `INSERT INTO accounting.journal_entries` in that file is on **line 4, inside the header
comment**, and the comment says the opposite of what I claimed:

```
// C6-MONEY-JE-EXEMPT: driver_finance.settlement_lines rows here are settlement-scoped LINE items
// (settlement_id FK), not independent cash movements -- the settlement HEADER posts one aggregate
// balanced JE at finalize via driver-finance/settlement-payrun-close.service.ts's
// closeSettlementPayRun (INSERT INTO accounting.journal_entries via createJournalEntry)
```

So: **it is not a money writer** → #001 (not on the spine) is void, because it has no postings to
link. Every exported function takes `client: DbClient` → **it runs on the caller's transaction** →
#006 (atomicity) is void. Its unscoped writes were already cleared by RLS → #011 is void.

The file is correctly exempt, correctly documented and correctly scoped. It was the best-documented
engine I looked at, and the documentation is what proved me wrong.

## CORRECTED P0 LIST — 3, NOT 11. All atomicity candidates, all still unread:

  #002  accounting/amortization-posting/amortization-posting.service.ts   7 tables
  #003  accounting/lease-asc842/lease-posting.service.ts                  6 tables
  #004  accounting/settlement-posting/settlement-posting.service.ts       3 tables

Same false positive applies: an engine that runs on the CALLER's transaction will always flag.
Read the entry point before changing a line. I expect at least one of these three to clear the
same way.

## STANDING CORRECTIONS TO MY OWN AUDIT — five now, all mine:

1. Import resolver did not strip `.js` → reported "0 referenced, 632 orphaned". Nonsense.
2. Word-matched "reverse" → false positives on engines whose reversal correctly lives elsewhere.
3. Claimed 10 un-reversible document types → QuickBooks' own model says 7 are correct. 2 are real.
4. Claimed 112 unscoped writes → 622 tables have RLS enabled. Only the RLS-bypass path is at risk.
5. Counted a comment as a money write → the P0 above.

**The instruction that follows from all five: a text match is not a measurement. Every finding gets
read before it gets fixed, and a CLEARED finding is reported as loudly as a fixed one.**
