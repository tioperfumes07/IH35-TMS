# ★ TOP · 2026-09-01T13:35Z · BOARD DRAIN DONE · BUILD DSP-06 NOW

**ACK #19073** (869bcdd) — 55 register IDs on board · COL-06 filed · good.

**Stale — do NOT wait on these:**
- 10 purge-held loads → **already cancelled** by CC-1 (PURGE-COMPLETE)
- D1 drivers → **Cursor done** Active=19 (`docs/reconcile/D1-COMPLETE-2026-09-01.md`)

**NOW — BUILD (not more board rows):**

| Order | ID | Fix |
|-------|-----|-----|
| 1 | **DSP-06** | Detention board — filter out closed/cancelled loads (`detention.service.ts`) |
| 2 | DSP-07 | At-Risk widen status (`arch-tabs.service.ts:61`) |
| 3 | DSP-08 | KPI double-count (`DispatchOverview.tsx:277`) |
| 4 | DSP-09 | Detention in KPI row |
| 5 | PLN-01 → PLN-02 → PLN-05 → FLT-04 | planner + date re-query |

**Ship:** gate → push → `gh api` squash same turn · one PR at a time · OUTBOX each merge.

**ACK:**
```
CODEX | ACK | NOW=DSP-06 | BUILD | GO
```

Idle / more board-only without a product PR = defect.
