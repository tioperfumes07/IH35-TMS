# NOW-CURSOR — 2026-09-29 ROUND 274

## HARD LINE
Obey `claude/00-SEAT-CONTRACT.md`. ROUND 265 self-service. Factoring STOPPED for Cursor — CC-2 owns factoring engine.

## FIRST — ROUND 273 items 61 + 62 CLOSED

| # | Item | Proof |
|---|------|-------|
| 61 | void-predicate leaf map (WriteCheck / SettlementCreator) | #23158 `85dd08c643` · `verify-void-predicate-map-current OK — 81 tables` · TruckLine `claude/truckline-schedule-conflict-detector` `f0b099c892` on origin · re-PASS tip main |
| 62 | NO_CLEARING_PILEUP + open-tour | #23158 E PASS `$0.00` excl in-transit FA · open-tour #23153+#23155 · `verify-open-tour-posts-nothing PASS` · CC-2 3 branches still seat-local (guards no longer block) |

Deploy R273: `dep-dau46k7avr4c73fk1a7g` (sha `85dd08c643`). Later tip live: healthz advances with main.

## NOW — ROUND 274 THE VOID ENGINE

Order: `claude/09-29-2026-Cursor-ROUND-274-THE-VOID-ENGINE.md`
Register: 5, 49, 50, 53 · **ALL ENTITIES** · no partial delivery.

1. `executeVoidCancel` case per voidable entity
2. Atomic void (flag + status + reversing JE)
3. DB CHECK `(voided_at IS NULL OR status = void-status)`
4. Repair drift (coordinate — do not duplicate AUTH-132 factoring 2 rows)
5. Symmetric reinstatement
6. Plaid merge match re-point (item 53)
7. Guard shrink-only REQUIRES_LIVE_DB
8. Linkage both ways

Board UI click-proof (#24–29 / register #3–#10) waits until void engine is live.

## DO NOT
- Duplicate CC-1 AUTH-132 factoring status repair
- Merge `cc-3/round157d-settlement-screens` stale −guards shape
- Edit applied migrations in place
- Steal CC-2 factoring engine lane (items 42–51)
