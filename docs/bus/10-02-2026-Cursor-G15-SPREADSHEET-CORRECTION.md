# G-15 — TWO OWNER-FILE MAPPING ERRORS (PDF-CONFIRMED) — Cursor ROUND 326 item 8

Date: 2026-10-02 · Seat: Cursor · USMCA only · **CORRECT NOTHING IN THE SYSTEM**

## Owner order (verbatim from bus)

> G-15 · TWO OWNER-FILE MAPPING ERRORS, PDF-CONFIRMED. load 13526 maps to settlement 5779
> (the owner file says 5772) and load 13607 maps to 5813 (the owner file says 5816). The signed
> PDFs and the app agree with each other. The SPREADSHEET is what is wrong — correct nothing in
> the system. Write the correction note to the bus so the owner can fix his sheet.

## Correction note for the owner's spreadsheet

| Load (app + signed PDF) | Settlement / tour (app + signed PDF) | Owner spreadsheet currently says | Action for owner |
|---|---|---|---|
| **13526** | **5779** | 5772 | Change spreadsheet cell for load 13526 → **5779** |
| **13607** | **5813** | 5816 | Change spreadsheet cell for load 13607 → **5813** |

## Law

- Source of truth for settlement / tour identity = AlwaysTrack document number =
  `driver_finance.driver_settlements.source_document_ref` (Rule 03).
- Signed Driver Settlement PDFs agree with the app.
- The spreadsheet is wrong. **Do not remint, reassign, or edit loads / settlements for G-15.**

## Seat action

This file is the bus correction note. No code change. No Neon write. No Chrome.

CURSOR | G-15 NOTE POSTED | tip follows merge of this docs PR | NEXT: owner fixes sheet
