# OUTBOX-CC-1

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-1-archive-2026-10-17.md](archive/OUTBOX-CC-1-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-22 ~15:30Z — CC-1 443.232 UPDATE: PR #27168 MERGED + PR #27171 in CI

**PR #27168 MERGED** → squash `acafc4f330` — void cascade fixes (b/c/d) are on main.

**PR #27171** (`cc-1/443-232-cancelled-leg-revenue`, CC-1e): tour-readout cancelled-leg TONU revenue fix in CI. `lc_is_invoiced` now projected into legsRes; cancelled+no-invoice=0, cancelled+invoice=actual_revenue.

**CC-1d (P-0102) still BLOCKED** — needs owner authorization to void settlement P-0102 ($379.73 USMCA closed, source_document_ref=5796, id f54afddb). No code change possible; verify-settlement-net-matches-signed-doc will remain RED until owner voids it.

**CC-1e 443.218 KPI** — pending after PR #27171 merges.

## 2026-10-22 ~16:15Z — CC-1 443.234 CLOSE-OUT

### 443.234a — 3 stale presettlement_link_id CLEARED (TB = 0)

Run via Neon MCP bypass_rls=lucia on USMCA prod. UPDATE RETURNING = 3 rows:
- Load 13663 (`0c7bb7ba`) → presettlement_link_id = NULL ✓
- Load 13544 (`0b95a971`) → presettlement_link_id = NULL ✓
- Load 13563 (`4b89d970`) → presettlement_link_id = NULL ✓

Both settlements (df6b3c83, 9580bec8) were status=cancelled, voided 2026-10-16. Step 8 of the cascade engine was added in PR #27137 and did not retroactively clear loads voided before that PR. Manual repair applied.

Zero-count verify:
```sql
SELECT COUNT(*) AS stale_count FROM mdata.loads
WHERE presettlement_link_id IN (
  'df6b3c83-643e-428e-a884-62b9013cae18',
  '9580bec8-2569-48ac-a931-e4ae6924edb0'
) AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND soft_deleted_at IS NULL
-- Result: stale_count = 0 ✓
```

### 443.218 KPI remainder — PR #27176 in CI

Branch `cc-1/443-218-kpi-total-count` → PR #27176 (preflight PASS, CI running).
- factoring-queue route: COUNT(*) OVER () → real total
- factoring.routes.ts: 4 instances (recourse-pipeline, chargebacks-fees, unapplied-cash, invoice-status)
- New guard: `scripts/verify-kpi-total-not-rows-length.mjs` + wired to locked-guards-heavy
- SURFACE-BREACH-AUTHORIZED: CC-2 (factoring/**) per LEAD 443.230 item-e

### P-0102 — OWNER HOLD (DO NOT VOID per LEAD 443.234 15:50Z)

Settlement P-0102 ($379.73, USMCA, source_document_ref=5796, status=closed). No action.
