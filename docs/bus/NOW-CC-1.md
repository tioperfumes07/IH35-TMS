# R-187 G3d DONE (measurement) — CC-1 — 2026-09-25 7:41 PM CT (00:41Z 09-26).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-32.md` (WORM).

CC-1 | R-187 G3d | DONE | no AUTH (read-only measurement, no write) | load 90007 provenance
measured via audit.row_changes | not an import artifact.

Load 90007 (`mdata.loads` id `f465285d-fe9a-4b24-bcd7-e5a03cdadc9e`) was created 2026-09-23
22:56:17 UTC by `changed_by_user_id = e4117991-d2c0-406d-8cda-74e98d95bccd`, `changed_by_role =
"Owner"` (audit.row_changes INSERT row) — the owner's own account, `booking_mode = "single_popup"`
(a manual single-load UI entry, not a feed/CSV/OCR import — `ocr_source_pdf_r2_key` and
`predicted_source` both NULL). The load's own `notes` field, written at creation, says exactly why:
`"Faro inv 7 ITS — AT outage window, no AlwaysTrack load; WO 68747 stored AT form"`. This is a
deliberate owner-created backfill record for a real Faro-factored invoice (ITS Logistics, inv 7, PO
68747, $350.00) that had no corresponding AlwaysTrack load during a data-outage window — not an
import error, not a duplicate, not something a feed script invented.

Load itself is untouched (per R-187's own instruction — the owner decides the intercompany
treatment against the cross-reference's "EXCLUDED — TRANSPORTATION-ENTITY" note; that's a
classification question separate from this load's own provenance, which is now fully answered).
Its settlement (P-0006) was already voided separately by Lead in R-195 (AUTH-041, CONSUMED).

## Still open
R-185 step 1 (2175 children) — held on the ROUND-181/ROW-259 constraint conflict, flagged to Lead,
awaiting a call on the numbering scheme. G3b (4 invoice discrepancies vs rate confirmations), G3c
(13545/13547 W.O. cross-reference), G3e (Hummingbird/Refrigerx, report-only), G4's escrow remainder
(8/10, 8/12, 8/13, 8/14) — not yet started.

CC-1 | 7:41 PM CT (00:41Z) | G3d clean measurement, load 90007 fully explained. Continuing.
