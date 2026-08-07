# OWNER RULING — Load linkage is pre-operational (going-forward only)

**Date:** 2026-08-04 · **Authority:** Jorge (owner) · **Status:** PERMANENT  
**GUARD-verified:** prod `br-fancy-credit-akjnd07a` this date  
**Cursor always-on:** `.cursor/rules/32-load-linkage-pre-operational.mdc`

## Ruling

Historical/QBO-imported fuel and expenses are **legitimately load-null** because the TMS has not dispatched
loads yet. Load linkage is **going-forward only**. **NEVER invent a load FK.** Mark the historical cohort
exempt (`load_required=false`, `load_exemption_reason`), guard that new TMS-native loads link — nothing more.

## Facts (prod 2026-08-04)

- Canonical dispatch / attribution tables empty (wiring present, zero rows).
- `fuel.fuel_transactions`: 1,548 rows, **all** `load_id = NULL` — imported/categorization cohort (2026-03-03 → 2026-08-03).
- Schema already has `load_required` + `load_exemption_reason` for honest no-load state.

## Lane assignments

- **Cascade:** Reclassify `CLS-LINKAGE-ONEWAY` — not a wiring FAIL; split wiring-exists vs going-forward guard.
- **Claude Coder:** Exempt backfill on import cohort + TMS-native going-forward linkage guard (no FK invention).
- **Cursor:** Honest exempt UI when `load_required=false`; no linkage fix/backfill work.

Full evidence and wave-queue split: owner pack at `LOAD-LINKAGE-SCOPE-RULING-2026-08-04.md` (2026-08-04).
