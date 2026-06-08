# ON-HOLD Triage — 2026-06-05

**Block:** CLOSURE-17-ON-HOLD-TRIAGE  
**Agent:** A (Lane A)  
**Scope:** Four blocks held during the 52-block master sweep that were never dispatched post-MVP closure.

## Decision Summary

| Block | Original scope | Recommendation | Rationale |
|-------|----------------|----------------|-----------|
| [A23-11](A23-11-decision.md) | CSA / FMCSA completion — real SAFER API, BASIC dashboard, migration 0346 | **REVIVE (deferred)** | Partial overlap with GAP-80 CSA BASIC scores tab; SAFER pull + full FMCSA filing still Phase 8 — do not dispatch until Jorge greenlights Phase 8 |
| [A23-14](A23-14-decision.md) | Phase 8 hold-items index (IFTA, Form 2290, drug pool, FMCSA filing cluster) | **OBSOLETE** | Index-only placeholder; individual items will get dedicated GO files when Phase 8 unlocks — no standalone block needed |
| [B19](B19-decision.md) | USMCA entity scaffolding (RBC ready, not GO'd) | **SUPERSEDED** | USMCA-1/2/3 (PRs #523/#524/#527) + CLOSURE-13 USMCA July launch ([#564](https://github.com/tioperfumes07/IH35-TMS/pull/564)) shipped multi-carrier isolation, seed/bootstrap, and activation runbook |
| [B20](B20-decision.md) | IFTA framework (subset of Phase 8) | **SUPERSEDED** | Operator runbook `docs/runbooks/IFTA-QUARTERLY-FILING.md` (CLOSURE-25 [#583](https://github.com/tioperfumes07/IH35-TMS/pull/583)); future GAP-78 IFTA quarterly report block covers automation when Phase 8 unlocks |

## Tracker Update

| Block ID | Prior status | Final status | Action |
|----------|--------------|--------------|--------|
| A23-11 | ON HOLD (Phase 8) | **REVIVE when Phase 8 GO** | Paste-ready spec preserved in `Downloads/all blocks/block-A23-11-GO-*` |
| A23-14 | ON HOLD (Phase 8 index) | **OBSOLETE** | Drop from dispatch queue; cluster items split into future blocks |
| B19 | ON HOLD (USMCA) | **SUPERSEDED** | Covered by USMCA infra + CLOSURE-13 |
| B20 | ON HOLD (IFTA framework) | **SUPERSEDED** | Runbook + future GAP-78 |

> **Note:** `IH35TMSMASTERTRACKER.xlsm` is maintained outside this repo. Jorge should mirror the table above in the tracker workbook.

## CI Guard

`scripts/verify-closure-17-on-hold-triage.mjs` — fails if any decision doc or this summary is removed.

## Forensic Checklist

- [x] Four decision docs written
- [x] Summary decision table present
- [x] No production code modified
- [x] Per-block manifest (no magnet `.block-ready.json`)
- [x] CI guard registered
