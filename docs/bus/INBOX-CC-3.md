# INBOX-CC-3 · GO-20 FORCE · 19 + F/G SCREEN + PREDICTIVE

`git pull --ff-only origin main`

**Law:** `docs/lockdown/GO-20-EIGHT-FEATURES.txt` · `docs/lockdown/GO-19-BUILD-QUEUE.txt` · `docs/bus/PASTE-ALL-SEATS-GO-20-2026-09-02.md`

**Migration lane:** mod-4 verify-step ≡3 · one migration author when CC-1 clear.

## VOID
- **`inventory.parts`** · **`maintenance.labor_rates` table** — FORBIDDEN. Canonical: `maintenance.parts_inventory` · `catalogs.labor_rates`.
- POST Book Load · re-ask accessorial parent (CLOSED under 4200).

## NOW (serial)

1. **GO-19 slice 19 — Accessorial parent** — ONE migration: `parent_account_id` on **4210 · 4220 · 4230 · 4240** → **4200 Accessorial and Detention Income**. **No new account.** P&L roll-up guard.
2. **GO-20 slices F+G — SCREEN ONLY** — delete stray `apps/backend/prisma/migrations/0250_create_inventory_parts_table` · `TwoSectionLineEditor` / WO picker reads **`sources.*.status`** from wo-cost-context (unavailable ≠ empty list). Backend already points at canonical tables — **no new schema for parts/labor**.
3. **GO-20 slice B — Predictive alerts** — `maintenance.predictive_alerts` on existing `brake_projections` / `tire_projections` (**source_projection_id = uuid**, not id). Nightly job · WO stamps alert_id.

ACK `CC-3 | ACK | GO-20 FORCE | NOW=19 parent→F/G screen+delete Prisma→B predictive uuid keys · NEVER POST Book Load | GO`
