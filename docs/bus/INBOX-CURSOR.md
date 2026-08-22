# INBOX-CURSOR · 9222 · ACCOUNTING CREATE-TEST CLOSE · FAST-MERGE

`git pull --ff-only origin main`. **No `trigger_deploy`.** Law: `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`.

Owner: **close Accounting**. Create labeled TEST through wizards. Void at launch. Skip Match/Categorize (GL posting ON). Skip Daily Recon 500 until healthz ≠ `0cec933`.

## NOW

1. `/accounting/prepaid-expenses` → **+ Create Prepaid** labeled TEST DATA (active row; voided GUARD row does not count).
2. `/accounting/credit-memos` → **+ Create** labeled TEST if no second TEST exists.
3. Remaining Accounting More leftover only if a wizard is empty after you tried create.
4. Vendor `308f6434` = UNVERIFIED-deploy.

## PASTE BOX

```text
===== CURSOR · PORT 9222 · FAST-MERGE · ACCOUNTING CREATE-TEST =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CURSOR.md
NOW: prepaid Create TEST then credit-memo Create TEST
FORBIDDEN: hold · empty-as-stop · trigger_deploy · leave Accounting
ACK: Cursor | ACK | INBOX-CURSOR | PORT=9222 | NOW=accounting CREATE-TEST | GO
===== END CURSOR =====
```
