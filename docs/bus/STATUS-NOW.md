# STATUS-NOW · Cursor lead · 2026-08-19T10:50Z
**LAW:** `Execute docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md — do not invent a new sequence.`  
**Method:** FAST-MERGE ~4m · fix never defer · continuous · no idle · Live=BLOCKED until item 12.

## LIVE
API healthz: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow`  
App SPA `/api/...` returns HTML — **use API host**. Live=BLOCKED while version lags tip.

## OWNER MODULE ORDER (finish in this order — no skipping)

| Seq | Module | Scoreboard | Who owns NOW |
|-----|--------|------------|--------------|
| 1 | accounting | DONE | CC-1 money residual/Live |
| 2 | bank | DONE | CC-1 residual/Live |
| **3** | **safety** | **FIXING ← ACTIVE** | Cursor FE · Codex reverse · Devin Live · CC-2 GUARD sample |
| 4 | lists | next | CC-2 honesty · Cursor overflow |
| 5 | maintenance | next | Devin Live · Cursor FE · Codex residual |
| 6 | insurance | after | Cursor FE · CC-1 money hops |
| 7 | legal | after | Cursor FE |
| 8 | dispatch | after | Cursor · Codex queues |
| 9 | settlements | after | CC-1 |
| 10 | factoring | after | CC-1 |
| 11–12 | vendors · customers | after | Codex/Cursor FE · CC-1 money |
| 13–14 | drivers · driver-hub | after | Cursor/Codex |
| 15 | fleet | after | Devin Live · Cursor FE |
| 16–17 | cash-flow · finance | after | CC-1 money · Cursor chrome |
| 18+ | last wave | end | home→fuel→425→reports→tasks→inventory→docs→users→help→program→system→eld→**compliance LAST** |

Scoreboard: `docs/trackers/MODULE-DEEP-AUDIT-SCOREBOARD-2026-07-22.md`

## SEAT PARTITION (nobody idle)

| Seat | INBOX | OUTBOX | CDP | NOW |
|------|-------|--------|-----|-----|
| **Cursor** | INBOX-CURSOR | OUTBOX-CURSOR | 9226 | Lead + **safety FE** residual · tip all seats · Leaves when tipped · FAST-MERGE |
| **CC-1** | INBOX-CC-1 | OUTBOX-CC-1 | 9222 | **All money** · accounting/bank residual · prep settlements/factoring/cash-flow |
| **CC-2** | INBOX-CC-2 | OUTBOX-CC-2 | 9223 | GUARD after money · **lists honesty** (seq 4) |
| **CC-3** | INBOX-CC-3 | OUTBOX-CC-3 | 9224 | Mechanical/entity-scope OPEN board · not money |
| **Codex** | INBOX-CODEX | OUTBOX-CODEX | 9228 | Safety reverse/connectivity residual · then queues when dispatch |
| **Devin-A** | INBOX-DEVIN | OUTBOX-DEVIN | 9227 | **Live Cancel-only** on ACTIVE module (**safety** now) → lists → maint |
| **Cascade** | INBOX-CASCADE | OUTBOX-CASCADE | 9225 | Merge-on-green · audit append · wave cards |

## BUS LOCATION
Repo: `docs/bus/` · Desktop mirror: `~/Desktop/IH35-CURSOR-AUDIT/USMCA-WEEKEND-LEAD-2026-08-07/`  
Every seat: `git pull` → STATUS → **your INBOX TOP** → work → OUTBOX one-liner → next.

## TIP
All seats REWAKE with full INBOX · ACTIVE=**safety** · then lists → maintenance · continuous FAST-MERGE · no idle
