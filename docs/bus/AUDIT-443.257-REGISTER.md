# Round 443.257-D — live Chrome audit register

Status: IN PROGRESS — not a complete application certification. Observed in authenticated Chrome on app.ih35dispatch.com, USMCA, 2026-10-22 evening Central. Read-only: panels opened, never submitted. No application changes.

## Evidence and limits

Screenshots are captured inline in the Codex audit task, not committed: they contain private production information. Durable screenshot-file export remains unresolved (Chrome `tab_content_export` is unsupported). `inline` below identifies an actual captured image; `pending` means DOM/timing evidence exists but a screenshot is still owed. Neither is a fabricated filesystem path. Canvas comparison uses the explicit V3 requirements in the owner's 443.257 brief; a full canvas-to-screen visual pass remains owed. Seat entries are proposed routing, not claims of completed fixes.

Crash reproduced: `/fuel/questions` → Review → whole-app error boundary. Console at 2026-10-23T00:13:51.384Z: `TypeError: Cannot read properties of undefined (reading 'load_number')`, `FuelAssignmentPopup-CEcnlUUZ.js:1:3103`. Focused history places this URL at 7:01:09 PM CT; it is the strongest match for the owner's 7:01 report, not proof of the historical click. Reload recovers the page.

## Defects

| ID | Module | Tab | Sub-tab | Element / measured defect | Class | Screenshot | Expected (V3 / brief) | Seat |
|---|---|---|---|---|---|---|---|---|
| D001 | Fuel | Questions | Review | Clicking Review throws undefined `load_number` in FuelAssignmentPopup; whole-app crash | E | inline: Fuel Questions crash | Review opens a usable panel; missing data handled without crashing | CC-2 |
| D002 | Home | Overview | Money tiles | Currency values omit cents | M | inline: Home | Currency always two decimal places | Cursor |
| D003 | Home | Overview | Driver day summary | Names render all-uppercase | N | inline: Home | Full proper-case names, honoring exceptions | CC-1 / Cursor |
| D004 | Home | Overview | Weekly revenue | Axis dates use DD/MM without year | D | inline: Home | MM/DD/YYYY under this round's explicit rule | Cursor |
| D005 | Home | Overview | Driver summary request | `/api/v1/telematics/driver-day-summary` 5,071 ms | P | pending: resource timing | API at most 2,000 ms | CC-2 |
| D006 | Settlements | Navigation | Drivers | Link targets `/drivers` outside module | B | pending: DOM | Keep Settlements context | Cursor |
| D007 | Settlements | Navigation | Profiles | Link targets `/drivers/profiles` | B | pending: DOM | Keep Settlements context | Cursor |
| D008 | Settlements | Navigation | Pre-Settlements | Link targets `/drivers/pre-settlements` | B | pending: DOM | Keep Settlements context | Cursor |
| D009 | Settlements | Navigation | Feed Gate | Link targets `/feed-gate` | B | pending: DOM | Keep Settlements context | Cursor |
| D010 | Settlements | Navigation | Cash Advances | Link targets `/cash-advances` | B | pending: DOM | Keep Settlements context | Cursor |
| D011 | Settlements | Navigation | Liabilities | Link targets `/liabilities` | B | pending: DOM | Keep Settlements context | Cursor |
| D012 | Settlements | Navigation | Escrow | Link targets `/accounting/escrow` | B | pending: DOM | Keep Settlements context | Cursor |
| D013 | Settlements | Navigation | Pay Rate Templates | Link targets `/drivers/pay-rate-templates` | B | pending: DOM | Keep Settlements context | Cursor |
| D014 | Settlements | Navigation | Deductions | Link targets `/drivers/deductions` | B | pending: DOM | Keep Settlements context | Cursor |
| D015 | Settlements | List | Driver names | All-uppercase names displayed | N | pending: DOM | Full proper-case names | CC-1 / Cursor |
| D016 | Fuel | Questions | Table | No column chooser in rendered DOM | T | pending: DOM | Gear column chooser | Cursor |
| D017 | Fuel | Questions | Table headers | Headers have no sorting controls | T | pending: DOM | Sortable columns | Cursor |
| D018 | Fuel | Cards | Assign card drawer | Six input controls measured 38px high | I | inline: Assign fuel card | Inputs 32px | Cursor |
| D019 | Fuel | Cards | Driver options request | `/api/v1/mdata/drivers` 4,522 ms in audit session | P | pending: resource timing | API at most 2,000 ms | CC-2 |
| D020 | Fuel | Expense mapping | Mapping request | `/api/v1/accounting/expense-category-map` 8,831 ms | P | pending: resource timing | API at most 2,000 ms | CC-1 |
| D021 | Dispatch | Home | Round-trip exposure | Driver names abbreviated to initials | N | pending: DOM | Full proper-case names | Cursor |
| D022 | Dispatch | Home | Return / idle / missing-bill tables | Driver names all-uppercase | N | pending: DOM | Full proper-case names | CC-1 / Cursor |
| D023 | Dispatch | Book Load | Stop fields | Both ZIP controls measured 28px high × 381.33px wide | I | inline: Book Load | ZIP 32px high × 88px wide | Cursor / CC-3 |
| D024 | Dispatch | Book Load | Presentation | Long A–E form; no Side panel / Center toggle or five-step flow present | V | inline: Book Load | Same component with side/center toggle and specified five-step layout | Cursor / CC-3 |
| D025 | Dispatch | Load Costs | Pickup / delivery cells | Dates display M/D/YY | D | inline: Load Costs | MM/DD/YYYY | Cursor |
| D026 | Dispatch | Load Costs | Driver names | All-uppercase names | N | inline: Load Costs | Full proper-case names | CC-1 / Cursor |
| D027 | Dispatch | Load Costs | Settlement/Tour link | Several links have only an em dash as label despite a settlement destination | N | inline: Load Costs | Resolve human-readable settlement/tour display identifier | CC-1 / Cursor |
| D028 | Tasks | Create Task | Inputs | Eleven single-line inputs measured 38px high; textarea excluded | I | inline: Create Task | Single-line inputs 32px | Cursor |
| D029 | Tasks | Exceptions | Since column | ISO YYYY-MM-DD rendered | D | pending: DOM | MM/DD/YYYY | Cursor |
| D030 | Driver Hub | Driver Scheduler | Date range | Subtitle uses YYYY-MM-DD; grid uses MON-DD | D | pending: DOM | MM/DD/YYYY under explicit round requirement | Cursor |
| D031 | Driver Hub | Driver Scheduler | Driver cells | All-uppercase and inconsistent surname casing | N | pending: DOM | Full proper-case names | CC-1 / Cursor |
| D032 | Driver Hub | Driver Scheduler | Assign Temp Cover | Five single-line inputs measured 38px high; pickers about 2,477px wide and dates about 1,203px | I | pending: screenshot timed out | 32px inputs and content-appropriate form widths | Cursor |

| D033 | Maintenance | Home / Fleet Table | Money tiles | MTD Cost, Open $ and severe-repair total omit cents | M | inline: Maintenance Home | Currency always two decimal places | Cursor |
| D034 | Maintenance | Create Work Order | Drawer inputs | Visible single-line inputs measured 38px; customer picker about 2,408px wide, open-date input about 766px | I | pending: measured DOM | 32px inputs; dates 150px; content-appropriate widths | Cursor |
| D035 | Maintenance | Active WOs | Table headers | Load, Driver, Vendor, Bill, JE and Timing headers have no sorting button, unlike adjacent headers | T | pending: DOM | Sortable data columns | Cursor |
| D036 | Safety | Hours & Fatigue | Driver roster | Mixed proper-case and all-uppercase driver names | N | pending: DOM | Full proper-case display with exceptions | CC-1 / Cursor |
| D037 | Safety | Hours & Fatigue | Create HOS Violation | Seven visible inputs measured 38px high | I | pending: measured DOM | 32px single-line inputs | Cursor |
| D038 | Compliance | Filings / Overview | Driver labels | Mixed proper-case and uppercase driver labels in populated tables | N | pending: DOM | Full proper-case display with exceptions | CC-1 / Cursor |

| D039 | Driver Profile | Create Driver | Identity step | Fifteen visible inputs measured 38px; CDL state about 199px wide | I | pending: measured DOM | Inputs 32px; state 64px | Cursor |
| D040 | Fleet | Create Trailer | Identity drawer | Seven visible inputs measured 38px high | I | pending: measured DOM | Inputs 32px | Cursor |
| D041 | Insurance | Policies | Create policy step 1 | Eight visible inputs measured 38px high | I | pending: measured DOM | Inputs 32px | Cursor |

| D042 | Cash Flow | Projected Auto | Seven-day outlook | Currency abbreviated with k suffix and zero shown without cents | M | pending: DOM | Full currency with two decimals | Cursor |
| D043 | Cash Flow | Projected / Rolling / Manual | Date labels and cells | Day labels and invoice/due cells omit year and use month names | D | pending: DOM | MM/DD/YYYY for business dates | Cursor |
| D044 | Accounting | Home | Settlement / transaction links | Driver/vendor names still all-uppercase | N | pending: DOM | Proper-case full names with exceptions | CC-1 / Cursor |

## Counts (observed defects, not application-wide totals)

| Module | V | M | D | I | N | T | B | E | P | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Home | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 4 |
| Fuel | 0 | 0 | 0 | 1 | 0 | 2 | 0 | 1 | 2 | 6 |
| Settlements | 0 | 0 | 0 | 0 | 1 | 0 | 9 | 0 | 0 | 10 |
| Dispatch | 1 | 0 | 1 | 1 | 4 | 0 | 0 | 0 | 0 | 7 |
| Tasks | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| Driver Hub | 0 | 0 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 3 |
| Maintenance | 0 | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 3 |
| Safety | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| Compliance | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Driver Profile | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Fleet | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Insurance | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Cash Flow | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| Accounting | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Total | 1 | 3 | 5 | 9 | 10 | 3 | 9 | 1 | 3 | 44 |

## Coverage ledger

- Home: overview inspected, screenshot and timing captured; remaining drawers pending.
- Fuel: Questions + Review, Cards + Assign drawer (cancelled), Expense mapping inspected. Other tabs and secondary drawers pending.
- Settlements: landing/list/navigation inspected; destination tabs and record drawers pending.
- Dispatch: Home + Book Load opened and closed without save. Load Costs landing inspected and screenshot captured; other views/subtabs/record drawers pending.
- Tasks: Task Board, Calendar, My Tasks, Team Chat landing, Admin Report, Exceptions inspected. Create Task opened and cancelled; Exceptions detail tile clicked (no new panel). Remaining per-record, filters and secondary popups pending.
- Driver Hub: Overview, Driver Scheduler, Assign Temp Cover inspected. The latter screenshot timed out; subsequent close/navigation did not execute. Leave Requests and Reporting pending.
- 443.258-D batch 1 checkpoint (partial depth, NOT full module completion): Maintenance Home, Fleet Table, Active WOs, PM Due, Faults, Service/Location, Driver Reports, Road Service, Parts Inventory, Integrity Report, Settings visited. Create Work Order opened and closed. Some table snapshots were taken during loading; their final data and remaining subpanels are still unverified. No empty/loading state from those snapshots is called a defect.
- Safety: Home and Hours & Fatigue visited; populated HOS roster inspected; Create HOS Violation opened, measured and closed. Other Safety groups and record drawers remain owed.
- Compliance: all seven top-level tabs visited; populated Filings and Overview tables inspected; Create notification rule opened/closed; Required Documents populated Drivers table inspected and create-type inline form opened without submission. Other required-document entity tabs, driver-specific HOS detail and secondary panels remain owed.
- 443.258-D batch 2 checkpoint (partial depth): Driver Profile Home, Profiles list/default profile and Create Driver identity step inspected. Fleet Home, populated Units table and Create Trailer drawer inspected. Insurance Landing, populated Policies table, create-policy first step and Claims table shell inspected. Create forms closed without submission. Remaining tabs, later wizard steps, record panels and final Claims data remain owed; no complete-module claim.
- 443.258-D batch 3 checkpoint (partial depth): Legal landing, Contracts table and Send Contract step 1 opened/closed without sending. Cash Flow all five top-level buttons visited; populated Auto and rolling-style Manual content inspected; comparison final rows and drill-through panels remain owed. Accounting landing inspected; submenu and document modals remain owed. No forecast pull, seed-library action, sending or financial action performed.
- Not yet inspected in this pass: Banking, Factoring, Finance Hub, Customers, Vendors, Inventory, 425C, Lists, Reports, Docs, Users, Help, Program, System.
- Transient Loading states that resolved were not counted as defects. Empty Fuel Card table explicitly says no cards assigned: not classified as unexplained emptiness.
- Fuel Relay wallet link currently resolves to the current tab's path. Destination behavior not verified; held as a candidate, not counted.
- No Book Load, draft save, money action, settings save, upload, or form submission performed.
- Guard work remains separate: no V3 coverage bypass, no guard edits in this audit.
- 443.258-D supersedes the earlier timeout stop: waited and reloaded once, recovered, continued. Full coverage and durable screenshot paths remain owed; this register is an interim evidence delivery, not DONE. Clean-main gate failure was posted separately on SEATS-TO-LEAD with command, exit 1 and complete two-line output; no bypass.
