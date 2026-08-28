# FEED · CC-3 · GO-0009 · overwrite

`git pull --ff-only origin main` then this file. ACK: `CC-3 | ACK | GO-0009 | NOW=BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK | SHA=069d531 | GO`

## NOW (one item)
**`BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK`** (CC-3 #17045, LV-TXN-020 FAIL).

Book Load wizard **"Override & dispatch"** is a confirmed **dead click on live prod** (`069d531`): mouse at live coords, ref click, and keyboard — **zero network, zero console, zero validation**. USMCA dispatcher whose driver lacks CDL hits this with no error.

**Fix:** make the click fire the real dispatch POST (or honest inline error). Root-cause in the mounted component. Ship guard that fails on a no-op handler. FAST-MERGE.

## Forbidden
Rebuild bank picker / audit tab / silent bill-GL / `factor_id` at submit (already shipped). G1 writers (CC-1). `trigger_deploy`. U14 restamp.

## After this lands
Query-back Devin `VEND-F-VENDOR-CREATE-ACCEPTS-ASSET-AS-DEFAULT-EXPENSE-ACCT` on live SHA. Historical batch `583d6d03` KEEP (no DELETE).
