# DESIGN-SPEC-MEASURED-LIVE-2026-09-04

Owner walkthrough, 2026-09-04, measured live off the running app with `getComputedStyle` — not
adjectives. This is a **transcription** into the repo of numbers that otherwise existed only in
chat/a Claude Project doc ("ORCH"). It does not invent a new scale; it feeds
[`GLOBAL-TYPE-SIZE-BASELINE.md`](./GLOBAL-TYPE-SIZE-BASELINE.md), which is the LOCKED baseline this
doc's numbers were folded into. Where the two disagree, `GLOBAL-TYPE-SIZE-BASELINE.md` wins (it is
kept current); this file is the dated record of what was measured and why each number was chosen.

## 1. Banner

Remove "Tasks" and "Program" buttons from the shared top banner (owner order). **Archive, never
delete** — Rule 07 / additive-only law: the two buttons stay in source, gated behind a flag
(`TASKS_PROGRAM_BANNER_ARCHIVED` in `Topbar.tsx`), not removed. Both routes (`/tasks`, `/program`)
remain reachable by URL.

## 2. Corner radius — one token

Live drift measured across one screen: `2px` (`rounded-sm`, KPI tiles/banner buttons — **the
correct token**), `4px` (`rounded`, section wrappers/view toggles — wrong), `0px` (table headers),
`9999px` (`rounded-full`, banner icon buttons — a deliberate pill, not a "rounded box").

**Fix:** one token, `rounded-sm` / 2px, everywhere except deliberate pills/avatars (which keep
`rounded-full`, 9999px, untouched — that utility makes circles, not "rounded boxes"). Applied as a
single `@theme` override in `apps/frontend/src/index.css` (`--radius-xs/sm/md/lg/xl/2xl/3xl/4xl` +
bare `--radius`, all `2px`) so it reaches Tailwind's `rounded-*` scale everywhere it's used
(~5,278 call sites, grep-counted 2026-09-04) from one place. `apps/frontend/src/design/tokens.ts`
(`radiusCard`/`radiusPill`/`radiusButton`) and `apps/frontend/src/design/design-tokens.css`
(`--radius-sm`/`--radius-md`) synced to `2` / `2px` for their direct `var()`/inline-style consumers.

## 3. Centering — headers, columns, KPI values

Measured: every table header was `text-align: left` (numeric columns right), every KPI tile was
`text-left`. Owner wants centered, system-wide.

**Fix:** `ParityTable.tsx`'s `<table>` base class flipped `text-left` → `text-center` — `text-align`
is an inherited CSS property, so every header/column that doesn't declare its own explicit
`text-right`/`text-left` now centers; a column that already declares its own alignment (e.g. a
right-aligned money column) is unaffected — a direct declaration on that `<td>`/`<th>` always beats
an inherited value, regardless of source order. Header sort-button justification (`justify-start`
→ `justify-center`, with `justify-end`/`justify-start` still honored for columns that ask for them)
matches. `DrillKpiCard.tsx` and Safety's own local `KpiTile` (both label-over-value stacked tiles)
centered the same way. Dispatch Kanban lane headers (item 6 below) centered via a 3-column grid so
the title is true-centered independent of the count badge's width.

## 4. Clickable boxes — one size

Measured: banner buttons `28px` height / `12px` font / `2px` radius / `0 8px` padding (**correct**);
view toggles `32px` / `12px` / `4px` radius (wrong); "Back" `16px` font, inherited from `body`
(wrong — `body` never set its own `font-size`, so anything that forgot its own override silently
rendered at the browser default, 16px, instead of the locked 12px body scale).

**Fix:** `apps/frontend/src/design/tokens.ts`'s `BUTTON_MD_SIZE_CLASS` / `BUTTON_ICON_SM_SIZE_CLASS`
collapsed onto the one correct value — `h-7` (28px) / `text-xs` (12px) / `px-2` (0 8px padding) —
cascading through `Button.tsx` everywhere it's used. This supersedes the 2026-09-01
UI-CONTROL-LAW-SPEC's two-tier `h-9`/`h-8` scale with the one clickable-box target the owner
re-measured on 2026-09-04. `ToolbarSegmentControl.tsx` (the "view toggles" example, 32px/4px)
decoupled from `FILTER_CONTROL_SIZE_CLASS` (a filter/search-input height, not a button height) and
fixed to the same `h-7`/`text-xs`/`px-2` spec directly. `apps/frontend/src/index.css`'s `body` rule
now sets `font-size: 12px` explicitly — the one root-cause line that fixes "Back" and any other
component that forgot its own override, without hunting every call site.

## 5. KPI tile size

Owner reference: Safety module. Measured:

| Tile | Height | Role |
|---|---|---|
| Safety "Active Drivers" | 93px | **target** |
| Safety "Total Safety Events" | 101px | **hard ceiling** — nothing renders taller |
| Load Costs board tile | 108px | over the ceiling (fixed below) |

Target/ceiling, centered, 2px radius, 1px border, padding `4px 8px`, grid `gap-2`.

**Fix:** `tokens.ts` — `kpiTileTargetHeight: 93`, `kpiTileMaxHeight: 101`, `kpiTilePaddingY: 4`,
`kpiTilePaddingX: 8`. Wired as an inline `maxHeight` style on `DrillKpiCard.tsx` (the shared KPI
tile used across 26+ files: dispatch, accounting, banking-adjacent, safety, maintenance, legal,
insurance, fuel, finance) and on Safety's own local `KpiTile` (`SafetyHomeTab.tsx`), with padding
normalized to `py-1 px-2` (4px/8px) on `DrillKpiCard`. `LoadCostsBoardPage.tsx`'s KPI grid — which
measured 108px, had no `gap-2`, and used `border-b` instead of a full border — fixed to
`grid gap-2` + padding, matching Safety's own grid pattern (`SafetyKpiRow.tsx`).

Note: an earlier pass in this same working session estimated the ceiling by measuring
`/safety/home` directly in Chrome and got a different pair of numbers (Active Drivers container
1053×75.5px — a full-width multi-stat strip, not a compact tile; Total Safety Events 257.3×67.5px).
That measurement and this doc's 93px/101px disagree, most likely because they measured different
elements or a different build. This doc's numbers (the owner's own, ORCH-measured) are the ones
wired into the tokens; the discrepancy is recorded here rather than silently resolved.

## 6. Table headers — one height, plus casing

Measured: navy `rgb(20,49,79)` = `#14314F` ✓, `11px`/`700`/uppercase ✓ — both already correct — but
two different header row heights live at once (Dispatch `30px`, Load Costs `34px`), and left-align
(covered in §3).

**Fix:** `tokens.ts`'s `tableHeaderHeight` (previously `26`, only read by `DataTable.tsx` —
`ParityTable.tsx` had no explicit header height at all, which is how two live instances of the same
component drifted to 30px and 34px) is now `30`, applied as an explicit `height` style on
`ParityTable`'s `<th>` so both `DataTable` and `ParityTable` read the same one number going
forward.

Item #18 from the owner's walkthrough ("LOCATION" rendering in all-caps in source while sibling
column labels are title-case, relying on the shared `uppercase` CSS transform instead) was **not
located** in this pass — grepped `apps/frontend/src` and `apps/driver-pwa/src` for the literal
string with no match. Flagged rather than guessed at; needs the owner to point at the actual
screen/column so the exact source string can be found and normalized.

## 7. Kanban lane headers (item #13)

Measured/requested: center + outline. `DispatchKanban.tsx`'s lane headers (`ColumnDisplay`, both
the `collapsedByDefault` and expanded render paths) previously used `justify-between` (title left,
count badge right) with only a `border-b`. Fixed to a 3-column grid (`1fr auto 1fr`) so the title
sits true-centered regardless of the count badge's width, and the header's border changed from
`border-b` to a full `border` (the "outline") at the same 2px radius as everything else.
