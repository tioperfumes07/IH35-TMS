# Sidebar navigation drift audit (2026-05-12)

**Read-only audit** — no production code changes. Purpose: reconcile three baselines before an Owner picks a canonical icon list.

## Sources

| Source | Location / basis | Stated count |
|--------|------------------|--------------|
| **A — Approved PNGs (May 2, 2026)** | `docs/approved-screens/` narrative + walkthrough; filenames TBD until binaries land. Baseline list from UI review: HOME, MAINT, ACCTG, BANK, FUEL, SAFETY, DRIVERS, DISPATCH, LISTS, REPORTS, 425C, DRV APP. | **12** |
| **B — Formal blueprint** | `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` **MUST 6.2.1.2** (line ~8007): “**12 navigation icons** (one per section per UI walkthrough)”. | **12** |
| **C — P3-T11.17 / master knowledge (paste directive)** | Referenced paths `docs/specs/02_P3-T11_17_*.txt` and `docs/specs/IH35_TMS_MASTER_PROJECT_KNOWLEDGE.md` **§3.2** are **not present in this repository** at audit time. Directive claims **15** icons = (A) + **CUSTOMERS**, **VENDORS**, **DOCS**. | **15** (claimed) |

## A — Production (2026-05-12)

**File:** `apps/frontend/src/components/Sidebar.tsx` — `ITEMS` array, **Owner-visible order** (after `visibleRoles` filter).

For **Owner** role, **19** links render (see table). Non-Owner users omit DOCS, ELD, LEGAL per `visibleRoles`.

| # | Production key | Label (UI) | Route |
|---|----------------|------------|-------|
| 1 | HOME | HOME | `/home` |
| 2 | MAINT | MAINT | `/maintenance` |
| 3 | ACCTG | ACCTG | `/accounting/invoices` |
| 4 | PAYMENTS | PAY | `/accounting/payments` |
| 5 | FACTORING | FACT | `/accounting/factoring` |
| 6 | BANK | BANK | `/banking` |
| 7 | FUEL | FUEL | `/fuel` |
| 8 | SAFETY | SAFETY | `/safety` |
| 9 | DRIVERS | DRIVERS | `/drivers` |
| 10 | CUSTOMERS | CUSTOMERS | `/customers` |
| 11 | DISPATCH | DISPATCH | `/dispatch` |
| 12 | VENDORS | VENDORS | `/vendors` |
| 13 | DOCUMENTS | DOCS | `/documents` |
| 14 | LISTS | LISTS | `/lists` |
| 15 | REPORTS | REPORTS | `/reports` |
| 16 | SAMSARA | ELD | `/integrations/samsara` |
| 17 | LEGAL | LEGAL | `/legal` |
| 18 | 425C | 425C | `/425c` |
| 19 | DRV_APP | DRV APP | `/driver-app` |

**Owner-visible count: 19**

## B — Three-column alignment (Production vs PNG vs P3-claimed)

PNG row order follows May-2 list + alignment to production where obvious. P3 row follows directive **12 + CUSTOMERS + VENDORS + DOCS** (order inferred to match logical module order).

| # | Production (Owner) | PNG baseline (12) | P3-claimed (15) |
|---|-------------------|-------------------|-----------------|
| 1 | HOME | HOME | HOME |
| 2 | MAINT | MAINT | MAINT |
| 3 | ACCTG | ACCTG | ACCTG |
| 4 | PAY | — | — |
| 5 | FACT | — | — |
| 6 | BANK | BANK | BANK |
| 7 | FUEL | FUEL | FUEL |
| 8 | SAFETY | SAFETY | SAFETY |
| 9 | DRIVERS | DRIVERS | DRIVERS |
| 10 | CUSTOMERS | — | CUSTOMERS |
| 11 | DISPATCH | DISPATCH | DISPATCH |
| 12 | VENDORS | — | VENDORS |
| 13 | DOCS | — | DOCS |
| 14 | LISTS | LISTS | LISTS |
| 15 | REPORTS | REPORTS | REPORTS |
| 16 | ELD | — | — |
| 17 | LEGAL | — | — |
| 18 | 425C | 425C | 425C |
| 19 | DRV APP | DRV APP | DRV APP |

## Deltas (explicit)

- **In production but in neither PNG (12) nor P3-claimed (15):** **PAY** (Payments), **FACT** (Factoring), **ELD** (Samsara integration), **LEGAL** (Legal module).
- **In P3-claimed but not in PNG (12):** **CUSTOMERS**, **VENDORS**, **DOCS** (matches directive).
- **In PNG (12) but not in P3-claimed (15):** none — P3 is a strict superset of the 12 baseline per directive.
- **Blueprint vs production:** **MUST 6.2.1.2** specifies **12** icons; production shows **up to 19** for Owner — **spec/implementation drift**.

## Recommendations (non-binding)

1. Decide whether **ACCTG** should remain one icon with flyout vs separate **PAY** / **FACT** icons (drives count + PNG refresh).
2. Decide canonical stance on **LEGAL**, **ELD**, and post-Phase-3 modules relative to the original 12-icon walkthrough.
3. Re-export approved PNGs or update **MUST 6.2.1.2** after Owner decision (separate change; not in this audit commit).

---

_Auditor: Agent-2 P6-FRONTEND-CLEANUP-1 Task 4. Sidebar component intentionally unchanged._
