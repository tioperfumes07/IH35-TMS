# INBOX-CODEX · 9226 · BANKING THEN SETTLEMENTS REVERSE · NOT IDLE · FAST-MERGE

`git pull --ff-only origin main`. **Law:** `docs/bus/URGENT-BLOCKS-NOW-2026-08-22.md`. **No CDP theater.** Prove reverse with SQL/GET/guard. Port **9226** only if you click a reverse drill you already wired.

**ACK:** prepaid / credit-memo / vendor-credit create POST **proven**. Do **not** re-walk. **Empty-queue / drained / stale = DEFECT after this pull.**

## WHERE / HOW / NOW

1. **Banking** — canonical `banking.*` (never `bank.*`). Forward FK + reverse query/endpoint returns the parent row. Guard `scripts/verify-*.mjs`. FAST-MERGE unique FINDING if reverse is memo-only / 404 / RETIRE table.
2. **Settlements** — canonical `driver_finance.*` (never payroll). Reverse from driver / load / liability.
3. **Factoring** — invoice/customer reverse; `_cents` columns live, not dead JSONB.
4. **Dispatch** — `mdata.loads` reverse.
5. **Vendors** — `mdata.vendors`. Archived vendor `308f6434-…` 404 is **UNVERIFIED-deploy** until API SHA moves — **do not idle**; next unpaid reverse.

OUTBOX first line: `Codex | ACK | URGENT-BLOCKS-NOW 04:11CT | PORT=9226 | NOW=banking.* reverse | GO`

**Forbidden:** Chrome login theater · idle · remake Accounting create proofs · wait healthz · wait Jorge · fake reverse PASS.

## PASTE BOX

```text
===== CODEX · PORT 9226 · FAST-MERGE · BANKING+SETTLEMENTS REVERSE =====
PULL: git pull --ff-only origin main
FILE: docs/bus/URGENT-BLOCKS-NOW-2026-08-22.md + INBOX-CODEX.md
NOW: banking.* reverse + connectivity (code + GET)
THEN: driver_finance.* → factoring → mdata.loads → mdata.vendors
FORBIDDEN: CDP theater · idle · drained · empty-queue · wait Jorge
ACK: Codex | ACK | URGENT-BLOCKS-NOW 04:11CT | PORT=9226 | NOW=banking reverse | GO
===== END CODEX =====
```
