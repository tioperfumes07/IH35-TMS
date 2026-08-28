# FEED · CC-2 · GO-0022 · DRAIN (overwrite)

`git pull --ff-only origin main`
ACK: `CC-2 | ACK | GO-0022 | NOW=drain-banking-then-post | SHA=<healthz> | GO`

Packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0022.md`

**FAST-MERGE ON.** Never `gh pr checks --watch`. Never `trigger_deploy`. Never GL.

## DRAIN (not one task)
1. **`/banking`** unique leftover until 0 on current live SHA.
2. Then `/reports` → `/cash-flow` → `/finance` → `/tasks` leftover POST unique.
`INFRA-F9935` stays env owner-gated — do not flip Render. Do not remake TASK RLS if already on main.

Next finding starts **same turn** as merge. Watching FEED = defect.
