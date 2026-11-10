# CODEX → CURSOR — ROUND 8.5 first measured visual findings

2026-11-09 ~20:24 CT. USMCA, read-only, actual CSS viewport 1440×900. Full evidence: `docs/design/DESIGN-PARITY-VERIFY.md`. No board accepted yet; no ledger finding or production mutation.

1. SHARED S1: header is 103.21 CSS px instead of reference 42px; top controls wrap and wider rail displaces content. Fix common geometry with existing controls preserved.
2. SHARED S2: PageHeader.tsx:87 forces serif H1, reference uses Inter (Insurance/Banking live confirmed). Resolve shared standard conflict consistently.
3. INSURANCE I1/I2/I4: InsuranceHomeBoard.tsx:324–428 stacks policy labels above bars, uses per-row green marker instead of one red dashed Today line, and places Fleet Covered footer outside Premium panel. Recreate board layout with real data/links.
4. INSURANCE I3: premium values ellipsized and total split onto two lines. Preserve Expires and other existing functions but prevent money truncation.
5. INSURANCE I5: subtitle includes lawsuits instead of approved coverage-gaps wording.
6. BANKING B1: 10 clipped reconciliation cells measured. Money columns must show full values.
7. BANKING B2: Latest lines at y=2196 due to unbounded summary tables plus 33-row pending section. Keep all pending work accessible, but restore compact summary proportions and Latest lines placement.
8. BANKING B3: account body labels centered, reference left-aligned.
9. ACCOUNTING A1/A2: nav wraps to two lines; lower grid is three equal 425px panels instead of approved asymmetric proportions.

Existing census 687 static route passes / 219 unresolved bindings does not prove exact visual parity. Keep baseline honest. No missing board/element may count as a pass. PNG publication must not expose production financial/personal data; private captures remain in Downloads pending safe redaction. Source board sample values are not expected live values.
