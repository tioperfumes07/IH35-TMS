# ★ CC-1 — Money lane (Cursor lead, 2026-09-10). OUT until ~18:00 local — this is your queue on return.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-CC-1.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227`/`br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD+FIX, reuse the existing poster/sequence — never write new GL math solo. Fast-merge, PR title
`CC-1-`. One PR + one named guard each. Void-never-delete, no prod fixtures.
While you were out, GPT covered REG-010/011 and may have shipped REG-040 — check main + OUTBOX-GPT before
starting; if REG-040 shipped, verify it live and move to ROW 2.

## ROW 1 — REG-040 (deadline on return + 2h · surrender GPT)
Invoiced loads must leave the active Load Costs board → **Resettlement**; a new NB load on the same
unit/tour auto-assigns the SAME settlement. LIVE: 8 loads `status=invoiced`. Guard asserts an invoiced
load is excluded from active costs and appears in resettlement. (Ties REG-008/032.)

## ROW 2 — REG-008 (presettlement auto-link 3 call sites)
`quick-assign.service.ts`, `planner.service.ts`, `dispatch-refinements.service.ts` never call the
auto-link you built elsewhere → wire all 3. Guard covers the 3 call sites.

## ROW 3 — REG-038 (Dispatch Home KPIs REAL + own columns)
Dispatch Home KPIs must be REAL live USMCA numbers; each KPI breaks into its own columns
(Unit/Driver/Load): Units-Need-Return, Days-Since-Last-Delivery, Unassigned-Units, Roundtrip-Exposure.

## ROW 4 — CASHFLOW-KPI (NEW, measured live 2026-09-10 by lead)
MEASURED: `apps/frontend/src/pages/cash-flow/tabs/CashFlowKpiStrip.tsx:43` — "Projected closing" renders a
missing/failed value as a confident `0` (guard `verify-no-dead-kpi-cards` FAILS on main). TARGET: a
missing/failed KPI value renders `null → "—"`, never a confident 0. Fix + let the guard pass.

## ROW 5 — REG-031 (Cash Flow Home)
Cash Flow left-nav must land on a Cash Flow HOME first — push + paste live click-through proof.

## ROW 6 — SET-29
Fixed monthly costs must never attach to a single load (verify-step 11129) — confirm live / fix path.

DONE line each: `CC-1 | REG-###/ROW DONE | <sha> | <live sha> | <measurements now passing> | NEXT`
