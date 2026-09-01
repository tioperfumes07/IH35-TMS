# LAYOUT LAW — owner 2026-09-01 (LAY-01)

**Register:** `LAY-01` · **Guard:** `scripts/verify-layout-law.mjs` (verify-step 10118)

Everything adjusts to the page — every module, every modal. One written law; screens stop re-deciding sizing ad hoc.

## 1. Module page shell (Drivers / Dispatch gold pattern)

- Root wrapper: `className="space-y-3"` on canonical module pages (`pages/Drivers.tsx`, `pages/Dispatch.tsx`, and siblings).
- `PageHeader` → optional KPI strip → subnav → body panels. Section gap is **12px** (`space-y-3`), not mixed `space-y-4` / `space-y-6` on the same module.
- Body panels use **one** outer frame per section (`rounded-sm border border-gray-200 bg-white p-3`). Fields inside are **flat** — no second bordered card (companion: `scripts/verify-no-nested-box.mjs`).

## 2. Box-in-box (QBO / NetSuite single frame)

- A bordered + rounded container must not nest directly inside another bordered + rounded container.
- Inner differentiation = background tint or `border-t` separator only — never a full inner frame.
- Ratchet: `verify-no-nested-box.mjs` baseline per file; **new** nesting fails CI.

## 3. Modal / drawer scroll ownership

- Fixed shell: `flex flex-col` with `min-h-0`; only the middle body scrolls (`flex-1 min-h-0 overflow-y-auto`).
- Header and footer are `shrink-0`. Sticky positioning inside a scrolling outer aside is forbidden (LoadDetailDrawer pattern).

## 4. Toolbar control height (companion LAY-10 / UI control law)

- Header toolbar rows use **one height:** `h-9` (`FILTER_CONTROL_SIZE_CLASS` / `BUTTON_MD_SIZE_CLASS` in `design/tokens.ts`).
- Segment toggles use `ToolbarSegmentControl`; primary actions use `Button` md — not mixed `text-xs` + `px-2 py-1` chips beside `h-9` buttons.

## 5. KPI / density

- KPI tiles: shared `KpiCard` + `KpiStrip` (`inline-flex shrink-0`; content-sized width — LAY-04/05).
- Wizard callouts (e.g. Book Load expected adjustments): flat grid inside **one** tinted frame; error states are flat strips, not nested bordered boxes.
