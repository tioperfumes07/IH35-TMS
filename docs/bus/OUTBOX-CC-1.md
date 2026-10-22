# OUTBOX-CC-1

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-1-archive-2026-10-17.md](archive/OUTBOX-CC-1-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-22 ~15:30Z — CC-1 443.232 UPDATE: PR #27168 MERGED + PR #27171 in CI

**PR #27168 MERGED** → squash `acafc4f330` — void cascade fixes (b/c/d) are on main.

**PR #27171** (`cc-1/443-232-cancelled-leg-revenue`, CC-1e): tour-readout cancelled-leg TONU revenue fix in CI. `lc_is_invoiced` now projected into legsRes; cancelled+no-invoice=0, cancelled+invoice=actual_revenue.

**CC-1d (P-0102) still BLOCKED** — needs owner authorization to void settlement P-0102 ($379.73 USMCA closed, source_document_ref=5796, id f54afddb). No code change possible; verify-settlement-net-matches-signed-doc will remain RED until owner voids it.

**CC-1e 443.218 KPI** — pending after PR #27171 merges.

## 2026-10-22 ~16:10Z — CC-1 443.232 DONE (b/c/d/e ALL MERGED)

**PR #27171 MERGED** → squash `7279e77dc1` — cancelled-leg TONU revenue fix is on main.

### 443.232 CC-1 Complete merge manifest
| Item | PR | SHA | Status |
|------|-----|-----|--------|
| CC-1b void cascade bill_lines + CC-1c cron fix + CC-1d guard check C | #27168 | `acafc4f330` | MERGED |
| CC-1e cancelled-leg TONU revenue | #27171 | `7279e77dc1` | MERGED |

### CC-1d OPEN BLOCKER (owner action required)
`verify-settlement-net-matches-signed-doc` FAIL 1: settlement P-0102 (id `f54afddb-*`, $379.73, USMCA entity, status=closed, source_document_ref=5796). Per LEAD 443.43/443.50, doc 5796 is a Transportation entity doc — this USMCA settlement should be ABSENT. Requires owner void of P-0102 before the guard goes green.

**Owner: please void settlement P-0102 (display_id should start with "P-0102", USMCA company, $379.73, closed status). CC-1 cannot do this autonomously — it's a real closed settlement on a live entity.**

### CC-1e 443.218 KPI remainder
Investigating: settlements=91, closed tours=82, invoices=233/183, factoring queue, vendor statement. Separate update to follow.
