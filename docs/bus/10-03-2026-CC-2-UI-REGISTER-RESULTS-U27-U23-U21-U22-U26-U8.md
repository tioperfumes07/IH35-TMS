# CC-2 — OWNER UI REGISTER — U27, U23, U21, U22, U26, U8 CLOSED (2026-10-03)

USMCA only. Every number below is measured on the DIRECT endpoint, read-only. Each item is merged with its guard, or
in its final gate where noted.

| Item | What was wrong (the mechanism) | Fix | Proof | PR |
|---|---|---|---|---|
| **U27** P&L / Balance Sheet like QBO | `fn_account_balances_as_of` and the reclassify tree return raw debit − credit (income 4000 = −460,560.72). The tree, the register balance and the Chart of Accounts "QB balance" printed that raw number. The P&L and Balance Sheet **services** were already natural. | One rule, `lib/naturalBalance.ts`, using the ledger function's debit-normal set. | 17 income / liability / equity balances that printed negative now render positive. 5 stay negative because they are genuinely abnormal and are named: 1090 −151,736.34; 1295 −33,839.80; three driver escrows in debit. | #24776 |
| **U23** Load / Truck / Driver / Unit / Trailer / Vendor filters + column chooser | Postings carry only `entity_uuid`, so the register had no truck / driver / trailer / vendor. Every filter was single-select. | Dimensions come from the document line, then the header, then the posting entity. 9 multi-select filters use `MultiSelectDropdown`, with options from the rows in the window. A Columns chooser adds Truck / Driver / Trailer / Vendor. Truck = Unit (one record). | Facets 26 s → 0.3 s. | #24776 |
| **U21** calendars cannot change the YEAR | `DatePicker`'s popover default-prevented every mousedown, which stops a native `<select>` from opening. The test used `selectOptions`, which never opens it. | Form controls take their own mousedown. App-wide, one component. | New test fails on the old component. | #24777 |
| **U22** expense number missing from Num | 3,860 of 5,416 expense postings are reversal pairs of **purged** expenses. The document row is gone. | Num reads the number from the WORM audit DELETE row. The line is tagged *purged* and drills to its journal entry. | Empty Num 3,860 → 40 (10 purged expenses have no number anywhere). Every document lookup is now uuid-keyed: the fiscal-year register went **39.2 s → 0.36 s**. | #24784 |
| **U26** banking filters do not filter correctly | (1) The description filter wiped itself when its box closed (`onSearch` fed the cleared text back). (2) Uncategorized / Suggested matches / Transfers / Rules / Missing From-To read `matched_kind` and Plaid category text, not the line's state. (3) Tab badges counted before the filters. (4) Presets used UTC (a day off after 7 pm). (5) The KPI pre-filter stuck. | All five fixed. | 7 new assertions fail on the old view. | #24790 |
| **U8** Create Check offers no open bills | The whole Add-to-Check panel rendered only when the payee resolved a payable vendor. **7 of 27 active USMCA drivers have no linked vendor**, and a failed lookup also showed nothing, so the check went down the expense path. | The panel now says why there is nothing to pay. | USMCA has 3 open bills (all found by the vendor filter) and **0 checks ever written, so no double count yet.** 90 paid bills ($63,890.88) were paid by ACH / other bill payments. | #24793 |

## Answer: does the register show BOTH legs of a reversed pair?

Yes. Both legs are listed and labelled *reversed* / *reversal*. 0 of 3,083 pairs are split across the window edge, and
every account's list sums to its balance (37 of 37).

## Still open on CC-2's 24

- **Master data:** link the 7 drivers' payable vendors (U8).
- **Reclassify:** U24 by-item / by-load **targets**; U25 Diesel → Reefer Diesel.
- **Accounting screens:** U1–U7, U9–U14, U16–U18.
- **Next, in that order:** U17 (reclassify from Expenses), U4 (two expense tabs), U10 / U11 (bills sub-tabs), U13 (redirect tabs).
