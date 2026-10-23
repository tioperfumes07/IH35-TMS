# Round 443.257-D — live Chrome audit register

Status: IN PROGRESS — not a complete application certification. Observed in authenticated Chrome on app.ih35dispatch.com, USMCA, 2026-10-22 evening Central. Read-only: panels opened, never submitted. No application changes.

## Evidence and limits

Screenshots stay inline in the private Codex task and are never committed. Round 443.258.4 closes durable screenshot export as a requirement. `inline` identifies a captured image; `pending` identifies DOM/timing evidence without a captured image, not a fabricated path. Canvas comparison uses the explicit V3 requirements in the owner's 443.257 brief; a full canvas-to-screen visual pass remains owed. Seat entries are proposed routing, not claims of completed fixes.

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

| D045 | Banking | Home | Drift alert as-of | Raw ISO timestamp rendered, including T and Z | D | pending: DOM | Local business date MM/DD/YYYY; readable time if needed | Cursor |
| D046 | Banking | Home | Drift account label | Several alerts show only generic Account rather than the account display name | N | pending: DOM | Resolve full account display name | CC-1 / Cursor |
| D047 | Factoring | Home | Ready-to-factor customers | All-uppercase customer names displayed | N | pending: DOM | Proper-case names honoring acronym exceptions | CC-1 / Cursor |

| D048 | Customers | Create Customer | Billing address | State and ZIP each measure 38px high and 209.33px wide | I | pending: measured DOM | 32px high; state 64px and ZIP 88px wide | Cursor |
| D049 | Customers | Directory | Customer display names | Mixed uppercase and proper-case customer labels | N | pending: DOM | Proper-case display honoring acronym exceptions | CC-1 / Cursor |
| D050 | Inventory | Create part | Unit cost | Money input measures 28px high | I | pending: measured DOM | Single-line input 32px high | Cursor |

| D051 | 425C | Profiles & Defaults | Company Name | Input measures 30.67px high | I | pending: measured DOM | Single-line input 32px | Cursor |
| D052 | 425C | History | Filed timestamp | Month/day rendered without zero padding | D | pending: DOM | MM/DD/YYYY plus readable local time | Cursor |
| D053 | Lists | Names Master | Name column | Mixed uppercase and proper-case customer names | N | pending: DOM | Proper-case display honoring exceptions | CC-1 / Cursor |
| D054 | Reports | Custom report builder | Report name | Input measures 26.67px high and 1156.38px wide | I | pending: measured DOM | Single-line input 32px; content-appropriate width | Cursor |

| D055 | Docs | All Entities | Entity names | Mixed uppercase and proper-case driver names | N | pending: DOM | Full proper-case display | CC-1 / Cursor |
| D056 | Docs | Upload Document | Category/entity/date inputs | Four visible inputs 38px; date fields about 1201px wide | I | pending: measured DOM | Inputs 32px; date widths fit MM/DD/YYYY | Cursor |
| D057 | Users | Master-detail | User labels | Repeated generic User labels and mixed name capitalization | N | pending: DOM | Resolved full names with proper-case display | CC-1 / Cursor |
| D058 | Users | Create User | Name/email/role | Three visible inputs 38px high | I | pending: measured DOM | Single-line inputs 32px | Cursor |

| D059 | Program | Scenario tracker | Certification timestamp | Raw database timestamp with fractional seconds and +00 timezone | D | pending: DOM | MM/DD/YYYY and readable local time | Cursor |

| D060 | System | Transaction Health | Generated/document dates | Month-name timestamps instead of MM/DD/YYYY | D | pending: DOM | MM/DD/YYYY with readable CT time | Cursor |
| D061 | System | Transaction Health | Journal-entry and bill-payment labels | Raw UUIDs are visible display labels | N | pending: DOM | Human-readable display identifiers | Cursor |
| D062 | System | Transaction Health | Wiring preview DR/CR | Currency values lack dollar signs | M | pending: DOM | Currency formatted $1,234.56 | Cursor |
| D063 | Reports | Scheduled subscriptions | Add subscription timezone | Input measures 30.67px high | I | pending: measured DOM | Single-line inputs 32px | Cursor |
| D064 | Accounting | Create Manual JE | Step 2 Lines | Header summary renders `Date: 2026-10-22`, while Step 1 correctly shows `10/22/2026` | D | inline: Manual JE Step 2 | Display dates consistently as MM/DD/YYYY | Cursor |
| D065 | Accounting | Create Manual JE | Step 2 Lines | Class selector overlaps the adjacent Debit field; line controls overflow the drawer horizontally | V | inline: Manual JE Step 2 | Distinct aligned non-overlapping fields contained in the drawer | Cursor |
| D066 | Banking | Home / Record Transfer | Drawer footer | Persistent alert stack renders above the open transfer drawer and obscures its bottom action area | V | inline: Record Transfer drawer | Alerts must not obscure drawer controls; close/cancel remains accessible | Cursor |

| D067 | Accounting | Bills / Bill detail | Payments on this bill | Two linked payments render as `Payment — not visible` rather than distinct display identifiers | N | observed Chrome AX | Readable distinct payment identifiers; no UUID fallback | Cursor |
| D068 | Accounting | Bill detail | Journal Entity column | Five journal rows show raw UUID entity labels | N | observed Chrome AX | Resolve human-readable entity names | Cursor |
| D069 | Accounting | Reclassify | Account balance heading | Date displays `10/23/26` while date filters use `10/23/2026` | D | observed Chrome AX | MM/DD/YYYY consistently | Cursor |
| D070 | Banking | Categorize / Match | Candidate dates | Loaded candidate list displays YYYY-MM-DD dates while transaction header uses MM/DD/YYYY | D | observed Chrome AX | MM/DD/YYYY consistently | Cursor |
| D071 | Banking | Categorize / Match | Candidate payee labels | Candidate names mix ALL CAPS and proper case | N | observed Chrome AX | Full names in proper case, respecting approved exceptions | Cursor |
| D072 | Banking | Relay card | Wallet balance tile | Five-digit currency omits thousands separator | M | observed Chrome AX | Currency formatted $1,234.56 | Cursor |
| D073 | Cash Flow | Projected Auto | Expected Expenses driver labels | Driver Bill labels mix ALL CAPS and proper case | N | observed Chrome AX | Full names in proper case, respecting approved exceptions | Cursor |
| D074 | Dispatch | Truck Line | Initial data requests | Network capture: truck-line 11,425 ms; units-without-load 4,810 / 8,819 ms; positions/latest 4,193 ms; detention/board 3,217 ms | P | Chrome Network timing; payloads not retained | API responses within 2 seconds; responsive row rendering | Lead assigns |
| D075 | Settlements | Open Tours | PU / DEL dates | Rendered dates use OCT-21 / OCT-23 rather than numeric month/day/four-digit year | D | observed Chrome AX | MM/DD/YYYY dates | Cursor |
| D076 | Settlements | Escrow Accounts | Holder labels | One visible holder link says Driver — Not Visible instead of a resolved full name | N | observed Chrome AX; names not retained | Readable full holder name or explicit unavailable-record explanation | Cursor |
| D077 | Settlements | Escrow Accounts | Updated dates | Date portion uses unpadded month/day before time | D | observed Chrome AX | MM/DD/YYYY with consistently formatted time where needed | Cursor |
| D078 | Maintenance | Road Service / Create Roadside WO | Ticket # and Location inputs | Two single-line dialog text inputs measure 38 CSS px high | I | read-only DOM bounding rectangles; opened and cancelled | 32 CSS px input height under V3 audit contract | Cursor |
| D079 | Customers | Per-Customer P&L | Classification labels | Visible tags read high_margin and past_due | N | observed Chrome AX | Human-readable labels, not snake_case internal codes | Cursor |

Depth batch 13 (partial): Customer detail Profile, Contacts, Billing & Receivables, Quality & History, Lanes & Pricing, Documents, COI, Contracts, Portal Users, Tasks, Loads, Per-Customer P&L, Audit History visited. Create Contact, Create Quality Event, Edit Lane, Create COI Request and Create Task dialogs opened and cancelled; no entries saved, invitations sent or uploads. Event/task dates provide calendars and numeric dates; lane-rate field uses grouped decimals. Customer P&L explanatory popover inspected. Vendor populated directory/detail, A/P, Documents, W-9/1099 and Audit History visited; payments and tax data not changed. Some document panels were observed loading and final data remains unverified. Reports catalog and Maintenance cost per unit inspected: separate numeric date fields with calendars, sortable headers and gear; Back returns to /reports. Other reports, vendor task/edit/payment panels and deeper customer document surfaces remain owed. D079 is the new observed display defect; no module-wide pass claim.

Depth batch 12 (partial): Dispatch Truck Line populated, 17 rows; status menu visually shows five human-readable labels, prior raw-code complaint not reproduced. Warm click-to-observed rows 163 ms. Initial cold observation by 29.518 s and repeat reload observation by 25.849 s are upper bounds, not exact render timings. Network durations in D074 are measured, but event capture reports truncation and browser resource buffer is full (250); exhaustive slow-request coverage remains unproved. Settlements Open Tours has P-number links and separate sortable PU/DEL columns; all 14 navigation targets now use /driver-finance, though all destination Back buttons are not yet tested. Escrow holder opens its driver register and the Escrow Back button returns to /driver-finance/escrow. Maintenance Road Service loaded, ticket form opened/measured/closed without saving. No submissions or production mutations. Remaining tabs, drawers and record depth still owed; no completed-module claim.

## Counts (observed defects, not application-wide totals; table below through D063, later depth rows not yet rolled up)

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
| Banking | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 2 |
| Factoring | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Customers | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| Inventory | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| 425C | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| Lists | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Reports | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 |
| Docs | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| Users | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| Program | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| System | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 3 |
| Total | 1 | 4 | 9 | 16 | 17 | 3 | 9 | 1 | 3 | 63 |

## Coverage ledger

- 443.261.1 depth batch 11 (partial depth): Accounting Bills register, expanded payment rows, bill detail/journal/proof trail, Expenses register, Reclassify, Period Close landing and Reports link inspected. Banking Reconciliation landing, Categorize/Match drawer opened and closed without posting, Dreamline populated worklist and Relay card visited. Cash Flow Home, populated Projected, Actual vs Projected with filters opened/cancelled, Rolling Ledger and Manual inspected. Manual navigation recovered after one reload; not called a persistent defect. D067-D073 are display observations, not accounting errors. Full Accounting submenus, additional drawers and per-record depth remain open; no full-module completion claim. No financial action, settings save, transaction pull or form submission.

- Depth batch 10 (Accounting / Banking / Cash Flow, partial): Accounting Manual JE steps 1 and 2 opened then closed without save; Banking Inspect feedback and New menu inspected, Record Transfer drawer opened/closed without input or submission; Cash Flow Manual Daily Projections loaded and optional income fields expanded without creating lines, saving opening cash or pulling transactions. D064-D066 are observed UI defects, not financial reconciliation findings. Inline screenshots remain private. All other outstanding tabs and panels below remain owed.

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
- 443.258-D batch 4 checkpoint (landing depth only): Banking Home, Factoring Home populated table and Finance Hub landing inspected. No bank action, matching, resolution, submission or dismiss performed. Their tabs and panels remain owed. No defect observed on Finance Hub landing is not a module-wide pass.
- 443.258-D batch 5 checkpoint (partial depth): Customers populated directory and Create Customer form inspected/closed; Vendors populated directory inspected; Inventory Parts & Stock and Create part drawer inspected/closed, Assignments navigation reached loading shell. Vendor details/create, Inventory assignments final state/purchase history and secondary panels remain owed. No records created.
- 443.258-D batch 6 checkpoint (partial depth): 425C Profiles & Defaults and populated History inspected without changing records; Lists landing and Names Master populated table inspected; Reports landing and Custom Report Builder loaded fields inspected without saving. Catalog details, individual reports, schedules, 425C detail and secondary panels remain owed.
- 443.258-D batch 7 checkpoint (partial depth): Docs populated All Entities table and Upload Document dialog inspected/closed without file selection; Users populated master-detail landing and Create User dialog inspected/closed without invitation; Help landing inspected. Entity tabs, document previews, remaining user views/profiles and help articles remain owed. Chrome timeout recovered after waiting and one reload.
- 443.258-D batch 8 checkpoint (two remaining modules, partial depth): Program scenario tracker visited with USMCA selected; System Overview and Software / Build inspected. The latter reports background_jobs.stale DOWN while other visible checks report OK; this is recorded as observed runtime health, not misclassified as a UI crash. Other Program destinations and System tabs remain owed.
- Depth batch 9 (System/Help/Reports): System Transaction Health scope controls inspected first, USMCA selected and TRANSP/TRK unchecked before reading document content. Initial last-selected-company uncheck was refused; selecting USMCA first resolved it. No frozen-company records inspected. Help Booking checklist opened, Back verified to /help, Filters opened/cancelled. Reports Scheduled Subscriptions and Add subscription form inspected/cancelled; no schedule saved or delivery triggered. Subscription page explicitly says delivery worker is unimplemented; this runtime text is not independent proof of backend implementation status. Remaining destinations/dialogs still owed.
- Every visible sidebar module has now been visited at least once. This is NOT full module/tab/modal coverage; all outstanding deeper coverage above remains open. Durable screenshots are no longer required under 443.258.4. No full-audit completion claim.
- Transient Loading states that resolved were not counted as defects. Empty Fuel Card table explicitly says no cards assigned: not classified as unexplained emptiness.
- Fuel Relay wallet link currently resolves to the current tab's path. Destination behavior not verified; held as a candidate, not counted.
- No Book Load, draft save, money action, settings save, upload, or form submission performed.
- Guard work remains separate: no V3 coverage bypass, no guard edits in this audit.
- 443.258-D supersedes the earlier timeout stop: waited and reloaded once, recovered, continued. Full coverage remains owed; this register is an interim evidence delivery, not DONE. The prior clean-main gate failure was posted on SEATS-TO-LEAD; 443.258.4 identifies its fix in #27231. Publication requires a fresh passing gate after sync; no bypass.
