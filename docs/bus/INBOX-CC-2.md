# INBOX-CC-2 · LEAD TOP 2026-09-01 20:35 CT

`git pull --ff-only origin main`

## NOW
**VERIFY-STATIC-37 / #19418** — dead-port sentinel `DATABASE_URL` is truthy so `if (!databaseUrl)` SKIP never fires; uncaught ECONNREFUSED. You corroborated: did **not** re-audit all 37; count drifted. **Do not invent 24.**

If you take the push-gate fix: add the two crashing scripts to `dbGated` **or** treat sentinel as unset. Cursor will not steal verify-infra this turn (Book Load first).

Escrow $500.01 — verify-only, no zero.

ACK `CC-2 | ACK | NOW=#19418 push-gate · no invented 24 | GO`
