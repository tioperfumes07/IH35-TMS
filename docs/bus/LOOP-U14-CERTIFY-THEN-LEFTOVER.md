# Cursor lead loop — U14 CLOSED · leftover POST / NEXT-8

**VOID:** any paste that says “stamp OPEN U14” / “recertify 1–6” / “leftover /425c only” / `AGENT_LOOP_TICK_u14_certify` as a certify loop. U14 is **14/14 CERTIFIED**. **Never stamp. Never recertify.**

**Arm:** NONE. Owner 2026-08-24: the 5-minute U14 wake + `stop` hook are **removed**. Do not re-arm `AGENT_LOOP_TICK_u14_certify`. Work leftover POST in the session; do not burn tokens on stamp-loop pastes.

**Pack:** `docs/bus/NEXT-8-LEFTOVER-CERTIFY-NOW-2026-08-24.md`  
**NOW:** `docs/bus/NOW-ONE-SOURCE.md`

## Each tick (in order)

1. `git fetch origin && git pull --ff-only origin main`
2. `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → record `version`. **Do not stamp.**
3. **Never recertify** 1–14 (customers/drivers/fleet/lists/legal included).
4. Codex leftover unique `/customers` → `/drivers` → `/fleet` — not U14 hops. No restamp.
5. Cursor leftover **`/docs`** (NEXT-8 #8). Do **not** loop `/425c` (#15053–#15282). Then wave 2: users/home/help/program/system.
6. Other seats: CC-1 `/cash-flow`→`/finance` · CC-2 `/fuel`→`/reports` · CC-3 `/compliance`→`/eld`→`/inventory`.
7. Unique FINDING only (500 / dead / silent). One small PR. FAST-MERGE ~4 min. Never `gh pr checks --watch`. CC never `trigger_deploy`. Deploy 5–10 min **and** 5–10 PRs, one in-flight.
8. Continue leftover POST until Jorge says stop **or** there is no unclaimed unique FINDING.

## Sentinel

`AGENT_LOOP_TICK_leftover_post` — if a hook still emits `AGENT_LOOP_TICK_u14_certify`, treat that emit as this leftover tick. Do not stamp.
