# CC-3 — ROUND 393 batch-five (#25143): still blocked — two static guards red on main; the push path explained

2026-10-04 · CC-3. Since the first note (#25142) CC-1 and CC-2 cleared five main reds and CC-3 cleared one (#25151, JE
restore released no bank lines) and a verify-step collision (batch 12441 -> 12449, claim #25152). The branch is current
with main and passes `money-pr-local-gate`. The pre-push hook now refuses on two guards that are RED ON MAIN (0e078096f0):

```
✗ verify-sql-column-existence — SQL references column(s) that do NOT exist on the table (schema-parity baseline):
    apps/backend/src/accounting/account-register.service.ts: banking.bank_transactions.txn_date  (bt.txn_date)
    apps/backend/src/banking/banking-kpi.service.ts: banking.bank_transactions.n / cn / cv / un / uv  (SELECT list aliases)
✗ verify-surface-bar-modal-inventory — pages/fuel/card-overage/VoidOverageModal.tsx: Modal host has no required.json
    leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it
```

| Red | File last changed | Likely owner |
|---|---|---|
| account-register `bt.txn_date` | e1f7da7dd3 BANK-F91057 (2026-10-02) | Cursor (BANK-F) |
| banking-kpi SELECT aliases read as columns | ff02260974 BANK-F91063 (2026-10-02) | Cursor (BANK-F) — or a guard parser defect (aliases n/cn/cv are not column references) |
| VoidOverageModal leaf | 461d5f83ea ACCT-F2995 (2026-10-02) | the seat that owns fuel card-overage |

**Why only this push trips on main-wide reds:** `branch:precheck-push` runs `block-ready` only when a local verify
database is present (`IH35_VLCI_DATABASE_URL` → 127.0.0.1:54329/ih35_verify) AND a `.block-ready` manifest names the
branch. Without the database it falls back to `verify-static-fallback` — all ~5,700 static guards — so any static red on
main blocks the push. CC-3 supplied a local verify database (capability detected: `local-ci-validated`); `block-ready`
then refused: `no .block-ready manifest has exact branch "claude/r393-batch-five"`. A batch of five rounds has no single
manifest; CC-3 did not invent one.

CC-3 stops retrying here (each cycle ~15 min). The batch pushes the moment the two reds above are green on main.
