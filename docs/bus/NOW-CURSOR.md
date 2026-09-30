# NOW-CURSOR — 2026-09-29 ROUND 274

## HARD LINE
Obey `claude/00-SEAT-CONTRACT.md`. ROUND 265 self-service. Factoring STOPPED for Cursor — CC-2 owns factoring engine.

## FIRST — ROUND 273 items 61 + 62 CLOSED

| # | Item | Proof |
|---|------|-------|
| 61 | void-predicate leaf map (WriteCheck / SettlementCreator) | #23158 `85dd08c643` · `verify-void-predicate-map-current OK — 81 tables` · TruckLine `claude/truckline-schedule-conflict-detector` `f0b099c892` on origin · re-PASS tip main |
| 62 | NO_CLEARING_PILEUP + open-tour | #23158 E PASS `$0.00` excl in-transit FA · open-tour #23153+#23155 · `verify-open-tour-posts-nothing PASS` · CC-2 3 branches still seat-local (guards no longer block) |

Deploy R273: `dep-dau46k7avr4c73fk1a7g` (sha `85dd08c643`). Later tip live: healthz advances with main.

## NOW — ROUND 274 THE VOID ENGINE (IN FLIGHT on `cursor/r274-void-engine-c89b`)

Order: `claude/09-29-2026-Cursor-ROUND-274-THE-VOID-ENGINE.md`
Register: 5, 49, 50, 53 · **ALL ENTITIES** · no partial delivery.

### Landed this session
1. **EXECUTORS** — wired all R274 entity keys (was 9+load unsupported; now +factoring_advance, bank_transaction, reconciliation_match, driver_bill, driver_liability, check_number_registry, bill_line, settlement_line, safety_incident, legal_contract_instance, relay_fuel_transaction(+_line)). `load` stays supported:false.
2. **Plaid item 53** — `repointReconciliationMatchesOnPlaidMerge` in `bank-tx-dedup.ts` (retire + supersede paths). Migration `202614600000_r274_plaid_merge_repoint_recon_matches.sql` repairs live orphan match `2d1f3f73…` → survivor `52c51c10…`.
3. **Guard** — `scripts/verify-r274-void-engine-complete.mjs` (selftest PASS; REQUIRES_LIVE_DB; shrink-only baselines status_drift=0, plaid_orphans=0).

### Still open
- Per-table DB CHECK for remaining status/voided_at pairs (factoring already has AUTH-132)
- Symmetric reinstatement path for new entities
- Claim+wire verify-step (mod-4 EVEN) · merge · deploy proof
- Ensure migrate runner records `202614601800` on Neon (data already clean; migration idempotent)

## DO NOT
- Duplicate CC-1 AUTH-132 factoring status repair
- Merge `cc-3/round157d-settlement-screens` stale −guards shape
- Edit applied migrations in place
- Steal CC-2 factoring engine lane (items 42–51)
