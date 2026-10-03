# ALL CODERS — ROUND 326.5 — DESIGN PARITY + APP-WIDE FILTER AUDIT
Claude Lead 2026-10-02 · USMCA only · this sits ON TOP of your existing queue, it does not replace it

Owner order, verbatim: *"AUDIT THE ENTIRE APP FOR FILTERS, AND RECODE THEM TO THE FILTERS THAT ARE
SUPPOSED TO BE ON THE APP, THE TEXT, THE SIZE, ETC. GET THE PREVIEWS OF MAINTENANCE, BANKING,
FACTORING, CUSTOMERS, VENDORS, DRIVER PROFILE, GET ALL THOSE DESIGNS YOU CREATED AND RENDERED FOR ME
FULLY AND TOTALLY BUILT IDENTICAL TO THEM, NOT LIKE THE APP IS NOW."*

READ FIRST: `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`
TOKENS: `docs/design/ih35-design-tokens.css`
BOARDS: `docs/design/boards/{banking,driver-customers-vendors,maintenance}/`

The boards are the specification. **Identical** means a screenshot of the app and a screenshot of
the board show the same screen. Build the layout, control sizes, type scale, palette and copy
exactly; bind every number to the live engine behind it. A board's hardcoded figure never ships —
the app computes it live and the coder pastes the query.

You are CODING. Not seeding, not feeding, not fixing data by hand. Engines, screens, filters.
No Chrome verification — the owner walks every screen himself.

---

## WHO BUILDS WHICH BOARDS

| Seat | Boards | Count |
|---|---|---|
| CC-2 | `banking/` — Main, Transactions, Reconciliation, Accounts, RelayCard, DriverEscrow + factoring to the same system | 6 |
| CC-3 | `driver-customers-vendors/` — Main (Driver Hub Home), DriverDetail, Customers, Vendors | 4 |
| CC-1 | `maintenance/` — the engines behind all 9 boards (E-14, E-15, E-16, E-17, PM, WO linkage) | 9 |
| CURSOR | `maintenance/` — the 9 screens themselves, against CC-1's engines; plus E-40 Faults view, E-41 engine status board, E-42 dashcam viewer | 9 + 3 |

Factoring has **no separate board**. Its surfaces are the banking system plus the factoring summary
card that deep-links out of Banking Home. CC-2 builds factoring to these same tokens and rules and
does not invent a second visual language.

---

## PART 1 — THE APP-WIDE FILTER AUDIT (every seat, your own surfaces)

The owner's measured complaint is that filters across the app are the wrong filters, the wrong text
and the wrong size. Audit every list surface you own and recode it. Report a table: surface, what
the filter bar is today, what the board says it must be, what you changed.

Each filter bar is rebuilt to this shape, in this order, on one line:

1. **Status chip buttons first, each carrying its live count.** `Active 19` · `Probation 3` ·
   `On leave 0` · `Inactive 108` · `All 130`. The selected chip is navy fill
   (`background #14314F`, `color #FFFFFF`, `border #14314F`); the rest are white with
   `border #C6D1DC` and `color #1F2A44`. Font 11.5px, height 34px, padding `0 11px`.
   **The count is live.** A chip with a stale or hardcoded count is a defect.
2. **A 1px vertical divider** — `width 1px; height 22px; background #E2E8F0; margin 0 4px`.
3. **Multi-select chip filters** for unit, account, category: a bordered well
   (`border 1px solid #C6D1DC`, `radius 3px`, `min-height 34px`, `padding 3px 6px`) holding filter
   tokens. Each token is `background #E8EEF5`, `color #1F2A44`, 11.5px/600, `radius 2px`,
   `padding 3px 5px 3px 7px`, with an `×` button (`color #64748B`, `aria-label "Remove <value>"`).
   A faint prompt sits at the end — `Unit…` / `Add…` / `Add unit…`, `font-size 12px`,
   `color #94A3B8`, `padding 0 6px`.
4. **A type selector beside them** — a `<select>` at 34px, `border #C6D1DC`, `radius 3px`,
   `padding 0 8px`, with an honest `aria-label`. `All pay bases`, `All types`, `All ages`,
   `All accounts (8)`.
5. **Date boxes at 132px**, tabular figures, with a literal `to` between them
   (`font-size 12.5px`, `color #8895a3`). Never full-width. Never container-sized.
6. **Search, flex-grow, min-width 180-220px**, 34px, with a real visually-hidden `<label>`.
   The placeholder names the whole set and says hidden is not missing:
   `Search all 1,249 — hidden is not missing` · `Search name, phone, CDL…` ·
   `Search description, unit, load, amount`.
7. **The view toggle** — `Regular` / `Master-detail` (or `Master-detail` / `List` on the Driver Hub),
   selected one navy. Same position, same size, on every list in the app.
8. **`Export`** where the board shows it.
9. **The gear, last**, 34px square, `aria-label "Choose columns"`, `title "Choose columns"`, opening
   a working column chooser.

Below the bar, where the board shows them: **active filter chips** on a `#FAFCFD` strip with the
`FILTERING` label and a `Clear all` link (`color #1c5ba8`, borderless, 34px), each chip a 17px pill
with a faint `×`.

### Filter defects the boards call out by name — fix these specifically
- `/customers` opens on **Active (1229)** showing `$0.00` and `No history` first, and **no
  with-transactions tab exists at all**. It must open on **With transactions 65**, and carry
  `Open balance 61` · `Factored 1,223` · `All 1,249`.
- `/vendors` opens on **Active (609)** showing 7-Eleven and A. Tijerina Towing at `$0.00`. It must
  open on **With transactions 34**, and carry `Open bills 0` · `All 623`.
- `/drivers/profiles` must open on **Active 19** of 130, not on everything.
- Banking Transactions must carry the segmented control
  `Uncategorized 931` | `Categorized 16` | `All 947` as one 34px bordered group, selected segment
  navy, segments divided by `border-left: 1px solid #C7D2DC`.
- Maintenance Fleet Table must carry `Units` (chip well, `All 16`), `Status`, `PM state`, then
  `Columns` and `Export` right-aligned.
- Driver Reports must carry `Kind`: `All 14` · `Damage 3` · `Mechanical 6` · `DVIR defect 4` ·
  `Accident 1`, then `Units` as a chip well.

---

## PART 2 — THE LAYOUT DEFECTS, MEASURED IN THE OWNER'S CHROME 2026-09-30

These are the numbers from the board canvas. They are the acceptance test.

- `/drivers/profiles` spent **593px of chrome before one byte of driver data on a 1350px screen —
  44% of the page gone.** The board puts data at **244px**. Hit that.
- The KPI block was **7 bars stacked vertically, y=135 to y=351 — 216px**, each full width with its
  number pushed to **x=2305 of 2381**. The board is **one row of 6 tiles, 78px**, each figure
  left-aligned at 21px/600 inside its own tile. Fix it to tiles across.
- **Six bands before any data**, one of them a full-width bar holding a single item. The board has
  four: title+KPI, module tabs, filter bar, then data.
- The list pane **rendered zero rows**. It renders rows.
- C-19 and C-20 were merged and none of this changed. Merging is not building.

---

## PART 3 — DONE LINES, PER BOARD. PASTE THESE.

A board is built when every one of these is true and the proof is in the PR body:

1. Every control on the board exists in the app, at the board's size, with the board's label text.
2. Measured: filter controls 34px · form fields 40px · primary actions 44px · date boxes 132px ·
   money boxes 120px right-aligned with tabular figures.
3. `grep` proof that no table cell on the screen declares a left or right border.
4. KPI tiles in one row at the board's height — not stacked.
5. Every figure bound to the live engine, with the query pasted and matching to the cent. No
   hardcoded board value shipped.
6. Every empty value renders `—`. No `0`, no `-$0.00`, no `No history` on a party that has none.
7. The gear opens a working column chooser; the view toggle switches regular and master-detail.
8. Anything that opens carries Save and Close, both wired.
9. The filter-audit table for your surfaces: what it was, what the board says, what you changed.
10. The linkage declaration, both directions.

## GUARD — one per seat, wired into verify-static, shrink-only

`scripts/verify-design-token-parity.mjs` — fails on any hex literal in a component that is not in
`docs/design/ih35-design-tokens.css`; fails on any filter/select/search control whose height is not
34px, any form field not 40px, any date input not 132px, any money input not 120px; fails on any
table cell declaring `border-left` or `border-right`; fails on a KPI container that stacks instead
of running across; fails on a rendered `0` or `-$0.00` where the value is null.

Whoever lands it first owns it; the other three extend its surface list.

---

DEADLINES, on top of your existing queue deadlines:
CC-2 banking boards 2026-10-05 23:00 UTC · CC-3 driver/customers/vendors boards 2026-10-06 23:00 UTC
CC-1 maintenance engines 2026-10-06 23:00 UTC · CURSOR maintenance screens 2026-10-07 23:00 UTC

One more thing, and it changes numbers on these screens: **the fleet is 16 trucks, not 40.** The app
carries 43 unit rows and 7 of them belong to IH 35 TRANSPORTATION. Every per-unit average, every
cost-per-mile and every fleet baseline on the maintenance boards is wrong until E-17 lands. CC-1,
that moves up your queue.
