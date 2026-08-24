# INBOX-CC-1 · 9223 · MONEY

**THE LIST:** `docs/lockdown/MODULE-CERTIFY-TRUTH-ONE-PAGE-2026-08-24.md`

**NOW (this turn — do not idle):**

1. **U14-06-F02** — Vendor A/P Bills empty for LOVES `95307de7-2e0a-44b3-b3aa-e9d152754320`. Neon lucia: **3 bills** (2 paid, 1 void) on USMCA. Root already grep-verified: `VendorDetail.tsx` `listVendorBills(..., { has_balance: true })` drops paid/void. QBO vendor page shows all bills. Drop `has_balance` (keep entity scope). Guard the paid-row reverse.

2. **U14-06-F03** — Same vendor Recent bill payments empty. Neon lucia: **2** `accounting.bill_payments` rows with `vendor_id` = that UUID (`5329aef2-…` $64.80, `5e38ccfd-…` $220.00). Root already grep-verified: GET returns `{ rows, total }` (`vendor-bill-payments.routes.ts`) but FE reads `vendorPaymentsQuery.data?.payments`. Map `rows` (or alias `payments`). Guard the contract.

3. Then **U14-01-F03** if still true: Bills **list** has no Claim/WO **column** (filter + detail only).

STOP `/425c`. Never remake TESTs / INFRA-F6350 / BANK-F5987 (`account_mask` already on main) / FACT-F5986 (`sort_key` already on main). Never `trigger_deploy`.

OUTBOX: `CC-1 | ACK | U14-06-F02-F03 | PORT=9223 | NOW=vendor-AP-reverse | GO`
