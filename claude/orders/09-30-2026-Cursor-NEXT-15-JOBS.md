# TO: CURSOR — NEXT 15 JOBS — 09-30-2026
# FROM: Claude Lead
# Finish each one COMPLETELY. Live proof pasted per job: the URL, the measured value, before -> after.
# Measured by me in Chrome on app.ih35dispatch.com TODAY — these are numbers, not opinions.

MEASURED BASELINE (/customers, 2026-09-30, live):
  page background            rgb(244,246,248)
  master-detail container    background rgba(0,0,0,0) · border 0px · box-shadow none   <-- NO EDGES AT ALL
  table row separator        1.25px oklch(0.967 0.003 264.542)  (~#F4F4F5 — white on white)
  table row background       rgba(0,0,0,0) for every row after the first
  view toggle pills          h=22, padding 0px 8px, widths 67 / 93
  status toggle pills        h=24, padding 4px 8px, widths 52 / 61 / 31
  inactive pill background   rgba(0,0,0,0)
  page scroll                content 1808px vs viewport 1090px = 718px OF OVERFLOW

---

## C-01 — Segmented controls are out of proportion. Fix the control, not the page.
The view toggle and the status toggle are two different controls pretending to be one family:
h=22 vs h=24, padding `0px 8px` vs `4px 8px`, and pill widths of 67/93/52/61/31 because nothing
sets a min-width. Build ONE `SegmentedControl` component and use it for both: identical height,
identical padding, `min-width` so labels of different lengths produce pills of even rhythm, a real
group container with a 1px border and a 2px inner radius, and an inactive pill that is a visible
tint rather than `rgba(0,0,0,0)`. PROOF: paste the computed height, padding and width of every pill
in both controls — they must match within the family.

## C-02 — Master-detail is the DEFAULT, for everyone, not a remembered preference.
`localStorage['ih35:view-mode:customers']` is currently what decides. A user who has never
chosen, or whose storage is cleared, must still land on master-detail. Make master-detail the
initial value in code; localStorage may only override it after an explicit user click. Apply to
Customers AND Vendors. PROOF: clear the key, reload, paste the active pill.

## C-03 — The master-detail container has no edges. Give every box a real surface.
`background: rgba(0,0,0,0); border: 0px; box-shadow: none` against a `rgb(244,246,248)` page is why
it "looks too simple". Each pane gets an explicit surface background, a 1px border in the locked
border token, a 2px radius and the house 1px shadow, and the master/detail split gets a real
divider. Same treatment everywhere this pattern appears. PROOF: computed background, border and
box-shadow of each pane.

## C-04 — Rows have no distinction. A 1.25px near-white rule is not a row separator.
Give every list in the app the house row treatment: a visible separator in the locked border token,
and an alternating or hover row tint that is actually perceivable on `rgb(244,246,248)`. PROOF:
computed `border-bottom-color` and `background-color` of rows 1..4 on /customers.

## C-05 — MINIMUM-SCROLL LAW (this is a standing rule, not one screen).
/customers renders 1808px of content into a 1090px viewport — 718px of overflow before the owner
sees the list. The rule: on a normal laptop viewport, the LIST must be visible without scrolling.
KPI cards and headers may not consume the screen. Build the page shell so the header block is
compact and the list region takes the remaining height with its own internal scroll. PROOF:
`document.documentElement.scrollHeight` vs `window.innerHeight` per page.

## C-06 — Every page auto-adjusts to the viewport.
No fixed pixel widths that force horizontal scroll, no layout that assumes one monitor size. PROOF:
at 1280px and at 1920px width, paste `document.documentElement.scrollWidth - window.innerWidth`
(must be 0) for /customers, /vendors, /banking, /cash-flow, /maintenance, /drivers.

## C-07 — Cash Flow: contrast. It is too white.
Headers, column headers and section backgrounds must use the locked house palette — the same one
Truck Line and Kanban use. No new colors, no raising the palette ratchet. PROOF: computed
backgrounds of the page, the section header and the column header row.

## C-08 — Cash Flow: row distinction. Same treatment as C-04.

## C-09 — Cash Flow: one column format for every section.
`settlement · load · PU date · DEL date · customer · expenses` — the same columns, in the same
order, in every Cash Flow section. Owner asked for this twice. PROOF: screenshot of each section
plus the column header text of each.

## C-10 — Banking home: the 3 boxes are too large.
Bank Accounts, Factoring, Driver Escrow Visualizer. Reduce to a proportionate size, give them the
C-03 surface treatment, give their rows the C-04 treatment, and redesign the background area behind
them where the bank accounts show. PROOF: before/after measured heights and the computed surface.

## C-11 — Driver Profile: KPIs are stacked AND sitting above the tab strip. Both are wrong.
Move them below the tabs and lay them out horizontally so they cost one band, not the screen.
Apply C-05. PROOF: scrollHeight vs innerHeight, and the DOM order of tabs vs KPIs.

## C-12 — Driver Profile: name case and phone format.
Names render Proper Case — capital first letter only, never ALL CAPS, never all lowercase. Phone
auto-formats to `(956) 000-0000` on display AND on entry. PROOF: paste three rendered names and
three rendered phones.

## C-13 — Driver Profile: columns too wide, documentation columns missing, no upload affordance.
Narrow the columns, add the missing documentation columns, and give each document column a
"document loaded" confirmation plus a paperclip upload control — visa, medical card, and every
other document. PROOF: screenshot with the clip visible and one document uploaded.

## C-14 — Vendors and Customers need the multi-select filter box.
The `All types` / `All statuses` inputs are 131x33 bare inputs with `border: 0px`. Replace with the
house Combobox, multi-select, so several options can be chosen at once. PROOF: two options selected
at once, and the filtered row count.

## C-15 — Maintenance: the Create Work Order wizard opens FULL PAGE. Restore the modal.
Someone changed the design. It must be a modal, every box a combo dropdown, fully operable with the
Tab key, with visually distinct sections and the A/B/C/D section headers dark with light letters.
PROOF: a Tab-key walkthrough GIF or an ordered list of the focus sequence, plus the computed
background/color of a section header.

REPORT BACK: one block per job — job id, what you changed, the pasted measurement, before -> after.
No job is done without its number.

---

# ADDENDUM — OWNER, 2026-09-30, SAME SESSION. These fold into the 15 above; they do not replace them.

MEASURED BY ME, LIVE, ON /customers WITH A CUSTOMER SELECTED:
  master (list) pane    440px =  20.8%
  detail pane          1662px =  78.6%
  container            2114px, display:flex, gap:12px
  detail pane          background rgba(0,0,0,0) · border 0px · box-shadow none

## C-16 — The master-detail split is 1:4. That is the "out of proportion" the owner is seeing.
440px of list against 1662px of detail. Widen the master pane substantially and let the detail pane
give up the width — the owner's words: "the master data showing on the left side should be wider,
because the customer or vendor side looks too large and out of proportion." Make the split a token,
not a magic number, so Customers, Vendors and Drivers all share it. Give the master pane a real
minimum width so it never collapses, and a maximum so it never swallows the detail. PROOF: the
measured widths and percentages, before -> after, at 1280px and 1920px viewport.

## C-17 — Driver Profiles home must work like the Customers / Vendors master profile.
Same master-detail shell, same default (C-02), same split (C-16), same surfaces (C-03), same row
treatment (C-04). One shell component used by all three — not three copies. PROOF: the three pages
side by side, and the shared component's import list.

## C-18 — "THERE ARE NO DISTINCTIONS IN LINES, ANYTHING, THROUGHOUT THE ENTIRE APP."
This is the owner's single loudest complaint and it is now measured: the detail pane has
`border: 0px` and `box-shadow: none` on a `rgb(244,246,248)` page, and list rows are separated by
`1.25px oklch(0.967 0.003 264.542)` — white on white. Treat it as ONE systemic fix, not per page:
  - define the locked border / divider / surface tokens once, at the contrast the owner can see;
  - every panel, card, box and section gets a real 1px edge from that token;
  - every section boundary inside a box gets a real divider;
  - every list row gets a perceivable separator;
  - then sweep the app and remove the places that opted out.
Do NOT invent new colors and do NOT raise the palette ratchet — extend the locked palette with the
owner's approval if the existing tokens genuinely cannot carry the contrast, and say so first.
PROOF: a table of every surface type with its computed border and background, before -> after,
across Customers, Vendors, Drivers, Banking, Cash Flow and Maintenance.

## C-19 — OWNER, 2026-09-30 — Customers and Vendors default to ONLY those WITH transactions.
By default the Customers list shows only customers that HAVE transactions, and the Vendors list
only vendors that HAVE transactions. The full list stays reachable behind an explicit filter
option — never lost, just not the default. Define "has transactions" with CC-1 (A-16) so the
frontend filter and the accounting definition are the SAME definition, not two guesses. PROOF: the
default row count vs the all row count, and one customer with zero transactions proven absent by
default and present when the filter is switched.
