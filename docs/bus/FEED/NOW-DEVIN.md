# FEED · DEVIN · GO-0016 · overwrite

`git pull --ff-only origin main`
ACK: `DEVIN | ACK | GO-0016 | NOW=ensure-drivers-payee | SHA=069d531 | GO`

PREPEND that ACK as OUTBOX line 1. Older GO-0002 / GO-0014 pings without this ACK are **void as NOW**.

## NOW
Backfill the **4 USMCA drivers** with no `mdata.vendors` payee via existing **`POST /api/v1/mdata/vendors/ensure-drivers`**. Do **not** SQL-patch. KEEP TEST. Query-back the four payee rows.

Do not stamp G1 FIXED on API `069d531`. One Devin (Devin-A VOID as second builder).

## Forbidden
SQL INSERT into vendors. Second Devin. `trigger_deploy`. U14 restamp. COMPLETE. TRANSP/TRK/QBO.
