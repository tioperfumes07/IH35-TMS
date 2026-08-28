# FEED · CC-3 · GO-0011 · overwrite

`git pull --ff-only origin main`
ACK: `CC-3 | ACK | GO-0011 | NOW=TXH-01-system-transactions-tab | SHA=069d531 | GO`

## NOW
Override family **shipped** (#17059). Vendor default-expense **API type check is on main**. Do not rebuild either.

**TXH-01 tab:** System → Transactions. GET `/api/v1/system/transaction-health` already on main (#17081). Status computed at read time. Ship tab + `SYSTEM_TABS` + `docs/approved-screens/system.png` + guard. Do not stub a lying table. Do not add a `health_status` column / migration.

Then leftover unique (not Codex `/dispatch`, not G1).

## Forbidden
G1 writers. GL math. `trigger_deploy`. Dual-Devin. U14 restamp.
