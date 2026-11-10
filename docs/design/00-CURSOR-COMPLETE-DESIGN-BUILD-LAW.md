# CURSOR COMPLETE DESIGN BUILD LAW — PERMANENT — 2026-11-09

Owner order (verbatim intent): designs must be correct and permanent; do not drift;
fully complete the designs; same concepts for **all tabs and all subtabs**.

This file is the standing Cursor seat rule for ROUND 8.4 / UI-F11125 and every later
design pass. It does not expire. It is enforced by
`scripts/verify-complete-design-build-law.mjs` (wired through the design-parity census
verify step) plus Codex ROUND 8.5 live visual findings.

## What "done" means

A board / tab / subtab is **DONE** only when live at authenticated USMCA, CSS viewport
**1440×900**, the screen is **board-identical**:

1. Same section order and geometry as the approved `.dc.html` / board PNG.
2. Same type family/weight/size for titles and body (V3 boards → **Inter**, not serif).
3. Same control sizes, column alignment, money fully visible (no ellipsis on amounts).
4. Every board element present is **wired** (nav → API → Neon). No mock board numbers.
5. Save / Close (or equivalent) wired on anything that opens.
6. Missing values render **—**. Additive live columns/controls may stay; do not delete
   real engines to fake a screenshot.

Source of truth (priority):

1. `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`
2. `docs/design/DESIGN-BOARD-ROUTE-MAP.md` (45 boards → routes / tabs / triggers)
3. `docs/design/v3/*.dc.html` + `docs/design/v3/maintenance-vehicle-graphics/*`
4. `docs/design/boards/*`, approved-screens, design-parity-contract
5. Live fail lists: `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-CURSOR-FIRST-VISUAL-FINDINGS.md`
   and `docs/design/DESIGN-PARITY-VERIFY.md`

## Hard FAIL — surface / drift (never ship as design-complete)

These are **not** complete design builds. Shipping them as ROUND 8.4 / "design done" is a
**breach** of this law:

| Drift | Why it fails |
|---|---|
| Census hub-label pins only | Labels in source ≠ board geometry / wiring |
| Chrome rename / casing / copy tweaks alone | Does not recreate the board |
| Coding on top of incomplete prior layout | Bolt-ons drift; rebuild from the board file |
| Per-page one-off font overrides to hide a shared token conflict | Fix the shared standard |
| Claiming census ratchet / OUTBOX tip as visual acceptance | Codex ROUND 8.5 owns visual accept |
| "Pass" because a static census row is green | Missing board/element is never a pass |
| Matching one tab and leaving sibling tabs/subtabs on the old system | Same concepts for **all** tabs/subtabs |

## Build method (mandatory)

1. Open the mapped board file for the route **before** editing.
2. Recreate layout from the board (sections, grid proportions, alignment, type).
3. Bind every figure to the live engine; keep additive real functionality.
4. Apply the **same** shell/type/table/money rules on every tab and subtab in that module.
5. Only then tip OUTBOX. Do not tip "design complete" without board-identical work in
   `apps/frontend/src/pages/**` (or shared shell/components the board requires).

## Shared shell (all modules)

Approved V3 boards share: **42px** top header, **66px** icon rail, Inter page titles,
left-aligned board table bodies, money columns that never truncate. Fix shared chrome
once; do not special-case one module.

## Cursor read order every design turn

1. This file
2. Latest Codex findings under `docs/bus/lead/*CODEX-ROUND-8.5*`
3. `docs/design/DESIGN-PARITY-VERIFY.md`
4. `docs/design/DESIGN-BOARD-ROUTE-MAP.md`
5. The specific `.dc.html` for the board being built

No match / Dreamline / invented AUTH in this pass. USMCA only. Trailer 445 = broker.
