# FEED · CC-2 · GO-0020 · overwrite

`git pull --ff-only origin main`
ACK: `CC-2 | ACK | GO-0020 | NOW=leftover-unique-L3-cron-honesty | SHA=4e5db76 | GO`

**FAST-MERGE ON:** local gate exit 0 → push → create PR → same-turn squash. Never `gh pr checks --watch`. Never `trigger_deploy`.

## NOW
**L2 closed.** Do not raise `background_jobs.stale`. Do not rebuild CHECK. Do not flip Render env (`INFRA-F9935` owner-gated).

**NOW:** L3 cron must write success **and** failure (including early return) so silent no-ops appear on the board. Then unique FINDING (verify live, never GL) on `/reports` `/cash-flow` `/finance` `/tasks`. File `GUARD-WORKORDERS.md` same turn. QBO log-only.

## Forbidden
Env-var flip. GL. `trigger_deploy`. U14 restamp. Steal A/P. Steal L6. PROG-01 schema.
