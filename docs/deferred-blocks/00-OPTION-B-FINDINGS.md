═══════════════════════════════════════════════════════════════════════════════
IH35-TMS — OPTION B: DEEP CLICK-THROUGH FINDINGS + FIX BLOCKS
Date: 2026-06-11. Each defect below was REPRODUCED live (clicked, not assumed).
These blocks are DEDUPLICATED against Cascade's existing queue (audit-linkage A1-A9,
B1-UI-DEFECTS-BATCH currency/cards/names, B2-RETURN-ARROW). Listed here = NEW defects.
═══════════════════════════════════════════════════════════════════════════════

CONFIRMED DEFECT CLASSES (evidence)
  1. DEAD CLICKS — Accounting top-nav "Factoring" tab is a <button> whose click does
     nothing (URL stays /accounting, content stays Home). Sibling "Bills" tab works.
  2. DUPLICATE NAME, DIVERGENT BEHAVIOR — sidebar "FACT" is an href link to
     /accounting/factoring (works); the Accounting-page "Factoring" tab is a dead
     button. Same label, different implementation, one broken. (Jorge's exact concern.)
  3. TWO COEXISTING NAV LAYOUTS — /accounting (Home) renders a CLEAN 12-tab header;
     /accounting/invoices and /accounting/factoring render a BLOATED 18-tab legacy
     header (adds AR Aging, AP Aging, Collections, Vendors, Customers, Multi-entity,
     Maintenance & shop, Faro CSV import, Factor reconciliation). Root cause of the
     "too many tabs that don't belong" Jorge flagged.
  4. INCONSISTENT FILTER DROPDOWNS — within one form, some controls are proper
     filterable comboboxes (role=combobox / aria-autocomplete) and some are plain
     inputs/native selects that open a list but do NOT filter-as-you-type.
  5. NAV PATTERN SPLIT — Safety + Insurance use breadcrumb nav; other 24 use arrow+tabs.
  6. TAB-POSITION SPLIT — Lists + Reports render tabs ABOVE the title; others BELOW.
  7. DEAD/STUB TABS — Payroll (#26) redirects to /home; Tasks (#2) is a placeholder.
  8. MISSING RETURN ARROW — 425C (dark banner header).

FIX BLOCKS (in this zip), in recommended order:
  OB1  NAV-HEADER-UNIFY            (kill the legacy 18-tab header; one shared clean nav)
  OB2  DEAD-TAB-AUDIT-AND-FIX      (every tab/click navigates or switches content — no dead buttons)
  OB3  DROPDOWN-FILTERABLE-STANDARD (all list inputs become type-to-filter comboboxes)
  OB4  NESTED-INPUT-SWEEP          (find + fix any input-within-input boxes)
  OB5  NAV-PATTERN-STANDARDIZE     (one nav pattern app-wide: arrow+tabs, tabs below title)
  OB6  DEAD-STUB-TAB-RESOLUTION    (Payroll→Settlements placeholder; Tasks stub labeled)

DEPENDENCY / DEDUP NOTES
  - OB1 should land BEFORE the Settlements page (D1) and before factoring cleanup, since
    it fixes the shared header those pages inherit.
  - OB2/OB3/OB4 overlap conceptually with B1-UI-DEFECTS-BATCH but are DISTINCT defects
    (B1 = currency/card-size/blank-names; these = dead clicks / dropdown filtering /
    nested inputs). Keep separate so neither balloons.
  - All are UI changes to EXISTING pages → each needs a visual preview approved before
    code dispatch (per locked rule).
  - Payroll→Settlements (OB6) is just the placeholder/redirect cleanup; the real
    Settlements build is D1 in the deferred register.
═══════════════════════════════════════════════════════════════════════════════
