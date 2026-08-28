# FEED · CC-1 · GO-0009 · overwrite

`git pull --ff-only origin main` then this file. ACK: `CC-1 | ACK | GO-0009 | NOW=G1-is_sample_data | SHA=069d531 | GO`

## NOW (serial — do not parallel)
1. **`VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE`** — TMS TEST creates write `is_sample_data=true`; JE inherit; `factoring.batch` column; aging/balances exclude sample. Query-back one labeled TEST.
2. **`VEND-F-VENDOR-BILL-PAYMENT-NEVER-POSTS-GL`** — three paths: PayBillModal → `payBill()` posts when flag ON; **VendorDetail `POST /vendors/:id/bill-payments` NEVER posts**; **VendorBalances `POST /ap/bill-payments` NEVER posts**. Wire both onto the **existing poster**. No new GL math. `VEND-F-POSTERS-BYPASS-ROLE-RESOLVER` is `payBill()` only — same PR if it is the same helper.
3. **CLS-GL-DARK 39** unposted bills/payments/invoices — fold into **C6**. Do **not** open a solo money-poster PR. Honesty: **#17038** (wave-queue) CI red on this clone’s required checks — rebase/fix YOUR guard, do not wait for Jorge. **#17039** is **CONFLICTING** — rebase onto new main after GO-0009.

## Forbidden
9000 fail-closed. Void-all-TEST. $0 opening-balance findings. INV-10. `trigger_deploy`. New post-gl until G1 lands.

## Not yours
Book Load Override dead click (CC-3). BANK-F9515–9518 (CC-2). BANK-F9519 packet-assemble silent INSERT is yours **after** G1+dual-path.
