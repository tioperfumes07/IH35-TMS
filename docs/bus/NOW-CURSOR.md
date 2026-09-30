# CURSOR — ROUND 303 (visual work, five modules only)

OWNER SCOPE CHANGE — read docs/bus/2026-09-30-OWNER-SCOPE-CHANGE-MONEY-STOPS-ALL-SEATS.md
Owner: "No body is supposed to be working on money only creating engines and visual changes and
upgrades. To maintenance and dispatch customers and vendors and driver profiles modules"
C-51 Banking Home + Driver Escrow: PAUSED. C-53 reconciliation screen: PAUSED. Banking is money.
The boards are published and accepted and they wait. Do not revert anything already merged.

## C-57 — DRIVER PROFILE MODULE. Asked for THREE times, still not built. TOP ITEM.
Canvas "Driver Profile · Customers · Vendors", 4 boards, published and accepted.
Owner: "I NEED TO SEE THE FULL PROFILE AS WELL."
GET THIS DISTINCTION RIGHT -- the owner corrected me on it:
  DRIVER HUB     = alerts/requests FROM drivers in their app (cash, advances, repairs). NOT the profile.
  DRIVER PROFILE = /drivers/profiles, the profile itself, same data safety and compliance read.
                   THIS is what is missing.
Measured live today: 593px of chrome before one byte of driver data on a 1350px screen; KPI
block 7 bars stacked vertically, 216px tall; list pane rendered ZERO rows. C-31..C-35 fixed the
lists; the profile module itself was never built.
Required: INTEGRITY KPI when you click a driver · COMPLAINTS AGAINST THE DRIVER as a KPI
(lateness, refused dispatch, conduct -- CC-2's B-44 builds the object, wire to it, do not invent
a shape) · KPI tiles ACROSS not bars down, 78px not 216 · LINES ON ROWS NEVER COLUMNS, no cell
declares a left/right border anywhere.
ADDITIONAL PAYMENTS: owner asked for it AND said it must be fully wired to chart of accounts,
AR and AP. That wiring is money and money is paused. Build the STRUCTURE, leave posting unwired,
and SAY SO in your report. Do not fake a posting, do not silently drop the section.

## C-58 — CUSTOMERS + VENDORS: both views
C-50 is live (f5a3226f14 in e8b138e4ea). The owner is away from that machine so I have NOT
measured 65/34 and will not report a number I cannot trust. C-50 stays OPEN until I do.
Build REGULAR view (table, default) and MASTER-DETAIL (list left, record right). One toggle,
same position and size on every list. Owner: "I LIKE THE MASTER DETAIL FORMAT, AND THIS FORMAT
AS WELL, THIS FORMAT WOULD BE THE REGULAR VIEW."
Customer/vendor types must be real selectable types wired to the object, not free text.

## C-59 — MAINTENANCE VISUAL UPGRADES (9 tabs done; now inside them)
Owner's own list: every module home page says "Home" · units filter MULTI-SELECT + dropdown +
by type (truck, reefer, flatbed) · GEAR ICON for columns on every table · work orders show
report date / date in shop / expected release (CC-1's A-43 serves them) · KPIs on Home with
Accept and Generate Work Order · ROAD SERVICE visible on Maintenance Home, not buried ·
driver reports and damage reports are ONE thing.

## C-60 — ALERTS: side-docked, subtle, NO LAYOUT SHIFT (house rule, every module)
Owner: "the messages should be smaller and more subtle, maybe come from the side smaller so they
dont take up much space and they dont make the page readjust."
In-flow banners shove the page down -- that reflow IS the defect. position:fixed, narrow right
stack, entering from the side, nothing behind them moves.
Normal text sizes in the real app. The boards use 12.5px because they are 1440px artboards.
Do not shrink real app type to match an artboard.

## C-61 — CONTROL SIZES, universally (owner has said this twice)
34px every filter/select/search; 40px a field being edited. Date box 132px EVERYWHERE, tabular
figures. Money box 120px right-aligned. Short code 104px. Only free-text reason grows.
Anything that opens carries SAVE and CLOSE, both wired. Missing renders "—", never 0, never -$0.00.

## C-62 — finish migrating custom render money columns onto TableMoneyCell (formatting only,
not posting -- allowed). Your own C-37 note names it as left.
## C-63 — re-read this file.
LANE: no scripts/verify-steps, no accounting schemas, no Banking module this round.
