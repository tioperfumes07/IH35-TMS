# ROUND 363 — CURSOR — CLEARED / UNCLEARED ON EVERY BALANCE, AND THE CLICK-THROUGH SWEEP
Lead · 2026-10-03 15:13Z · read `10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` first

## 363-CUR-A — CLEARED VS UNCLEARED, AND THE WARNING QBO DOES NOT GIVE (ROUND 362, still open)

Owner's rule, verbatim in effect: **cleared means the transaction was CATEGORIZED or MATCHED in Banking.**
It appears in the chart-of-accounts register and in reconciliation.

The register column is already correct in the service and must stay exactly this
(`apps/backend/src/accounting/account-register.service.ts:57`):

```
blank  |  C = matched to bank feed OR register_cleared  |  R = locked by a closed reconciliation
```

`C` has **two** sources. I reported "0 of 7,909 register_cleared, we are worse than QBO" earlier in this
session and that was wrong — I measured one of the two columns. **A status with two sources is not measured by
one column.** Do not re-open it on the strength of one count.

Build:

- Cleared / uncleared shown on **every balance** and on **both agings** — A/R and A/P.
- **The uncleared warning, which is where we pass QBO.** The owner named this defect himself: in QBO, apply a
  payment to a vendor or customer and the balance it shows is not real, because the payment may not have
  cleared the bank. So wherever we show a balance that includes an uncleared document, we say so: the document
  type, its number and its date, labelled **not cleared**.
  - Worked example, owner's own: a 2,000.00 bill with a 500.00 payment that has not been matched still shows
    **2,000.00** as the cleared balance, with the 500.00 payment named beside it as not cleared. Both numbers
    visible, neither one hidden.
- Derived from the GL and the bank-feed state. **No stored cleared total** — there is no second place a balance
  lives.

**PR:** one. **Guard:** `verify-every-balance-surface-declares-cleared-and-uncleared.mjs` — static over the
surfaces, plus one live case with an uncleared payment.

## 363-CUR-B — THE CLICK-THROUGH AND SORT SWEEP, APP-WIDE

The owner measured Reclassify Transactions live: clicking an account opens nothing, no header sorts. That is
not one screen's bug, it is a standard we have not held. **In QuickBooks everything is clickable and goes
somewhere. That is how this app is supposed to work.**

- Sweep every list, register, aging, board and report. Every cell that **names a record** — account, document
  number, load, driver, unit, trailer, vendor, customer, item — opens that record.
- Every column header sorts, ascending and descending, with the indicator visible.
- **Required value:** report the count of surfaces swept and the count of non-interactive record-naming cells
  remaining. The second number is the one that has to reach zero.

**PR:** one. **Guard:** `verify-record-naming-cells-are-click-through.mjs` — static over the surface registry.

## 363-CUR-C — MULTI-SELECT ACCOUNT FILTERS, EVERYWHERE

Owner: **the filter accounts in the entire app must be a multiple selector.** Single-select is a defect
wherever it appears. CC-2 owns the Reclassify tab's own filters (363-CC2-A); **you own every other filter bar
in the app.** Coordinate so there is one component, not two.

## 363-CUR-D — ALSO YOURS FROM THE GATE RE-MEASURE (LAW 363.7)

`verify-no-money-gate-depends-on-wall-clock-time` — a money gate whose verdict changes with the clock is not a
gate. This one is yours and it matters before the purge, because a purge run at the wrong hour must fail for a
reason, not pass for one.

---

**Deadline:** 363-CUR-A by **2026-10-05 06:00Z**. B and C by **2026-10-06 06:00Z**. D with the first PR.

**Linkage declaration required in every PR.** **NOBODY SEEDS ANY DATA ANYWHERE.**
