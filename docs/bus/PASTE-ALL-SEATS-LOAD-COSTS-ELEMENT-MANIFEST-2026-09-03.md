# PASTE-ALL-SEATS · LOAD-COSTS + FLEET CLEANUP · ELEMENT-MANIFEST LAW · 2026-09-03

`git pull --ff-only origin main`

USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Never POST Book Load. No seat money fixtures.
Design files (owner):
- `~/Downloads/Load Costs Board Home v2.html`
- `~/Downloads/IH35-DELIVERABLES/designs/Load Costs Tab.html`
- tip also has copies under `docs/lockdown/_archive-2026-09-02/IH35-SOFTWARE-MAP/designs/`

STANDING LAW (all seats, all design work from now on):
1. NUMBERED ELEMENT MANIFEST with a `data-testid` per element.
2. GUARD written FIRST → watch it fail → build until exit 0.
3. Guard `--selftest` MUST fail when any single id is removed.
4. "Looks like the design" is not done. "N of N ids present, guard exit 0" is done.

---

## ANSWERS ALREADY VERIFIED (Cursor lead · Neon live · 2026-09-03)

### Projected delivery — YES, it is stored
Book Load wizard writes the delivery stop appointment into
`mdata.load_stops.scheduled_arrival_at` (stop_type = delivery).
Live proof on load **13508**:
- pickup scheduled `2026-08-07`
- delivery scheduled `2026-08-10` ← this IS "Projected delivery"
- both `actual_arrival_at` null → Delivered column must show em dash `—`

Also on `mdata.loads.predicted_delivery_date` (ETA layer). Board column
**Projected delivery** = delivery-stop `scheduled_arrival_at` from booking.
Do NOT invent. Do NOT use today. Do NOT use created_at.

### Why Load costs appears twice
Canonical route is ONE: `/accounting/load-costs`.
Dispatch primary nav may link to it (findability). Do NOT render a second
"Load costs" leaf in a secondary strip on the same screen that already has
it in the primary Dispatch tab bar. Duplicate labels = same data in two
places with no purpose. Keep one click path.

### Tip vs live
Tip `LoadCostsBoardPage.tsx` has a partial expand + chips; live (Claude Chrome)
still shows shell defects (KPI not buttons, wrong columns, Costs tab = link).
FINISH LAW = match v2 HTML + Costs Tab HTML element-by-element. Partial tip
code does not close the card.

### Trucks — VERIFY FIRST, NO DELETE THIS WAVE
Live Neon candidates (NOT executed):
| unit_number | status | owner |
|---|---|---|
| 01, 04, 07, 114 | OOS/Sold | IH 35 Trucking LLC (TRK) |
| T06–T14 | Sold | TRK |
| CODEX-*, T-TEST*, TEST-*, Truck-01 Transportation | OOS/InService | seat fixtures |
| **T120+** | InService | **LIVE USMCA FLEET — NEVER TOUCH** |

Owner said USMCA is not the owner of 00–119 / Transportation tests.
CC-1 posts a strike-list PR description ONLY. Jorge strikes. Then soft-retire
(`Sold`/`Transferred` + hide from USMCA pickers). **No `DELETE FROM mdata.units`.**
Void law: never delete entities that may have money history.

---

## PACKET A — CODEX · LOAD COSTS BOARD v2 · 22 ELEMENTS

**File:** `apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx`
**Route:** `/accounting/load-costs`
**Design:** `Load Costs Board Home v2.html`

### STEP 0 — GUARD FIRST
Write `scripts/verify-load-costs-board-manifest.mjs` + claim EVEN verify-step
(Cursor lane after Codex authors, OR Codex claims per band — if Codex cannot
claim EVEN, Cursor claims then Codex authors against the green claim on main).

Literal id list (must match DOM):

```
load-costs-shell
load-costs-back
load-costs-title
load-costs-topbar
load-costs-pill-in_motion
load-costs-pill-delivered_open
load-costs-pill-all_open
load-costs-pill-this_week
kpi-loads-in-motion
kpi-revenue-booked
kpi-costs-recorded
kpi-driver-pay
kpi-approx-margin
kpi-bank-unmatched
col-load
col-status
col-pickup-date
col-projected-delivery
col-delivered
col-route-crew
col-revenue
col-costs
col-driver
col-margin
load-costs-expand
panel-costs-on-load
panel-approx-settlement
btn-add-cost
btn-receipt-photo
btn-fuel-advance
```

Guard asserts:
1. Every id present.
2. Each of the 6 KPI nodes is a `<button>` with a real drill target
   (`DrillKpiCard` or equivalent). `tile.value === drill.rowCount`.
3. Header navy `#14314F`, white, 11px / 700 / UPPERCASE.
4. Every column header has sort ASC/DESC control AND drag handle.
5. Status chip colors:
   - In transit `#E3ECE8` / `#2B5F52`
   - Delivered `#F5EEDA` / `#8A6410`
   - Loading/draft `#F4E7E0` / `#8A4020`
6. `--selftest` fails if any one id removed.
7. Wire into `scripts/verify-steps/NNNN-verify-load-costs-board-manifest.mjs`.

### STEP 1 — PAGE CHROME
- `load-costs-back` — `← Back` same pattern as Dispatch module header.
- `load-costs-title` — H1 22px "Load costs" + subtitle (board reads, does not post).
- Kill duplicate secondary "Load costs" leaf when the primary Dispatch tab
  already exposes it (one path).

### STEP 2 — COLUMNS (exact order, left → right)
ParityTable ONLY. Never hand-roll `<table>`.

| # | Column | Source |
|---|---|---|
| 1 | Load | `load_number` ONLY — no status here |
| 2 | Status | coloured chip |
| 3 | Pickup date | pickup stop `actual_arrival_at` else `scheduled_arrival_at` — label honestly if scheduled |
| 4 | Projected delivery | delivery stop `scheduled_arrival_at` (booking promise) |
| 5 | Delivered | delivery stop `actual_arrival_at` OR em dash `—` — never today, never fake |
| 6 | Route and crew | lane + customer · driver · truck · trailer |
| 7–10 | Revenue · Costs · Driver · Margin | right-aligned tabular |

Every column: draggable reorder (ParityTable column-order persistence) +
server-side sort ASC/DESC (re-query — not client sort of fetched page).

### STEP 3 — KPI TILES (all six buttons)
1. Loads in motion — VALUE MUST RENDER (was missing live)
2. Revenue booked
3. Costs recorded
4. Driver pay accruing
5. Approximate margin
6. Bank items unmatched

Each: `<button data-testid=kpi-…>` → drill list. Caption states the rule.
`tile.value === drill.rowCount` or guard fails.

### STEP 4 — ROW EXPAND (must open on click)
`data-testid="load-costs-expand"`

LEFT `panel-costs-on-load`:
- each cost: number · vendor · detail · PAID/OWED chip · amount
- addbar: `btn-add-cost` | `btn-receipt-photo` | `btn-fuel-advance`
- opens creator with load prefilled; board itself does not POST

RIGHT `panel-approx-settlement`:
- Line haul revenue
- practical-miles sub-line
- Costs on the load
- Driver pay · short miles at rate
- Driver deduction · pending approval
- Approximate margin (word **approximate** stays)

### STEP 5 — PROOF
Chrome side-by-side with v2 HTML on load 13508. NEVER POST.
Guard exit 0 + selftest fail-on-remove. OUTBOX one-liner.

---

## PACKET B — CODEX · LOAD DETAIL COSTS TAB · 18 ELEMENTS

**File:** `apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx`
**Design:** `Load Costs Tab.html`
**Keep** existing "Add expense" link (additive). Build the design INSIDE the tab.

### STEP 0 — GUARD FIRST
`scripts/verify-load-costs-tab-manifest.mjs` + verify-step.

```
load-costs-tab-shell
load-costs-tab-header
load-cost-row-{n}          (at least one empty "new" row scaffold when zero costs)
load-cost-number-{n}       read-only: {load}, {load}-1, {load}-2
load-cost-toggle-expense-{n}
load-cost-toggle-bill-{n}
load-cost-date-{n}
load-cost-vendor-{n}
load-cost-category-{n}
load-cost-paid-with-{n}    OR load-cost-vendor-invoice-{n} when Bill
load-cost-amount-{n}
load-cost-hint-{n}
load-cost-status-{n}
btn-save-all
btn-add-another-cost-top
btn-add-another-cost-bottom
btn-add-from-receipt
load-costs-totals
load-costs-bank-panel
```

### STEP 1 — STACKED ROWS (not bounce-out table)
Per row columns: DATE · VENDOR · CATEGORY · PAID WITH · AMOUNT
Bill mode: PAID WITH → VENDOR INVOICE NO. (never prefilled).
Toggle: Expense · paid now | Bill · owed — never silent default.
Hint text exactly as design (plain English posting line).
Status: saved · matched to bank / saved · waiting for the bank / new — not saved
Numbers: server-derived, read-only.

### STEP 2 — TOTALS + BANK PANEL
Totals: Line haul · Costs on this load — N entries · Driver pay short miles · Margin $ and %
Bank panel chips: Matched to {n} / Will be offered when it lands / Matches on the bill payment, not now

### STEP 3 — ONE WRITE PATH
Same expense + bill endpoints as Accounting. No forked poster.
Board/tab opens creators with load filled; do not invent a second write stack.

### STEP 4 — PROOF
Chrome on 13508 Costs tab with three stacked rows (may be empty + one new
scaffold — never invent USMCA money). Side-by-side with design HTML.

---

## PACKET C — CC-3 · FLEET OOS / IN SHOP COLUMNS

Surface: Maintenance fleet / Severe OOS list (SevereRepairOosTab already has
Down Since + Days OOS — extend every fleet OOS/in-shop list that still lacks them).

Manifest:
```
fleet-oos-col-unit
fleet-oos-col-status
fleet-oos-col-oos-since      date put out of service (mdata.units.oos_since / oos_date)
fleet-oos-col-days-oos       computed days
fleet-oos-col-location
fleet-oos-col-reason
```

Guard asserts columns present + sortable. If `oos_since` null on OOS units
(e.g. unit `01`), show em dash and do not invent a date.

---

## PACKET D — CC-1 · UNIT CLEANUP STRIKE LIST (NO DELETE UNTIL JORGE STRIKES)

READ-ONLY this wave. Post the list. Wait for Jorge.

Proposed soft-retire (hide from USMCA pickers / mark Sold if not already):
- Numeric `01, 04, 07, 114` — owner TRK, not USMCA
- `T06–T14` Sold TRK
- Seat fixtures: `CODEX-*`, `T-TEST*`, `TEST-*`, `Truck-01 Transportation`, `U-TEST-TRUCK-*`

**NEVER:** `T120` and above InService USMCA fleet.
**NEVER:** `DELETE FROM mdata.units` — soft status + picker exclusion only.
If any fixture has money FKs, report and stop.

---

## PACKET E — CC-2 · DISPATCH KPI DRILL (SEPARATE FROM LOAD COSTS)

Owner: "fixes in dispatch KPIs is not completed."
Do not conflate with Load Costs board KPIs.
Manifest every Dispatch Load-board KPI tile as `DrillKpiCard`,
`tile.value === drill.rowCount`, Chrome proof. Own guard.

---

## SEQUENCE (STRICT)

```
Wave 0  Cursor claims EVEN verify-step numbers for both manifests (Rule 37)
        → merge claim to main BEFORE anyone authors the guard body if required

Wave 1  Codex   guard-first Load Costs Board → build to 22/22
        Codex   guard-first Costs Tab → build to 18/18   (same seat, serial)

Wave 2  CC-3    Fleet OOS columns + days
        CC-2    Dispatch KPI drill completion (not Load Costs)

Wave 3  CC-1    Unit strike-list only — wait for Jorge before any write

Wave 4  CC-2    Chrome verify BOTH designs side-by-side · NEVER POST
```

Done = guard exit 0 + Chrome beside the HTML. Not a status essay.

ACK examples:
`CODEX | ACK | Load Costs Board+Tab manifests · NEVER POST | GO`
`CC-3 | ACK | Fleet OOS columns | GO`
`CC-1 | ACK | unit strike-list READ ONLY | GO`
`CC-2 | ACK | Dispatch KPI drill + Chrome Load Costs | GO`
