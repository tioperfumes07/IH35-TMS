# LEAD — QuickBooks invoice number -> load map (measured 2026-10-10 22:50 UTC)

Source: QuickBooks company "USMCA Freight Solutions, Inc.", invoices 2026-07-15..2026-10-10, read by the Lead.
Data: docs/bus/2026-10-10-QBO-INVOICE-LOAD-MAP.tsv (145 rows, invoices 001-143).

MEASURED
- 001-013, 016, 026: QuickBooks number is the invoice number only; no load number stored. Load comes from the owner's settlement workbook.
- 014-054: QuickBooks number is the invoice number; the load is in the line description ("Load Number - 014 - 13521").
- 055-143: QuickBooks number itself is `NNN-LOAD` (055-13555 ... 143-13667). Same format the app now mints (443.8).
- All 44 Faro purchases 09/25-10/09 match QuickBooks by amount.

EXCEPTIONS — do not guess, flag in the 443.19 pre-flight for the owner
- 059 used twice: 059-13577 (Armstrong $3,500) and 059-13578 (Refrigerx $5,210).
- 080 used twice: 080-13599 (Whitehorse $4,400) and 080-13605 (Refrigerx $3,700); load 13605 is ALSO invoiced as 084-13605 ($3,700).
- Load 13613 appears on 092-13613 (Refrigerx $5,700) and 094- 13613 (TTS $2,200).
- 105 used twice: 105- 13624 (Westgate $5,200, the Faro 105) and 105- 13627 (EGRO $3,200, not in Faro).
- 119 (Refrigerx $3,900) and 120 (Semares $4,900): no load number in QuickBooks.
- 129 (Faro: Armstrong $5,000, PO 4694862-1, 10/05): not in QuickBooks.
- 114-13623 (EGRO): in QuickBooks, not in the Faro export.

CC-1: update ~/IH35-LEAD-CHANNEL/443-19-PREFLIGHT.md — fill the invoice number for settlements 5826-5838 from this map
(replace NO-FARO-MATCH where the load is in the map), add one flag row per exception above. No production write. Post the new
flag count in SEATS-TO-LEAD.md.
