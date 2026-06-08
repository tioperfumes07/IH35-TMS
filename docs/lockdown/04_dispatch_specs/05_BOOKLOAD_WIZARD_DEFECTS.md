# Book Load wizard — DEFECT FIXES (DO NOT redesign the wizard; fix only)

## 2026-06-07 — locked by Jorge. Keep the wizard design. Fix these defects (additive/correction).

A. "In load from template" renders as a box-within-a-box — fix nesting/layout.
B. Box sizes inconsistent: "Customer" larger than "Customer WO #" → make equal size.
C. Headers not centered (commodity, weight, etc.) → center them.
D. Weight field: typing 24600 must show 24,600 (thousands separator) + add kg/lbs toggle.
E. Accounting amount fields wrong format: typing 4800 shows 48.00 (wrong). Must show 4,800.00. Fix on
   linehaul (lineal), fuel surcharge, accessorial, cash advance, fuel advance, and all amount fields.
F. "Factoring company" box not the same size as Cash advance / Fuel advance → make all equal size.
G. Section B (Equipment): trailer type / truck unit / trailer unit / driver / team driver dropdowns do NOT
   collapse when unselected, the list stays visible, there is no way to unselect, and you cannot advance.
   Convert to filter-typeahead (per global rule 3): type to filter, collapse on blur, clear/unselect control,
   never block advancing.
H. Driver list shows "Driver 1 / Driver 2" instead of the driver NAMES → show names.
I. These selection lists were meant to be FILTER lists (type → related matches), not plain dropdowns.
J. Section C (Routing): boxes out of proportion → adjust sizes, clean alignment, professional. Research peer TMS.
K. Stop 1 "Time window" and "Free time / lumper" boxes too large → universal size; same collapse/unselect fix.
L. Dates everywhere → clean calendar input, type-and-auto-adjust (per global rule 7).
M. Box sizes + alignments overall: too large / uncomfortable / wastes space → tighten to the universal standard.
N. Support RESERVING a load at book time with NO unit/driver assigned (scheduling ahead) — see board logic.
