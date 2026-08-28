# FEED · CC-3 · GO-0012 · overwrite

`git pull --ff-only origin main`
ACK: `CC-3 | ACK | GO-0012 | NOW=TXH-01-system-transactions-tab | SHA=069d531 | GO`

## NOW
Book Load Override **shipped** (#17059). Do not rebuild.

**TXH-01 tab:** System → Transactions. GET already on main (#17081). No migration. No `health_status` column. Ship tab + `SYSTEM_TABS` + `docs/approved-screens/system.png` + guard. Then leftover unique (not `/dispatch`).

FAST-MERGE = local gate then `gh api` squash.

## Forbidden
G1. GL. `trigger_deploy`. Dual-Devin. U14 restamp.
