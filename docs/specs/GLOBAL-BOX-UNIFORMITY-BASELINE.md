# IH35-TMS — Global Box Uniformity Baseline (LOCKED)
Source: Jorge, GLB-04, 2026-09-03. Companion to `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md`.

## The rule

> Any row of boxes — KPI tiles, form fields in a grid, filter chips, card rows — is **uniform
> height and uniform width unless content genuinely demands otherwise.**

"Content demands otherwise" means the field's own DATA needs the room (a full customer name, a
long free-text note), not that nobody defined a shared width for the row. A row where six fields
each got their own ad-hoc width because their grid template was hand-typed per field is the
defect this locks against, not a deliberate exception.

## What "uniform unless content demands otherwise" looks like

- **Uniform (the default):** every box in the row shares one `grid-template-columns` / one
  fixed width token / one shared component. A picker, a select, and a short text input sitting
  in the same row render the same width even though their underlying controls differ.
- **Content-driven exception (allowed, must be intentional):** a field that structurally needs
  more room (customer name, description, a two-column span) is WIDER by design, not by omission
  — and it should still be a clean multiple of the row's own grid unit (e.g. "spans 2 columns"),
  not an arbitrary one-off pixel value nobody chose on purpose.

## How this was found (2026-09-03 live measurement)

Live evidence inside the Book Load wizard's Section A (one row, `BookLoadModalV4.tsx`), same
form, same row:

| field | rendered width |
|---|---|
| commodity combobox | 131px |
| customer picker | 271px |
| trailer requirement | 257px |
| truck unit | 257px |
| trailer unit | 522px |
| factoring company | 178px |

Six different widths in one row, each coming from that row's own ad-hoc grid definition — not
from a shared control style. This is the canonical example of the defect: no field here needed
522px of "content demands"; the row template was never designed as one grid.

## Where this applies

Every screen: lists, catalogs, forms, modals, wizards, home KPI bars, drawers. Two already-shared
box primitives exist and should be reused rather than re-invented per surface:
- `apps/frontend/src/components/layout/KpiCard.tsx` / `DrillKpiCard.tsx` — KPI/stat tiles.
- A form row belongs to ONE `grid-template-columns` (or an explicit shared width token) per row,
  not per field. See `apps/frontend/src/design/tokens.ts` for the spacing/sizing tokens already
  in use elsewhere in the app.

**Known exception, respect existing law first:** a surface already governed by its own layout
guard (e.g. `scripts/verify-dispatcher-home-no-box-in-box.mjs`'s single-frame/no-nested-border
pattern) keeps that guard's contract — GLB-04 does not license breaking a more specific,
already-enforced law to force uniformity through a different shared component. Fix box
uniformity WITHIN the existing pattern (locked height/width tokens applied to that pattern's own
boxes) rather than swapping primitives.

## Application

No component may deviate without Jorge's explicit approval, same standing as
`GLOBAL-TYPE-SIZE-BASELINE.md`. Each seat applies this on ITS OWN owned surfaces; a
violation found inside a file another seat is actively working goes to that seat's queue
(as a filed finding, not a same-session edit) rather than risk touching a shared file mid-flight.
