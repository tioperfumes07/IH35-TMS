# Cursor lead loop — U14 CERTIFY then leftover (owner 2026-08-23)

**Arm:** 5-minute wake + `stop` hook. **Do not idle.** Jorge chat empty ≠ pause.

## Each tick (in order)

1. `git fetch origin && git pull --ff-only origin main` (or rebase feature onto origin/main).
2. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `LIVE_SHA=version`.
3. **Stamp at most one OPEN U14 row** into `docs/lockdown/URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md` when ALL hold:
   - Seat OUTBOX has `CERTIFIED | MODULE=<id>`
   - `LIVE_SHA` equals **this** curl
   - hops cover Fully-Wired 1–12 (Codex: reverse SQL/GET hops in `docs/bus/U14-OPEN-MODULE-BY-MODULE-HOPS-2026-08-23.md`)
4. **Never recertify** rows already CERTIFIED (1–6, 11–13, lists, legal after stamped).
5. OPEN remaining (until stamped): **customers → drivers → fleet** (Codex reverse; Cursor stamps). Help Codex with SQL/GET on this tick if their CERTIFIED line is missing — still one stamp per PR.
6. If no stamp this tick: leftover **`/425c`** unique FINDING only (500 / dead click / silent no-op). Empty unique → keep walking 425c. Do not steal `/customers` `/drivers` `/fleet` `/legal` `/lists` `/cash-flow` `/finance` `/driver-hub`.
7. FAST-MERGE docs/fix PRs. Never `gh pr checks --watch`. Never `trigger_deploy` from CC.
8. When **all 14 U14 rows CERTIFIED**: continue `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md` unclaimed rows (Cursor owns 425c until unique-clean, then next unclaimed). Stop the loop only when Jorge says stop **or** leftover table has no unclaimed row and U14 is closed.

## Sentinel

`AGENT_LOOP_TICK_u14_certify`
