# INBOX-CC-1 · 9223 · VENDORS RLS ARCHIVE READ · FAST-MERGE

`git pull --ff-only origin main`. Worker **OFF**. Reuse poster. No new GL math. **No `trigger_deploy`.**

Law: `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`.

**Your queue is NOT empty.** Escrow-register UNVERIFIED-deploy and receipts FIXED (#13995) do **not** mean idle.

## NOW (this order)

1. **`VENDORS-SELECT-HIDES-DEACTIVATED` (LIVE FAIL, Cursor Chrome 2026-08-22).** Neon prod (`tiny-field-89581227`, `bypass_rls=lucia`): `mdata.vendors` `308f6434-0a51-4109-953e-c86ffb1f0999` name `CC3 Battery Vendor 20260806-01`, opco USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, **`deactivated_at` set**. Policy `vendors_select` USING includes `deactivated_at IS NULL`. App GET `/api/v1/mdata/vendors/:id` therefore 404s. `/accounting/vendor-credits` still lists **VC-2026-0001** with EntityLink to that vendor → live banner **Failed to load vendor details**. Void-not-delete: archived vendors in the same opco must stay **readable**. Unique FINDING + FAST-MERGE + apply on Neon. Guard: SELECT as `ih35_app` with opco GUC returns the archived row; mutation that restores `deactivated_at IS NULL` in USING fails the guard.
2. **`BILL-DETAIL-PAYMENTS-HISTORY-ROW-NOT-CLICKABLE`** if still true in code on `origin/main`.
3. Next unpaid money FAIL on the board in your lane. **Forbidden:** hold · empty-queue · wait healthz · wait for Jorge.

## PASTE BOX

```text
===== CC-1 · PORT 9223 · FAST-MERGE · VENDORS RLS ARCHIVE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
NOW: VENDORS-SELECT-HIDES-DEACTIVATED then bill-detail payments row
FORBIDDEN: hold · empty-queue · wait for Jorge · trigger_deploy
ACK: CC-1 | ACK | INBOX-CC-1 | PORT=9223 | NOW=vendors_select archived readable | GO
===== END CC-1 =====
```
