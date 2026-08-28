# FEED · CC-1 · GO-0014 · overwrite

`git pull --ff-only origin main`
ACK: `CC-1 | ACK | GO-0014 | NOW=event2-silent-on-issued-invoices | SHA=069d531 | GO`

## NOW
P0 live (Neon, lucia, real-only, USMCA `5c854333`, API `069d531`):

- A/R GL **-$3,600.00** vs open invoices **$1,900.00** → **-$5,500.00**
- A/P GL **-$1,227.90** vs open bills **$110.00** → **-$1,337.90**
- Five invoices, all `has_je=false` for `source_transaction_type='invoice'`: INV-2026-00037/38/44/45, L-20260827-0857

Invoice poster standing down is **by design** (`InvoiceRevrecLatchOwnsLoadError`). Latch Event 2 is the A/R path. **Do not write a second A/R poster.**

POD is **already not** a posting block on live `069d531` (Option B `#16875` / ACCT-F9872 is in that tree). Do **not** rebuild Option B. Do **not** seed POD.

**NOW:** prove why Event 2 still did not post for those five **issued** invoices; reuse `postLoadRevenueLatch` / existing poster; then **re-measure both A/R and A/P legs** on the same Neon basis. No new GL math.

#17125 CHECK is applied — not your NOW. 9000 real-only $36.12 — not your NOW.

## Forbidden
Second A/R poster. Invoice-poster “fix”. Prod-only ALTER. 9000 fail-closed. Void-all. QBO/TRANSP/TRK. `trigger_deploy`. U14 restamp.
