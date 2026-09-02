# GO — PLANNER UI DEFECTS (owner-reported, reproduced live with measurements)
**Owner 2026-08-31. Observed live on `app.ih35dispatch.com`, USMCA, API `a669b0f`.**
Every number below was measured in the live DOM. Nothing here is an opinion about taste.

---

## P1 · PLAN-01 — Driver/Truck Planner: name and unit are jammed into one cell
**Owner:** *"Name in one column, unit in another if applicable, and + Book in another."*

`.pg-name` is a single 240px cell holding an `<a>` (name) and a `<span>` (unit) with **no
separator and no gap**. Live text renders as:

```
PEDRO ABRAHAM LOPEZ COLLADOT149      <- "COLLADO" + "T149" with nothing between them
```

Measured: cell `clientWidth 238`, `scrollWidth 263` → **25px clipped**, `white-space: nowrap`.
80 such cells on the Driver Planner. Drivers with no unit render a bare `—` in the same run.

**FIX — three real columns in the frozen left pane, not one cell with three children:**

| Column | Content | Width | Behavior |
|---|---|---|---|
| Name | driver / truck name | flexible, `min-width` ~180px | truncate with ellipsis + `title` attr |
| Unit | `T149`, or empty | fixed ~64px | right-aligned, monospace-ish, **blank when none — no `—`** |
| Book | `+ Book` action | fixed ~72px | icon+label button, own cell |

Do **not** solve this by widening `.pg-name`. It must become a grid of three cells so the
columns align down the whole planner. Apply to **Driver Planner, Truck Planner, and Loads
Planner** — the owner said all of them.

---

## P1 · PLAN-02 — Loads Planner: 64% of the planner is off-screen with no affordance
**Owner:** *"The loads are lost."*

```
.pg-scroll   clientWidth  653
             scrollWidth 1820
             hidden      1167 px  = 64% of the grid
```
The date grid is 1,820px wide inside a 653px viewport. There is no sticky scrollbar, no
edge shadow, no "← →" affordance, and no today-anchor. A load dispatched outside the first
~6 visible days is simply invisible and the user has no cue it exists.

**FIX:**
1. **Anchor the initial scroll to today**, not to the start of the month.
2. Persistent horizontal scrollbar on `.pg-scroll` (do not rely on macOS overlay scrollbars,
   which are invisible until touched — that is why it reads as "lost").
3. Gradient/shadow fade on both edges whenever `scrollLeft > 0` or more content sits right.
4. An off-screen counter: **"8 loads outside this range →"**, clickable to scroll.
5. Zoom control — Day / Week / Month — so a month fits deliberately instead of by accident.

---

## P1 · PLAN-03 — Load bars clip their own labels; nothing auto-adjusts
**Owner:** *"The loads do not auto adjust, or the size of the text to the box, the boxes seem
cut off."*

Bar width is a function of **trip duration**. The label is a fixed-length **load number**.
Nothing reconciles the two, so short trips can never show their own label:

| Bar label | Needs | Gets | Cut |
|---|---|---|---|
| `LUSMCAFREIGHT-20260806-0001` | 206px | 100px | **106px** |
| `L-20260808-0069` | 204px | 204px | 0 |
| `L-20260808-0074` | 204px | 204px | 0 |

`font-size: 11px` fixed, `white-space: nowrap`, `text-overflow: ellipsis`. A one-day load is
~100px, and the `LUSMCAFREIGHT-` prefix alone eats most of it.

**FIX — make the label fit the box instead of overflowing it:**
1. **Drop the redundant prefix in the bar.** Inside the Loads Planner every row already *is*
   a load. Render the short form (`0069`, `0001`) and keep the full number in the `title`
   and in the left-hand Name column.
2. **Tiered label by available width:** ≥180px → full number · 90–180px → short number ·
   40–90px → initials or nothing · <40px → no text, tooltip only.
3. Never let a bar render text it cannot show — measure, then choose the tier.
4. Bars narrower than ~24px get a minimum width so they stay clickable.

---

## P2 · PLAN-04 — Dispatch tab count badges look noisy, and one has a grammar bug
**Owner:** *"What are the numbers next to all the top tabs, 25, 12, 1 — it looks dirty."*

Every tab carries a count chip: `Load board 23 · Assignments 14 · At-Risk 1 · Detention 1 ·
Late 1`. Tooltip text is generated as `"{n} items"`, so a count of 1 renders **"1 items"**.

**FIX:**
1. **Only badge what needs attention.** At-Risk, Detention and Late are exception queues —
   badge those. Load board and Assignments are just "everything"; their count belongs in the
   view header (`23 loads`), not as an alert chip on a tab.
2. **Hide the badge at zero** rather than showing `0`.
3. Fix the pluralization: `1 item` / `23 items`.
4. Use one muted neutral for informational counts and reserve the alert color for the
   exception queues, so the eye lands on what is actually wrong.

---

## Verification (each must be checked live, not asserted)
- `.pg-name` resolves to three aligned columns on all three planners; zero clipped cells
  (`scrollWidth <= clientWidth` for every one).
- Loads Planner opens anchored on today; the off-screen counter matches the number of loads
  outside the visible range.
- No bar renders a label wider than its own box: assert `scrollWidth <= clientWidth` on every
  `.pg-bar` at 1280px, 1440px and 1920px viewports.
- No tooltip in Dispatch reads `"1 items"`.

**Screens only — no schema, no money path, no GL.** This does not touch the 016 sequence.
