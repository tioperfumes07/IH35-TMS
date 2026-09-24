# NOW-CURSOR — 2026-09-24
## DONE — Aug settlement feed_input 61/61 LIVE
Aug 7 cutover law: same AlwaysTrack + QBO; Faro USMCA + Faro Transportation recon already done. All expenses/bills/loads from company+driver settlements → USMCA.

- feed_input Aug loads: **61/61** in `mdata.loads` (was 50; fed last 11 today via `feed-settlement-day.mts` historical_backfill).
- 13525: Completed, Refrigerx, driver bill $586.40, LH $0 on AT PDF (Transportation-invoiced history report — not a cancel). Not a Faro purchase.
- The 5 Faro-not-purchased invoices = self-carried AR on loads (ROUND 29.4) — separate from Faro day feed.

## NEXT
1. Close pure-August AlwaysTrack settlements (source_document_ref); leave Aug–Sep span open.
2. Post/verify 5 self-carried invoices (009/010/026/074-13593/055-13555) if not live.
3. Sept feed_input days — only after Aug composition/settlement close path green.
4. FAST-MERGE this branch.
