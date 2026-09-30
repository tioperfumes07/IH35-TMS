# AUGUST & SEPTEMBER 2026 — USMCA RECONCILIATION AND THE REAL CLOSE GATE

Lead, 2026-09-30. Every number here was read live from production
(`tiny-field-89581227` / `br-fancy-credit-akjnd07a`) under `neondb_owner` + `app.bypass_rls`.
USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`.

**Read this before anyone attempts another close.** Two separate things were being confused with
each other: the ACCOUNTING reconciliation (which is nearly clean) and the CLOSE CHECKLIST (which
is not, for reasons nobody had measured until today).

---

## 1. THE LEDGER BALANCES. BOTH MONTHS. TO THE CENT.

```
              entries   postings          debits            credits      imbalance
  2026-08       1,943      4,232   $1,144,261.64     $1,144,261.64          $0.00
  2026-09       2,320      5,477   $2,253,782.60     $2,253,782.60          $0.00
```

This is the floor, not the finish. A balanced ledger only says every entry has two sides; it says
nothing about whether the entries are RIGHT.

## 2. INVOICES ISSUED

```
  2026-08   sent      43   $130,005.00
            paid       5     $9,225.00
            partial    2     $6,620.00
            void      24    $91,859.00
  2026-09   sent      63   $250,116.72
            proforma  12    $51,575.00
            void       0            —
```

## 3. FOUR ACCOUNTING GATES — measured, each one a number

| Gate | Finding | Target |
|---|---|---|
| **G-A** | Account **9000 "Ask My Accountant"** holds **176 postings / $2,837.33** in September. That is QuickBooks' uncategorized bucket. A period does not close with money parked in it. | $0.00 |
| **G-B** | **$37,750.00 of September revenue is invoiced and not recognized** — invoices sent $250,116.72 against account 4000 Freight/Line-haul Income $212,366.72. CC-2's DISP-01 population accounts for $34,850 of it, which leaves **$2,900.00 that nobody has named.** Find it. Do not plug it. | explained |
| **G-C** | September shows **zero voided invoices** while 13625 ($6,250.00) and 13626 ($3,400.00) are proven fabrications pending unwind. September must not lock before that unwind lands. | unwound |
| **G-D** | Confirm **1090 Undeposited Funds $61,637.00** and **1150 Unbilled Revenue $4,900.00** against their subledgers. Both are large, and both are the shape that hides a missing posting. | tied |

## 4. THE REAL CLOSE GATE — and it is not the $34,850

CC-1's fork found the sanctioned mechanism (`lockMonthClose()`, `month-close.service.ts`) and ran
its actual checklist live. Both months return **`can_lock: false`**, and the reasons have nothing
to do with the DISP-01 population everyone has been arguing about:

```
AUGUST      23 of 113 USMCA FREIGHT bank transactions matched   ->  90 UNCOVERED
            1 overdue AR invoice not acknowledged

SEPTEMBER   39 of 235 bank transactions matched                 -> 196 UNCOVERED
            54 overdue AR invoices not reviewed
            3 overdue AP not reviewed
            IFTA Q3 2026 due this month and not filed
```

**286 uncovered bank transactions across the two months.** That is the limiting factor. The
$34,850 exclusion was never it.

### Why this is the right answer and not an obstacle to route around

A month-close checklist that requires the bank to be reconciled is the checklist doing its job.
Closing a period with 286 unmatched bank transactions would mean asserting that the books reflect
the bank when 55% of August's and 83% of September's bank activity has never been matched to
anything. Every downstream number — cash position, AR aging, factoring reserve — inherits that
assertion. QuickBooks will not let you reconcile past an unmatched register either, and for the
same reason.

**The fork was right to stop.** Nothing was committed and nothing was forced through. Bank
reconciliation at this scale and an IFTA filing are real operational work, not a checkbox.

### Ruling on sequence

1. **Bank reconciliation is the long pole and it starts now.** 286 transactions. It is mechanical
   and it is CC-2's lane. August first — 90 transactions — because a closed August is worth more
   than a half-reconciled September, and because September's matching is easier once August's
   opening position is fixed.
2. **IFTA Q3 2026 is NOT late.** Q3 ends today, 2026-09-30. The filing is due at the end of
   October. It belongs on the October calendar, not on this close's critical path. It stays on the
   checklist — it is not a defect that it appears there — but it does not block an August close and
   should not be treated as an emergency.
3. **AR/AP aging review (54 + 3) is an owner act, not a seat act.** A seat must never mark an
   overdue invoice "reviewed" on the owner's behalf. Surface the list; the owner acknowledges.
4. **The four accounting gates above run IN PARALLEL with the bank work.** They are independent and
   G-B's unnamed $2,900 is the one most likely to turn into a real finding.

## 5. WHAT IS ALREADY CLOSED AND MUST NOT BE RE-OPENED

- **G2** — 17 settlement lines with `item_id` NULL. Closed by adjusting JE (32 lines, $1,723.88),
  16 of 17 reclassified, $22.14 correctly held out, permanent mapping table
  `driver_finance.settlement_line_item_splits`, `NOT VALID` constraint blocking future null-item
  extra_pay rows. Settlements 5769-5819 never reopened.
- **G5** — driver closed 51, company closed 51. AUTH-167.
- **Settlements 5769-5819** — 51 of 51 against AlwaysTrack, variance 0. Standing ruling: never
  re-open.
- **$17,057.44 double-booked factoring** — reversed, account 1090 $17,867.98 -> $16,162.34.
- **$18,110 TRANSPORTATION void-4** — done and stable.

## 6. A-11 AND A-16 — DELIVERED, recorded here so they stop being re-asked

- **A-11** — the shared backend endpoint is CORRECT. The defect is the Transaction List page
  stacking an unfiltered mini-table above the filtered Invoices table, so the two visibly disagree
  the moment any filter is applied. Handed to Cursor with the measurement (PR #23365).
- **A-16** — one server-side predicate for both lists. Live counts: **76 of 1,249 customers** and
  **34 of 623 vendors** have real transactions. Edge case ruled: a customer whose only invoice is
  VOIDED counts — void-not-delete means real history.

## 7. ON DELETING VOIDED TRANSACTIONS

August alone carries 24 voided invoices worth $91,859.00. The recommendation on the record:
**purge them from the working views so the reconciliation reads clean, and keep the rows and their
register.** The books read clean and the trail survives. Physical deletion removes the evidence
that those voids happened, which is the first thing a CPA, auditor or lender asks for — and it is
what makes the void register worth having in the first place. Owner's call; this is the
recommendation, made once.
