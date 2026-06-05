# AUDIT-FIX Slots 18-25

Status index for CLOSURE-29 slot materialization. This folder defines dispatch payload files only; it does not dispatch work.

Queue provenance:
- GAP re-slot decision: `docs/trackers/closure-v2.md`
- Deep audit sources: `docs/audits/DEEP-AUDIT-A-SUMMARY.md`, `docs/audits/DEEP-AUDIT-B-SUMMARY.md`

| Slot | Status | Source | Lane | Priority | File |
|------|--------|--------|------|----------|------|
| AUDIT-FIX-18 | READY | GAP-2 re-slot + Deep Audit A/B findings | A | P1 | `AUDIT-FIX-18-HOVER-DROPDOWN-SYSTEM-WIDE-GO.txt` |
| AUDIT-FIX-19 | READY | GAP-3 re-slot + Deep Audit A/B findings | A | P1 | `AUDIT-FIX-19-BACK-ARROW-BREADCRUMB-ALL-PAGES-GO.txt` |
| AUDIT-FIX-20 | READY | GAP-5 re-slot + Deep Audit A/B findings | B | P1 | `AUDIT-FIX-20-SINGLE-LINE-NAMES-CSS-AUDIT-GO.txt` |
| AUDIT-FIX-21 | PLACEHOLDER | Deep Audit findings pending | A | P2 | `AUDIT-FIX-21-PLACEHOLDER-GO.txt` |
| AUDIT-FIX-22 | PLACEHOLDER | Deep Audit findings pending | B | P2 | `AUDIT-FIX-22-PLACEHOLDER-GO.txt` |
| AUDIT-FIX-23 | PLACEHOLDER | Deep Audit findings pending | A | P3 | `AUDIT-FIX-23-PLACEHOLDER-GO.txt` |
| AUDIT-FIX-24 | PLACEHOLDER | Deep Audit findings pending | B | P3 | `AUDIT-FIX-24-PLACEHOLDER-GO.txt` |
| AUDIT-FIX-25 | PLACEHOLDER | Deep Audit findings pending | A | P3 | `AUDIT-FIX-25-PLACEHOLDER-GO.txt` |

Dispatch policy:
- CLOSURE-29 only materializes these slot files.
- Actual dispatch is gated until CLOSURE-30 PASS-8 returns GO.
