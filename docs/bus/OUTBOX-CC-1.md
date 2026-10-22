# OUTBOX-CC-1

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-1-archive-2026-10-17.md](archive/OUTBOX-CC-1-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-22 ~15:30Z — CC-1 443.232 UPDATE: PR #27168 MERGED + PR #27171 in CI

**PR #27168 MERGED** → squash `acafc4f330` — void cascade fixes (b/c/d) are on main.

**PR #27171** (`cc-1/443-232-cancelled-leg-revenue`, CC-1e): tour-readout cancelled-leg TONU revenue fix in CI. `lc_is_invoiced` now projected into legsRes; cancelled+no-invoice=0, cancelled+invoice=actual_revenue.

**CC-1d (P-0102) still BLOCKED** — needs owner authorization to void settlement P-0102 ($379.73 USMCA closed, source_document_ref=5796, id f54afddb). No code change possible; verify-settlement-net-matches-signed-doc will remain RED until owner voids it.

**CC-1e 443.218 KPI** — pending after PR #27171 merges.
