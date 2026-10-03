# CC-2 — OWNER UI REGISTER — 23 OF 24 CLOSED; U25 WAITS ON ONE OWNER DECISION (2026-10-03)

USMCA only. Numbers are measured read-only on the DIRECT endpoint. Every item is merged with its guard; the live check
in the browser is the owner's. The earlier six (U27, U23, U21, U22, U26, U8) are in
`10-03-2026-CC-2-UI-REGISTER-RESULTS-U27-U23-U21-U22-U26-U8.md`.

| Item | What was wrong (the mechanism) | Fix | Proof | PR |
|---|---|---|---|---|
| **U17** reclassify from the Expenses list | The list was read-only; reclassify was only reachable from Accounting > Reclassify. | Selected expenses open the same reclassify engine in a drawer: same writer, same batch, same audit, undo from Reclassify. | Guard. | #24795 |
| **U4 / U13 / U14** duplicate and misplaced tabs | "Expenses List" rendered the same page as "Expenses"; Vendors and Customers are their own modules. | One Expenses tab; Vendors and Customers leave the Accounting bar (old links redirect); maintenance shop renamed "Work orders & bills". | Three guards that still pinned the old layout were found red and repaired in #24868. | #24802 |
| **U10** each bills sub-tab shows only its type | A bill stored no type; the list guessed it from memo and vendor words. | `accounting.bills.bill_category`, set from facts (a driver's payable vendor = driver, a work order = maintenance, else vendor). | 90 driver bills and 3 vendor bills on USMCA. | #24814 |
| **U3** Load costs belongs in Dispatch | It was an Accounting tab. | Moved to Dispatch; the board shows the ledger cost per load next to the documents' cost. | Ledger cost per load $281,266.26 vs $187,284.22 in documents; `posting_source_load_id` 52 s → 1.9 s. Posting `load_id` backfill boarded for CC-3. | #24830 |
| **U24** reclassify by item and by load | The engine moved account / class / entity only. | Item and load moves recorded per line and undone exactly. | Fork end-to-end, undo restored. | #24837 |
| **U1 / U2** tables do not resize; the tab bar runs off screen | Columns had fixed pixel widths; the tab bar never wrapped. | Columns are shares of the window; the bar wraps. | Expenses table measured 2,278 px in a 2,244 px box before. | #24842 |
| **U6** checks list shows all checks | Only expense checks were listed. | Expense checks, bills paid by check and settlements paid by check, with full filters. | Guard. | #24849 |
| **U7** Create Check out of proportion | xl modals opened at 85% of the window (about 2,040 px). | xl opens no wider than 1,280 px; a size the user saves still wins. | Test fails on the old modal. | #24853 |
| **U9** print checks | One starting number; no per-check number; no duplicate warning; a typed jump left unrecorded gaps. | Each check shows its number, proposed and editable; the checks below continue from it; a number already used on the account is flagged and refused; skipped numbers need a reason and are recorded as voided numbers with it. | Fork, rolled back: 5001 / 5004 / 5005 printed, 5002–5003 voided with the reason, re-used 5004 refused. | #24864 |
| **U11** Vendor bill vs Bill | Measured: not the same. "Bill" is the list of every bill; "Vendor bill" creates one. | "Bill" relabelled "All bills". | — | #24868 |
| **U5** receipt creator = expense creator | Receipts had no creator; it only read attachments. | "+ New receipt" opens the expense creator itself (one writer, `POST /api/v1/expenses`), with the file filed as a receipt. | The receipts backend stays read-only (guard). | #24889 |
| **U16** work order / unit / trailer on lists; stored WO copy | The Bills list hid its WO column and had no Unit / Trailer; Expenses had no Unit (335 live expenses carry one); a document only linked to the LIVE work order. | Lists show all three (the document's own, else its lines'). The database stores a copy of the work order the moment a bill / expense is linked to it; the document opens that copy. | Fork: link → 1 copy, re-link → still 1, cross-company refused, delete refused. Prod: 4 capture triggers, 0 linked documents today. | #24891 |
| **U12** status is a multi-select everywhere | 16 Accounting / Banking lists filtered status with a single-select. | All 16 use the shared multi-select; 16 list endpoints accept a repeated `?status=` through one helper. Invoices also opens on Active as FLT-03 requires (main fell through to All). | Every new SQL condition run read-only on prod. | #24914 |
| **U18** Back is a breadcrumb to the module home | The Accounting header's Back popped browser history; so did recurring bills and Load costs. | Every Accounting page shows Accounting / [parent] / page; nothing in Accounting or Banking goes back through history. | 0 history-back in 187 files (guard). | #24920 |

## U25 — waits on the owner (one decision)

"Diesel → Reefer Diesel moves item + account + IFTA flag + trailer linkage." Measured: the items **Fuel-Truck Diesel**
and **Fuel-Reefer-Diesel** both post to the same account, **5000 Fuel & Diesel**. A reclassify to the reefer item
would move nothing on the ledger. Decide whether reefer fuel gets its own expense account (for example a new
"Reefer Fuel" account). Then CC-2 builds the move: item, account, IFTA flag off for reefer fuel, and the trailer link.

## Also waiting on the owner

- Link a payable vendor for 7 of the 27 active drivers (U8: until then their checks cannot pay their bills).
- AUTH for the 3 duplicate fuel pairs.
- Permission to delete the Neon rehearsal forks (br-square-field-akbrky2a, br-still-water-ake3emkq and older).

## CC-2 count

On my list: 24 · closed with proof: 23 · still open: 1 (U25, owner decision).
