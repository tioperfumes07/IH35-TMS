# B20 Decision — IFTA Framework

**Original block:** B20 — IFTA framework (subset of Phase 8)  
**Source:** `Downloads/ab/00-MASTER-QUEUE-INDEX-52-BLOCKS.txt` — ON HOLD until Jorge greenlights Phase 8

## Original Scope Summary

IFTA quarterly reporting framework — fuel tax jurisdiction tracking, state-by-state mileage allocation, quarterly filing prep. Referenced in A23-14 cluster as "separate B20-style block."

## Overlap With Shipped Work

| B20 intent | Shipped artifact | PR / block |
|------------|------------------|------------|
| IFTA operator procedure | `docs/runbooks/IFTA-QUARTERLY-FILING.md` | CLOSURE-25 [#583](https://github.com/tioperfumes07/IH35-TMS/pull/583) `d4c86872a` |
| IFTA tax rate guards | `verify:ifta-tax-rates-current`, `verify:ifta-aggregator-determinism` | On main |
| IFTA quarterly report automation | GAP-78 spec (`docs/dispatch/batches/GAP-78-IFTA-QUARTERLY-*`) | Not yet dispatched (Phase 8) |
| Fuel card → IFTA validation | `docs/runbooks/FUEL-CARD-IMPORT.md` | CLOSURE-25 |

**Not yet shipped:** Automated `/reports/ifta-quarterly` report generation UI + filing export (GAP-78 scope).

## Recommendation: **SUPERSEDED**

B20 as a standalone "framework" block is **OBSOLETE** — its operator-facing framework is covered by CLOSURE-25 runbooks. Automated IFTA reporting is tracked as **GAP-78** (future Phase 8 dispatch), not a B20 revival.

## If automation needed later

Dispatch **GAP-78** (not B20) when Jorge greenlights Phase 8:

```
feature/gap-78-ifta-quarterly — migration 20260608XXXX_ifta_quarterly_snapshots.sql
- /reports/ifta-quarterly route + export
- ih35_app grants + RLS
- verify:ifta-quarterly-report.mjs
```

## Sign-Off

Decision recorded 2026-06-08. B20 closed as SUPERSEDED — dispatch GAP-78 when Phase 8 unlocks.
