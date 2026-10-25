# OWNER DESIGN LAW — 2026-10-02 — THE APP IS BUILT IDENTICAL TO THE BOARDS

Owner order, verbatim: *"GET THE PREVIEWS OF MAINTENANCE, BANKING, FACTORING, CUSTOMERS, VENDORS,
DRIVER PROFILE, GET ALL THOSE DESIGNS YOU CREATED AND RENDERED FOR ME FULLY AND TOTALLY BUILT
IDENTICAL TO THEM, NOT LIKE THE APP IS NOW."*

The boards in `docs/design/boards/` are the specification. They are not inspiration, not a mood
board and not a starting point. **Identical** means a screenshot of the app and a screenshot of the
board show the same screen.

The boards were rendered from live production numbers. Build the layout, the control sizes, the type
scale, the palette and the copy exactly; bind every number to the live engine behind it. Where a
board shows a figure, the app shows the same figure computed live — never the board's hardcoded
value, and never a placeholder.

---

## THE RULES THESE BOARDS SET FOR THE WHOLE APP

These are the owner's own words from the board canvases. They are app-wide, not per-screen.

1. **LINES FOR ROWS, NEVER FOR COLUMNS.** No cell anywhere declares a left or right border.
   Horizontal rules and zebra striping only.
2. **ONE CONTROL HEIGHT — 34px** for every filter, select and search box in the app. **40px** for a
   field being edited in a form. Nothing else.
3. **ONE DATE BOX WIDTH — 132px**, everywhere, tabular figures. A date box is never full-width and
   never guesses its size from its container.
4. **MONEY BOX 120px, right-aligned. Short code 104px.** Only a free-text reason grows to fill.
5. **An edit box is sized to what goes in it.** A 10-character date does not get a 600px field.
6. **KPI blocks are tiles across, never bars down. 78px, not 216.**
7. **MISSING RENDERS AS `—`** — never `0`, and never `-$0.00`.
8. **A gear icon on every table** opens the column chooser.
9. **Unit and account filters are multi-select chips plus a dropdown**, with a type selector beside
   them.
10. **Anything that opens carries Save and Close, both wired.**
11. **Regular view is the default** (the table). **Master-detail is the second view** — list left,
    selected record filling the right. One toggle, same position and same size on every list in the
    app.
12. **A list opens on the parties with real money** — 65 customers, 34 vendors, 19 active drivers.
    `All` is one click away, and search always reaches every record. Hidden is not missing, and the
    placeholder says so.
13. **Negative and missing values are never rendered as zero.** A unit with no odometer reads `—`
    and its PM row says why.
14. **A screen that is correct and empty says so.** It does not estimate and it does not fill a gap
    with a fleet average.

---

## TOKENS — TAKEN OFF THE BOARDS, NOT INVENTED

Use these values. Do not substitute a framework default, and do not reach for the Anthropic brand
palette that ships inside the artifact type — that file is the design tool's own reference and is
**not** this app's system.

### Surfaces
| Token | Value | Use |
|---|---|---|
| Page background | `#F1F4F7` (banking boards use `#eef2f6`) | the app canvas |
| Card / panel | `#FFFFFF` | every card, table and panel |
| Card radius | `3px` | everywhere; nothing is rounder |
| Table head | `#F6F9FB` | `thead` row |
| Zebra, even rows | `#FAFCFD` | `tbody tr:nth-child(even)` |
| Selected row | `#EEF4FA` / `#EEF3F8` | master-detail selection |
| Bulk-action bar | `#EEF4FA` | selection bar above a table |

### Lines
| Token | Value | Use |
|---|---|---|
| Structural border | `#D8E0E8` · banking `#C7D2DC` | card and band edges |
| Control border | `#C6D1DC` | inputs, selects, secondary buttons |
| Inner rule | `#E8EDF2` · banking `#E4EAF0` | row rules, card header divider |
| Footer rule | `2px solid #D8E0E8` | above a `tfoot` total row |

### Ink
| Token | Value | Use |
|---|---|---|
| Primary ink | `#0F1B2D` · banking `#0d2137` | body text, figures |
| Navy | `#14314F` | primary button, active tab underline, links |
| Navy ink | `#1F2A44` | secondary button label, chip text |
| Muted | `#64748B` · banking `#5d6b7a` | labels, sub-copy |
| Muted 2 | `#475569` / `#334155` / `#3d4a57` | table body secondary |
| Faint | `#94A3B8` / `#8895a3` | placeholders, the `—` glyph |
| On-navy label | `#B8C7D8` | label inside a navy KPI tile |

### Status
| Token | Value | Use |
|---|---|---|
| Red | `#8C2020` ink · `#A32D2D` / `#B42318` border | money out, failure, out of service |
| Red fill | `#FCEDEC` | "Unlinked" chip |
| Amber | `#8A4208` ink · `#B45309` border | warning, awaiting, half a link |
| Amber fill | `#FDF3E7` / `#FFF7ED` | warning banner, "Half a link" chip |
| Green | `#1F6B32` | bound, linked, OK |
| Green fill | `#ECF3EC` | "Linked" chip |

### Type
Family: `"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif`, loaded from Google Fonts at weights
400/500/600/700, with `-webkit-font-smoothing: antialiased`.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 22px | 700 | `letter-spacing: -0.01em` |
| Page subtitle | 12.5px | 400 | muted |
| Card title | 14px | 600 | |
| Card subtitle | 11.5px | 400 | muted |
| Body / table cell | 12.5px | 400 | |
| KPI figure | 21px | 600 | left-aligned inside the tile, `line-height: 1.2` |
| Detail figure | 17px | 700 | |
| Column label `.hd` | 10px | 600 | `letter-spacing: .09em`, uppercase, muted |
| Status pill | 10.5px | 600 | `letter-spacing: .04em`, uppercase |
| Kind badge | 9.5px | 700 | `letter-spacing: .05em`, uppercase, white on tone |
| Tab | 12.5px | 400 / 600 active | active adds `border-bottom: 2.5px solid #14314F` |

Every column of digits carries `font-variant-numeric: tabular-nums` and is right-aligned.

### Metrics
| Token | Value |
|---|---|
| Control height | 34px |
| Form field height (editing) | 40px |
| Primary action button height | 44px |
| Date box width | 132px |
| Money box width | 120px |
| Short code width | 104px |
| Table cell padding | `8px 10px` (driver hub `7px 10px`) |
| Card header padding | `11px 16px` |
| Page gutter | 24px |
| Tile gap | 10px · card gap 14px |
| Tab padding | `9px 13px` (maintenance `9px 14px`) |
| Chip radius | 17px (pill) · 2px (filter token) |

---

## WHAT IS IN `docs/design/boards/`

### `banking/` — 6 boards (owner: CC-2)
`Main.dc.html` Banking Home · `Transactions.dc.html` the 931 uncategorized ·
`Reconciliation.dc.html` never run · `Accounts.dc.html` · `RelayCard.dc.html` ·
`DriverEscrow.dc.html` · `canvas.json` carries the owner's notes.

The canvas note records the decisions that already hold: 10 tabs down to 8; Statement Import, Plaid
Connections and + Create Account collapse into one `+ New` menu; the Factoring tab is gone because
it is a whole module and a summary card deep-links to it; the alert-banner-with-action-button
pattern (Map Cash GL, Connect QBO) is the owner's own and stays.

### `driver-customers-vendors/` — 4 boards (owner: CC-3)
`Main.dc.html` Driver Hub Home · `DriverDetail.dc.html` the full profile ·
`Customers.dc.html` regular view · `Vendors.dc.html` regular view · `canvas.json`.

The canvas note records what the app did wrong, measured in the owner's own Chrome on 2026-09-30:
593px of chrome before one byte of driver data on a 1350px screen — 44% of the page gone; the KPI
block as 7 bars stacked vertically, y=135 to y=351, 216px, each full width with its number pushed to
x=2305 of 2381; six bands before any data, one of them a full-width bar holding a single item; the
list pane rendering zero rows. `/customers` opening on Active (1229) with `$0.00` and `No history`
first, no with-transactions tab existing at all. `/vendors` opening on Active (609) with 7-Eleven and
A. Tijerina Towing at `$0.00`. C-19 and C-20 were merged and none of it changed.

### `maintenance/` — 9 boards (owner: CC-1, screens to Cursor)
`Main.dc.html` · `FleetTable.dc.html` · `ActiveWOs.dc.html` · `ServiceLocation.dc.html` ·
`DriverReports.dc.html` · `RoadService.dc.html` · `PartsInventory.dc.html` ·
`IntegrityReport.dc.html` · `Settings.dc.html` · `canvas.json`.

`FleetTable.dc.html` is already built on **16 units**, which is the real fleet. Every per-unit
average in the app is currently computed against 43 unit rows, 7 of which belong to IH 35
TRANSPORTATION. That is E-17 and it makes every cost-per-mile figure on these screens wrong until it
is fixed.

### Factoring
There is **no separate factoring board**. Factoring's surfaces are specified by the banking boards'
system plus the factoring summary card that deep-links out of Banking Home. CC-2 builds factoring to
these same tokens and these same rules — it does not invent a second visual language.

---

## HOW A SCREEN IS DECLARED DONE

A board is built when all of the following are true and pasted as proof:

1. Every control on the board exists in the app, at the board's size, with the board's label text.
2. Control heights measure 34px (filters) and 40px (form fields). Date boxes measure 132px. Money
   boxes measure 120px and are right-aligned with tabular figures.
3. No table cell declares a left or right border anywhere on the screen.
4. KPI tiles run across in one row of the board's height, not stacked as bars.
5. Every figure is bound to the live engine and matches a query the coder pastes. No hardcoded board
   value ships.
6. Every empty value renders `—`.
7. The gear opens a working column chooser. The view toggle switches regular and master-detail.
8. Anything that opens has Save and Close, both wired.
9. The linkage declaration for the screen is in the PR body, both directions.

The owner walks every screen in Chrome himself. No coder claims a screen is done because it looked
right — the proof is the measurements and the live queries above.
