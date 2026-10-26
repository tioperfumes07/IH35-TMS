# Archived from OUTBOX-CC-1 (bus-diet) 2026-10-26

## 2026-10-23 ~15:40Z — CC-1 443.274-A DONE + P0 MERGED

**P0 PR #27331 MERGED** — register 3 orphan E5 guards (steps 18388/18392/18396) + notVoided("ft") inline debt fix. 2 static reds cleared.

**443.274-A PR #27333 OPEN, auto-merge ON** — driver pay double-count fix:
- billsPromise: bill_category='driver' → document_kind='driver_bill' (driver pay bucket)
- Backfill: 107 accrued_bill_id links (68→175 linked; 15 orphans, no AP twin)
- Guard: verify-driver-ap-not-in-vendor-row.mjs step 18400
- Live: vendor_bills=$743.25 (3 rows), driver pay counted once exit 0
- SHA=fa26d19ccb
