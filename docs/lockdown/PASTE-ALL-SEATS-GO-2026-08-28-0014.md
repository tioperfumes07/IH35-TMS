# PASTE ALL SEATS — GO-0014 (Claude live findings 2026-08-28 2:49 PM CT)

Live API **`069d531`**. USMCA `5c854333`. Real-only (`COALESCE(is_sample_data,false)=false`). Neon `BEGIN; SET LOCAL app.bypass_rls='lucia'`. U14 never restamp. One Devin. Nobody `trigger_deploy`. Jorge is not the messenger — **`docs/bus/FEED/NOW-<SEAT>.md` is the whole instruction.**

FAST-MERGE = local gate then `gh api` squash. Skip #15546 #16895.

## P0 mechanism (do not split into two bugs)

A/R GL **-$3,600.00** vs open-invoice subledger **$1,900.00** → diff **-$5,500.00**.  
A/P GL **-$1,227.90** vs open-bill subledger **$110.00** → diff **-$1,337.90**.

All five real USMCA invoices have **no** `source_transaction_type='invoice'` JE. Invoice poster **stands down** when the latch owns the load (`InvoiceRevrecLatchOwnsLoadError`). A/R is supposed to come from latch Event 2. Cash receipts still credit 1100 → GL A/R negative.

**Do not conclude the invoice poster is broken. Do not write a second A/R poster.**

**Code fact on live SHA:** `git show 069d531:apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts` already has Owner Decision B — Event 2 is **not** POD-blocked (`#16875` ACCT-F9872 is an ancestor of `069d531`). Claude’s “still ACCT-F5692 POD gate” is **wrong against this SHA**. CC-1 NOW is **why Event 2 still has_je=false on five issued invoices**, then re-measure both legs. Reuse the latch.

## Do not spend seats on

- 9000 Ask My Accountant (real-only **$36.12**; sample is the rest)
- Negative 1000/1100 as defects ($0 OB by locked cutover)
- Samsara→detention (CC-3 DISPROVEN, accepted)
- USMCA QBO `sync_metadata_stale` — **suppress**, USMCA has no QBO
- Rebuilding ledger CHECK (#17125 applied 2:35 PM CT; **acceptance = 3:20 PM CT tick**)

## ACK lines

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0014 \| NOW=event2-silent-on-issued-invoices \| SHA=069d531 \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0014 \| NOW=cron-tick-1520Z \| SHA=069d531 \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0014 \| NOW=BANK-F01-F02-F03-F07 \| SHA=069d531 \| GO` |
| Codex | `CODEX \| ACK \| GO-0014 \| NOW=pass-unverified-evidence-8 \| SHA=069d531 \| GO` |
| Devin | `DEVIN \| ACK \| GO-0014 \| NOW=ensure-drivers-payee \| SHA=069d531 \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0014 \| NOW=vendors-0-of-7-prod-verified \| SHA=069d531 \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0014 \| NOW=lead+stamp-expiry \| SHA=069d531 \| GO` |
