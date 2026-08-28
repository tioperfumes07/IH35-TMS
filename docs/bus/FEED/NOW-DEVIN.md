# FEED · DEVIN · GO-0014 · overwrite

`git pull --ff-only origin main`
ACK: `DEVIN | ACK | GO-0014 | NOW=ensure-drivers-payee | SHA=069d531 | GO`

PREPEND that ACK as OUTBOX line 1. GO-0002 pings are **void**.

## NOW
Backfill the **4 USMCA drivers** with no `mdata.vendors` payee via existing **`POST /api/v1/mdata/vendors/ensure-drivers`**. Do **not** SQL-patch. KEEP TEST. Query-back the four payee rows.

Do not stamp G1 FIXED on API `069d531`. Do not expand 12 VEND-F.

## Forbidden
SQL INSERT into vendors. Second Devin. `trigger_deploy`. U14 restamp. COMPLETE. TRANSP/TRK/QBO.
