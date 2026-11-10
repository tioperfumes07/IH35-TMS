# ROUND 8.5 — independent board parity verification

## Status — 2026-11-09, first live batch

**NOT COMPLETE. No board is certified exact or fully wired.** Three home boards have initial live visual evidence; remaining boards and exhaustive element counts are UNVERIFIED. A static label census is not visual or functional acceptance.

Reference: owner's `11-09-2026-IH35-ALL-PAGE-DESIGNS` export, approved V3 renders and `.dc.html`, and `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-Design-Parity-Verify-All-Boards.md`. Exclude old LoadWizard, V2 and PREVIOUS boards. Keep legitimate additive functionality; do not delete columns or data to imitate a screenshot.

Browser: authenticated USMCA, Chrome, measured `innerWidth=1440`, `innerHeight=900`. Browser zoom was 80%; a requested 1440×900 override initially produced 1800×1125 CSS pixels. Corrected using a 1152×720 override and verified actual CSS dimensions before grading. Screenshots may have a different physical pixel scale; raw pixel differences are NOT yet normalized or scored. Banking/Accounting inspected after the new-version Reload. Private screenshots are under `~/Downloads/codex-round8-5-design-parity/`; do not commit production personal/financial data.

| Board | Visual result | Exhaustive element total/pass/fail | Functional proof |
|---|---|---|---|
| Insurance | FAIL: I1–I5 below, plus shared S1/S2 | UNVERIFIED; not a completed census | Policy year View all opens Policies, 3 loaded rows, no mutation |
| Banking | FAIL: B1–B3 below, plus shared S1/S2 | UNVERIFIED; not a completed census | Navigation and data rendering only; actions NOT certified |
| Accounting | FAIL: A1/A2 below, plus shared S1 | UNVERIFIED; not a completed census | Navigation and data rendering only; actions NOT certified |
| Other approved boards | UNVERIFIED | UNVERIFIED | No fresh Round 8.5 claim |

## Confirmed differences for Cursor ROUND 8.4

| ID | Board expectation | Observed live result | Rendering source / acceptance |
|---|---|---|---|
| S1 | Top header 42px; narrow 66px navigation rail; compact single-line top bar | Banking header measured 103.21 CSS px, account menu wraps; rail visibly wider. Main content displaced downward/right | Shared shell/header/sidebar. Match board geometry at actual 1440 CSS width without deleting controls; preserve usability at smaller widths |
| S2 | Inter heading | Insurance and Banking H1 computed `600 22px / 33px Source Serif Pro, Charter, Georgia, serif` | `apps/frontend/src/components/layout/PageHeader.tsx:87` explicitly selects `typography.fontSerif`. Shared token/approved-board conflict must be resolved consistently, not per-page font overrides |
| I1 | Policy labels left of timeline; bars and amounts on same row | Labels and amounts above each full-width bar | `apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx:324`; column-oriented row structure. Preserve live policy/carrier links, align label + timeline in columns |
| I2 | One red dashed Today line across all policy rows, caption aligned to line | Separate green markers in each row; gray caption below chart | `InsuranceHomeBoard.tsx:363–380`; implement the board's shared time-axis marker using real dates |
| I3 | Full premium values, single-line total | Premium cells truncate and total wraps into two lines at 1440 CSS px | `InsuranceHomeBoard.tsx:397–424` and shared ParityTable sizing; minimum money width, no ellipsis on amounts |
| I4 | Fleet Covered explanatory footer inside Premium by coverage panel | Note sits below both panels | `InsuranceHomeBoard.tsx:427`; move note into panel footer while preserving its link |
| I5 | Header subtitle `Policies · fleet covered · claims · coverage gaps` | `Policies, fleet coverage, claims, and lawsuits` | Insurance layout/header subtitle: match the approved text; do not remove Legal workflows |
| B1 | Reconciliation Bank/Book/Diff values fully visible | DOM measured 10 ellipsized cells in the 15-row reconciliation table | `apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx:720–763`, shared column widths; monetary cells must remain readable |
| B2 | Latest lines immediately below the two summary panels | Latest lines table begins at y=2196 CSS px; initial view omits it. 15 drift rows and 33 pending rows expand preceding content | `BankingHomeBoard.tsx:693–814`; restore bounded summary-panel layout and keep full lists reachable. Do not silently cap or discard pending transactions |
| B3 | Account body labels left-aligned | Accounts table body labels centered | `BankingHomeBoard.tsx` account column plus ParityTable board appearance. Preserve centered sortable headers if separately required; body alignment must match board |
| A1 | Accounting subnav is one compact row | Navigation wraps to two rows at 1440 CSS px | Accounting navigation includes additional counts/amounts and labels; preserve actions but restore compact layout/overflow behavior |
| A2 | Lower panels use asymmetric widths (Receivables/Cash wider than Settlements) | All three measured 425 CSS px wide | `apps/frontend/src/pages/accounting/AccountingHubPage.tsx:631–818`; adopt reference proportions rather than three equal columns |

Data values, current month, policy elapsed days and real row populations differ legitimately from the October mockup. They are not evidence of a defect by themselves. Added table settings, sort controls, real coverage values and the Expires column are not to be removed merely for pixel equality. Confirmed screenshot differences do not establish wrong ledger balances.

## Reference integrity observations

Repo root has 43 unprefixed `.dc.html` files, not automatically 43 approved canvas-1 boards. The manifest's approved V3 set contains 42 after excluding the three old LoadWizard boards; only 22 literally include `IN THE LIVE APP` in their title, with the other approved entries labeled SETTLEMENTS MODULE / DISPATCH / NEW V3. Do not filter approval by that phrase alone.

Initial comparison of the 43 unprefixed files with the export: 6 exact; 30 equal after normalizing title/user-label and trailing whitespace; 6 settlement boards differ further; Modal-FuelAssignment has no corresponding file in this canvas export. The first difference in each of those six settlement boards is a sort-indicator span present in the export and absent in the repo. Full difference classification is pending; do not describe all files as identical except title.

## Remaining acceptance work

Complete the 45-board route/trigger map, reviewed element census, all live interactions safe to exercise without production writes, same-scale board/live/diff artifacts with privacy protection, and the claimed/registered fail-closed guard. Missing evidence must remain UNVERIFIED and block completion. No implementation or production data changed in this first batch.
