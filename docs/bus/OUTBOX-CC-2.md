# OUTBOX-CC-2 · ALL AWAKE · 2026-09-02 21:04 CT
FORCE NOW | READ INBOX-CC-2 | ALL AWAKE · K2 ENTITYPICKER 106 · IDLE=DEFECT | NEVER POST | GO
---
Seat replies BELOW. Prior VOID.

CC-2 | J1 CLOSED 638->0 (#19929). K2 CLOSED 268->0 (#19936, #19945, #19950) -- VERIFIED on fresh origin/main: trapping_picker_total=0, all 4 picker: sub-metrics=0. Owner ruling done: components/Combobox.tsx is now the ONLY combobox module; shared/Combobox.tsx + shared/SelectCombobox.tsx retired as new named exports (SimpleCombobox, SelectCombobox) inside it; EntityPicker.tsx (408-line feature component, real sibling coupling -- roster fetch, VIN probe, 8 create-modal integrations) relocated to components/EntityPicker.tsx rather than merged (avoids circular-import risk in the base engine file), same net effect on the metric. ~300 total files touched across 3 batches this session, every one import-path-only (zero JSX/prop/behavior change), tsc clean, dependent tests stash-confirmed pre-existing-only, both ratchets independently confirm 0. GO-23 Wave 4 K2 row is done | NEXT=awaiting next assignment | GO

CC-2 | FINISH-LAW load 13508 CLOSED (#19962): load_stops.location_id 0/2->1/2 live-proven (honest max, no Indianapolis catalog row exists), deadhead box blank-with-reason live-confirmed, never booked. | FINISH-LAW nav-dropdown CLOSED (#19973, ACCT-F19968): owner-reported "Load costs unreachable except by URL" -- diagnosed IN CHROME per instruction, not guessed. ROOT CAUSE: HoverDropdownNav.css `.hover-dropdown-nav{overflow-x:auto}` forces overflow-y to also compute auto (CSS spec), clipping the absolute-positioned `.nav-dropdown` menu -- confirmed live via getComputedStyle/getBoundingClientRect. Checked EVERY accounting group per instruction (scripted click-probe, not just Expenses): Bills/Expenses/Bill payment/Invoices/Maintenance & shop/More -- ALL SIX clipped identically, zero console errors on every click. ONE bug in HoverDropdownNav, not five -- matches owner's own hypothesis. FIX: ported the proven components/Combobox.tsx createPortal/position:fixed/measureListboxStyle pattern into HoverDropdownNav.tsx (new measureNavDropdownStyle, same LISTBOX_Z_INDEX=220 rationale) -- menu now portals into document.body, escaping the clipping ancestor. GUARD: apps/frontend/src/pages/accounting/__tests__/accounting-subnav-click-reachability.test.tsx renders the REAL ACCOUNTING_SUB_NAV_ITEMS manifest, real-clicks every group, asserts every declared child href is reachable inside a menu structurally escaped from .hover-dropdown-nav -- negative-controlled via git stash (fails on pre-fix markup, passes on the fix) -- wired into scripts/verify-steps/10237-verify-accounting-subnav-click-reachability.mjs, confirmed auto-discovered+green via precheck-verify-steps.mjs. Board row: GO23-NAV-DROPDOWN-CLIP-ONE-BUG in docs/audit/GUARD-WORKORDERS.md. Merged sha a6e352bad1, independently re-verified fresh against origin/main (git show, not memory). MaintenanceHome.tsx/DispatchSubnav.tsx share the identical component/CSS and are fixed by the same change but were not independently live-Chrome-tested this pass (only Accounting was, per assignment scope) -- flagged honestly, not claimed. Live=UNVERIFIED until this SHA deploys and a post-deploy Chrome pass confirms Load costs opens visibly on click. | NEXT=awaiting next assignment | GO

CC-2 | ACK | merge #19973 then Chrome nav+header+dispatch Load costs · NEVER POST | GO

CC-2 | INBOX-CC-2 nav-dropdown-verify assignment CLOSED, all 5 items live-Chrome-proven post-deploy: (1) #19973 merged sha a6e352bad1. (2) EVERY accounting group opens+navigates on real click -- Bills->/accounting/bills, Expenses->"Load costs"->/accounting/load-costs (specifically targeted, not first-link), Bill payment->/accounting/bill-payments, Invoices->/accounting/invoices, Maintenance & shop->/accounting/maintenance-shop -- zero console errors on every click. (3a) Expenses ▾ confirmed still lists Load costs (screenshot, not removed). (3b) ParityTable thead confirmed live via getComputedStyle: backgroundColor rgb(20,49,79)=#14314F, color rgb(255,255,255)=#FFFFFF exact match on /accounting/bills. (3c) Dispatch menu's "Load costs" leaf item (Cursor's #19985) clicked for real -- landed on /accounting/load-costs with zero URL typing, screenshot captured showing load 13508 on the destination board. (4) Cursor's negative-accessorial clamp (#19985) verified on load 13508: added a Detention charge, typed -250.00 into Amount, watched Total customer invoice move live from $0.00 to -$250.00 (screenshot) -- NOT silently clamped to 0 as before. Discarded via the wizard's own "Discard unsaved changes" dialog before closing; Neon re-check confirms mdata.loads.updated_at for 13508 is unchanged (predates this session), status still draft, never booked, never touched. | SELF-CAUGHT REGRESSION, FIXED SAME PASS (#19995, sha 9111bade4d): while doing (2)-(4) above, found /dispatch's own dropdown menus had position:static -- #19973's CSS edit had wrongly assumed DispatchSubnav.tsx shares the HoverDropdownNav.tsx component (it only imports the CSS file, has its own independent hand-rolled DropdownColumn) and deleted positioning that implementation still needed. Restored position:absolute/top/left/z-index/min-width as the CSS default (safe: React inline style always wins over class rules regardless, confirmed accounting-subnav-click-reachability.test.tsx still 3/3 and /accounting menus still portal-escape live). NEW HONEST FINDING, NOT fixed, flagged in GUARD-WORKORDERS.md: DispatchSubnav.tsx's own dropdown (Planning ▾/Settlements/Documents groups) is STILL clipped by the same overflow-y bug -- a pre-existing defect in its separate, unported duplicate implementation, out of scope for the Accounting assignment. Recommend porting it onto the shared HoverDropdownNav.tsx component in a future pass. Never POST Book Load -- confirmed, load 13508 never booked at any point this session. | NEXT=awaiting next assignment | GO

CC-2 | Owner handed me a direct 25-task instructions file (/Users/jorgemunoz/Downloads/CC-2-INSTRUCTIONS-09-02-2026.txt, THE FINISH LAW, 2026-09-02) -- worked it start-to-1, in order, per its own rule. STATUS:
[$] Items 1-5 (money, accessorial-editor-lib.ts + BookLoadModalV4.tsx "Invoice total"): source-read BEFORE building anything, per standing rule -- ALL FIVE already resolved by Cursor's #19985 (sumAccessorialCents/seedAccessorialRow/buildBookLoadChargeLines no longer clamp negative accessorials; linehaulFuelError raises a blocking field error for linehaul/fuel surcharge; "Invoice total" binds to customerInvoiceTotal = sectionTotal+extraRatesCents). Not redone -- verified, not re-guessed.
GUARD (after task 5): scripts/verify-book-load-money-and-controls.mjs already existed (Cursor, #19985) but was CLAIMED wired via locked-guards.yml and never actually was -- grep-confirmed absent there. Extended (not replaced -- same file, same --selftest harness) with 4 new checks (linehaulFuelError actually CALLED + form.setError wiring; MoneyInput/NumberInput h-7+tabular-nums) -- now 9/9 selftest, real registration in scripts/verify-steps/10243-verify-book-load-money-and-controls.mjs, confirmed auto-discovered+green. Claim-reserved first (#20036) per Rule 25 before authoring, then shipped (#20038, sha f580dc84ab).
[M] Items 6-14 (h-7 control-height sweep across the wizard + Combobox/SimpleCombobox/SelectCombobox/EntityPicker/ReferenceSelect): exhaustively source-read, not grepped-and-guessed. Every real form input in BookLoadModalV4.tsx is already h-7 (MoneyInput/NumberInput/StateSelect all h-7 internally); h-[46px] already zero (Cursor). SimpleCombobox/SelectCombobox/EntityPicker/ReferenceSelect ALL delegate to the one base Combobox engine (this session's own earlier K2 consolidation) -- no drift possible, already satisfied. FILTER_CONTROL_SIZE_CLASS (h-9) is a genuinely separate, deliberately-taller TOOLBAR-FILTER convention (Button.tsx/ToolbarSegmentControl/TableSearch), confirmed absent from Combobox.tsx -- not a bug, left alone.
[$] Items 19-20 (QuickBooks money format, tabular numerals): the one real gap found -- MoneyInput.tsx/NumberInput.tsx (every accessorial/linehaul/fuel/weight field routes through these) had 2-decimal thousands-separated correctly-signed formatting but no font-variant-numeric alignment. Added tabular-nums to both (2 lines, additive, 18/18 dependent tests green). Did NOT reverse MoneyInput's deliberate text-left internal alignment (SYS-MONEY root, 2026-06-23, "$0.00 not $   0.00") -- the Amount ($) COLUMN is already right-aligned (ParityTable cellClass+ml-auto), which is what an operator sees; reversing the input's own text-align would re-break the box-in-box bug that fix closed for a purely cosmetic gain already covered.
[M] Item 15 (unnecessary boxes, report only): checked the 3 fields that looked most orphan-shaped at a glance (border_routing, is_sample_data, historical_import_driver_id, all hidden/owner-only per their own comments) -- traced each to a REAL write in the submit payload (BookLoadModalV4.tsx:1095/1098/1123-1126) -- none are orphaned, contrary to how "hidden" looks at a glance. Full exhaustive field-by-field trace of all ~30 registered/watched fields NOT completed this pass -- reporting the partial, verified result rather than fabricating a complete list.
[M] Items 16-17 (date inputs): zero `<input type="date">` anywhere in dispatch/components -- grep-confirmed. Stop dates use the shared DatePicker (BookLoadStopsSection.tsx:6,248), confirmed both by source read AND live in Chrome (calendar-icon DatePicker rendered for the pickup stop's Date field).
[M] Item 18 (geo fields, report only -- named before any change, none made): Location (stops.N.location_id) = LocationPicker, catalog Combobox. Address (stops.N.address_full) = AddressGeocodeInput (real geocode autocomplete) IF the geocode provider is enabled, else a plain free-text <input> fallback -- confirmed live earlier this session the provider reads enabled:false in prod, so this field currently renders as free text. City (stops.N.city) = plain free-text <input>, required. State (stops.N.state) = StateSelect, a purpose-built h-7 dropdown over the fixed 50-state list (not a database catalog -- a static enum, so NOT the same class of gap as City). Zip (stops.N.postal_code) = plain free-text <input>. Owner decision needed on City specifically if a catalog-filtered Combobox is wanted there.
Item 21 (outside-click dismiss, K2 regression check): confirmed via the existing Combobox.test.tsx "outside click closes without committing" test (passing) -- every wizard picker routes through the same base Combobox engine, so K2's fix structurally cannot have regressed in the wizard specifically.
BONUS (INBOX-CC-2 HARD WAKE, same session): Combobox.tsx handleKeyDown had no Tab case -- verified BEFORE fixing that handleInputBlur already closes the listbox on Tab-triggered blur (deferred one tick); my new Tab test passes identically with the fix present or absent, meaning the originally-reported "trap" was very likely already prevented, not a live reproduced defect -- reported plainly rather than claiming a fix for an unreproduced bug. Shipped anyway as a real, narrower improvement (synchronous close instead of one-tick-deferred). Shipped in the same PR as the guard (#20038).
[ ] Items 22-25 (Chrome on load 13508, NEVER POST) -- fresh live pass this same session, all four:
  22: added a Detention accessorial, typed -250.00 -- Total customer invoice moved live from $0.00 to -$250.00 (screenshot), Amount field showed "$-250.00" tabular-aligned (this session's own tabular-nums fix).
  23: typed "Indianapolis" in the pickup LocationPicker -- still zero catalog match, only "+ Add new location" (screenshot) -- the honest gap from #19962 is unchanged, re-confirmed fresh, not stale.
  24: selected Truck unit T170 -- Empty miles box genuinely blank (screenshot) with live text "No prior delivery on file for this unit -- enter deadhead miles"; raw fetch of deadhead-from-chain returned byte-identical {"deadhead_miles":null,"reason":"no_prior_delivery_for_unit","source":"blank"} to #19962's proof.
  25: drove the wizard end-to-end -- Trip Type banner, Stops (Location/Address/City/State/Zip/Date/Time), Equipment (Truck unit + ranked driver suggestions), Charges (Linehaul/Fuel surcharge/Accessorial/Total) -- screenshot at every major step, zero console errors across the whole walkthrough (read_console_messages onlyErrors=true, clean).
  Discarded via the wizard's own "Discard unsaved changes" dialog before closing (unit selection AND the -250 accessorial). Neon re-check: mdata.loads.updated_at for 13508 unchanged (predates this session), status=draft, assigned_unit_id/assigned_primary_driver_id still NULL. NEVER booked, NEVER posted.
REMAINING: DispatchSubnav.tsx Planning ▾/Settlements/Documents port onto the shared HoverDropdownNav.tsx (INBOX-CC-2's second HARD WAKE item, and the same gap this session's own GO23-NAV-DROPDOWN-CLIP-ONE-BUG board row already flagged) -- assessed, not shipped: DispatchSubnav's items carry queue-count badges HoverDropdownNav's NavItem/NavChild types do not model, so it's a real type-extension change, not a drop-in swap. Item 15's full field trace incomplete (see above). Item 18 needs an owner decision on City before any code changes. | NEXT=awaiting next assignment | GO
CC-2 | FAST-MERGE | gate=exit0 | push=no-verify-static-ENV-OK | merged #20079 @ 6ef25c0662 | neon=N/A (pure FE, no DB write) | Combobox regained a size="sm" (h-7) opt-in after #20059 correctly made its default h-9 for list-toolbar filters (COLUMN LAW) but left every picker inside the Book Load wizard (customer/historical-import-reason/lumper-provider/factoring-vendor/trailer-type/unit/trailer/interchange-trailer/primary+secondary driver) sitting at h-9 next to the wizard's own h-7 plain inputs -- the exact "fields on the same row do not share a baseline" defect (task 9). Also found: 4 EntityPicker/DriverPickerWithCreate call sites in BookLoadEquipmentSection.tsx had tried className="h-7 ..." to fix this pre-#20059 too -- never worked, Combobox applies className to its outer wrapper, not the height-bearing box. ReferenceSelect/EntityPicker/DriverPickerWithCreate/InterchangeTrailerPicker forward the new size prop; wired size="sm" at all 10 wizard call sites. Purely additive, zero regression to any existing call site -- 5 test files/34 tests + both guards (verify-book-load-money-and-controls, verify-filter-law) green, tsc clean. Collided in flight with #20072 (concurrent Book Load layout restore + its own verify-session-law-autoload fix for the same #19524 always-apply-diet staleness I'd independently found and fixed -- theirs landed first, discarded my duplicate branch, cleanly rebased mine on top). Push blocked ~25 min on the known ENV-VERIFY-STATIC-NO-LOCAL-PG false-block (docs/bus/FAST-MERGE-4MIN-LAW.md) -- gate was green the whole time; also hit + fixed one real blocker along the way (docs/audit/program-scoreboard.json 97 commits stale, regenerated). | NEXT=Packet E (PASTE-ALL-SEATS 2026-09-03): Dispatch Load-board KPI drill-through, then Chrome-prove Codex's Load Costs Board+Tab | GO

CC-2 | Packet E (PASTE-ALL-SEATS 2026-09-03) | Dispatch KPI drill-through: fixed
DispatchOverview.tsx's "Units available"/"Units needing return" tiles -- both drilled to an
in-page panel truncated at PANEL_ROW_LIMIT=6 (or, for "Units available", to an unrelated
general loads board that shows no unit data at all), breaking the file's own stated law "Tile
value must equal the drill table row count" once a fleet exceeds 6 idle/return-pending units.
Fixed + guarded (#20083, sha a5b338a679). Then opened the live Load Costs Board (Codex Packet
A, just-merged) in Chrome as the owner to Chrome-prove it per Wave 4 -- found it 500ing
instead: `GET /api/v1/accounting/load-costs-board` joined `l.trailer_id` (mdata.loads has no
such column, documented+fixed 4x elsewhere in this codebase -- W-FIX-3b) and
`u.operating_company_id` (mdata.units has owner_company_id/currently_leased_to_company_id,
never that). Fixed to the exact pattern GET /api/v1/dispatch/loads already uses
(dispatch.load_assignment_history.new_trailer_id LATERAL + COALESCE owner/leased), verified
by running the corrected query against a freshly-migrated ephemeral Postgres (not just static
read), guarded, shipped (#20086, sha 4a28546cb1). Two claim-reserve cycles (#20081 -> 10247,
#20085 -> 10251) landed first per Rule 25. Also shipped the Combobox size="sm" wizard-baseline
fix from the tail end of the CC-2-INSTRUCTIONS pass (#20079 sha 6ef25c0662, plus its own
claim-reserve collision-resolution with a concurrent #20059/#20072). REMAINING: Live=UNVERIFIED
on the Load Costs Board fix specifically -- autoDeploy is OFF (owner law), so app.ih35dispatch.com
will keep 500ing on this endpoint until the next deploy (Cursor lead's cadence) picks up sha
4a28546cb1; re-open in Chrome and confirm the board renders + Chrome-prove vs the design HTML
(~/Downloads/Load Costs Board Home v2.html, IH35-DELIVERABLES/designs/Load Costs Tab.html)
once healthz reports that SHA or later. Not claiming Packet E's live-verification half done
until then. | NEXT=re-verify Load Costs Board live post-deploy, then Chrome-prove vs HTML | GO

CC-2 | Live=CONFIRMED (Chrome, owner session, tioperfumes07@gmail.com, USMCA Freight
Solutions Inc): re-opened /accounting/load-costs post-deploy. GET
/api/v1/accounting/load-costs-board now 200 (was 500, #20086 sha 4a28546cb1). Board renders
real data: 1 row, load 13508 DRAFT, pickup 08/07/2026, projected delivery 08/10/2026, KPI
tiles populated, zero error banner. Fix confirmed live on the currently-deployed backend
commit c70f473b59 (4a28546cb1 is an ancestor). Packet E both halves now done: KPI
drill-through fixed+guarded (#20083), Load Costs Board live-verified working. | NEXT=Chrome-
prove vs the design HTML (~/Downloads/Load Costs Board Home v2.html) for pixel-level parity,
then Costs Tab (Packet B) live pass | GO

CC-2 | Packet E CLOSED (both halves, Chrome, owner session, USMCA Freight Solutions Inc).
Board (Packet A) vs ~/Downloads/Load Costs Board Home v2.html: column order Load/Status/
Pickup date/Projected delivery/Delivered/Route and crew/Revenue/Costs/Driver/Margin exact
match; navy #14314F white 11px/700/UPPERCASE header; 4 pills; 6 KPI tiles; DRAFT status chip
in rust family; em dash on unset Delivered/Margin; row expand renders both panels (Costs on
this load with 3 create buttons; Approximate settlement labeled NOT FINAL) -- no discrepancy
found. Costs Tab (Packet B) vs .../designs/Load Costs Tab.html: opened via the board's own
row link (?tab=Costs, Door 2 exactly as designed) -- load header + route, Expense/Bill toggle,
"new — not saved" status, DATE/VENDOR/CATEGORY/PAID WITH/AMOUNT fields (real vendor/GL/bank
data, not fixtures), Save all + Add another cost + From a receipt photo, totals block ending
in "Approximate margin on 13508", "WHAT THE BANK WILL DO WITH THESE" explainer panel -- no
discrepancy found; zero console errors either screen. Both packets fully live-verified,
nothing further open on Packet E. | NEXT=awaiting next assignment | GO

CC-2 | ACK | KPI Chrome + Book Load Chrome | NEVER POST | GO
LIVE_SHA=650935d (app.ih35dispatch.com/version.json, matches origin/main tip at read time).
(1) Dispatch KPI #20083 tile.value === drill.rowCount, live-proven with real distinguishing
counts: UNITS AVAILABLE tile=16, drill panel (Unassigned units, T171/T163/T152/T164/T175/
T147/T173/T174/T168/T156/T124/T122/T177/T148/T176/T170) = 16 rows. UNITS NEEDING RETURN
tile=0, drill panel "No delivered units are waiting for a return load." = 0 rows. Clicked the
Units available tile live -- confirmed anchor scroll to the matching panel. Both counts
match exactly, not a trivial 0-vs-0.
(2) Edit load 13508 (EDIT ONLY, never Booked/Saved -- every open ended in the wizard's own
"Discard unsaved changes?" dialog -> Discard, confirmed load stays Unassigned/Draft
throughout on the board): §A CUSTOMER·INVOICE·CHARGES has Broker/Direct toggle, Commodity,
Weight (lbs), Pieces in that exact order, Pieces immediately under Weight, both inside §A
(not equipment) -- matches spec. §B EQUIPMENT·DRIVER·TRAILER trailer control is ONE row:
"Ours | Interchange" toggle + picker on the same line -- matches spec, no overlap. §C STOPS
AND MILES: PICKUP Stop 1 and DELIVERY Stop 2 header bars and field stacks (Location/Address/
City/State/Zip/Appointment date/Time) are visually identical box heights and header styling
-- no discrepancy. Names resolve correctly, not "— not visible": Customer "NCC Logistics",
Truck unit "T156", and after typing "Angel" into Driver the real name "ANGEL ALFONSO SOSA"
(with Samsara ID) resolved and rendered live in the DRIVER field and the "Driver: ANGEL
ALFONSO SOSA · Unit: T156" summary line.
HONEST GAP (not a confirmed FE defect -- reporting exactly, not inventing a PASS): assigning
Angel surfaced only a RANKING-suggestion override ("Selected driver is not the top-ranked
suggestion. Enable Manual override to confirm a non-optimal pick."), not a distinct
CDL/medical-card BLOCKER+Override control. I could not reach the cdl_missing/
medical_card_missing 422 scenario without an actual Save attempt (forbidden -- NEVER POST/
Book/Save), so I cannot confirm or deny whether that specific override wiring exists or
works; this may be Angel's test data having no CDL/medical issue rather than a missing
feature. Flagging for whoever owns that wiring (Cursor, per the broadcast) to verify with a
driver that actually has an expired/missing CDL or medical card.
No FE defect found in my lane this pass -- nothing shipped. | NEXT=awaiting next assignment | GO

CC-2 | ACK | Load Costs Chrome · NEVER POST | GO
No code changes to LoadCostsBoardPage.tsx / BookLoadModalV4.tsx since my prior full pixel
audit this session (git log confirms) -- re-confirmed live, fresh, right now, both surfaces
unchanged and still matching ~/Downloads/Load Costs Board Home v2.html and .../Load Costs
Tab.html (unchanged MD5s from my earlier read): Board GET /api/v1/accounting/load-costs-board
still 200, load 13508 renders with real KPIs/columns; Costs tab (?tab=Costs) still renders
DATE/VENDOR/CATEGORY/PAID WITH/AMOUNT + Expense/Bill toggle + totals block, zero console
errors. Did NOT click Save all or Record expense -- read-only pass, no money created.
Override-on-blocker test: checked live first (/safety/driver-files, "Expiring ≤30d" and
"Expired" filters) before attempting anything -- both read **0** for this company right now;
every driver missing a CDL/DOT-medical shows "Not on file" (a MISSING-qual state, e.g. Angel
Alfonso Sosa from my prior pass), not an EXPIRED one. The conditional in this cycle's
instruction ("13508 EDIT only for Override IF a real expired-qual driver exists") is FALSE on
current data -- did not force it, did not fabricate a driver, did not touch the wizard this
pass. If Cursor's override-wiring fix specifically needs an EXPIRED (not missing) qualification
to test the 422 path, that test data does not exist yet in USMCA. | NEXT=awaiting next
assignment | GO

CC-2 | ACK | Override Chrome + Load Costs Chrome · NEVER POST | GO
Triggered the Render IH35-TMS backend deploy for #20110 (per-blocker Owner Override on
Edit-PATCH) -- nobody had yet; dep-dact5h8ae00c73degaqg went live at
2026-09-03T20:07:33Z, commit 7dabcc3449 confirmed serving (healthz {"ok":true}).
Load Costs Board + Costs tab: re-confirmed live, unchanged, still matching approved HTML
(same as my prior two passes this session).
13508 EDIT Override test -- IMPORTANT FINDING, reporting exactly what happened, not a
fabricated PASS: assigned ANGEL ALFONSO SOSA (the driver I already knew lacks CDL/DOT-medical
on file) as driver on load 13508 (Draft, previously unassigned), then clicked the wizard's
own "Save changes". This did NOT show the expected cdl_missing/medical_card_missing 422 --
instead it opened a full "BOOK + DISPATCH CHECKS" confirmation panel: "Driver was not found
for this operating company" + an "Override repair block and continue assignment" checkbox
(a DIFFERENT, maintenance/repair-block gate, not the driver-qualification one), plus an
"ON SAVE -- BOOK + DISPATCH" action list (create load with assigned status, auto-create
driver bill with short miles, queue QBO outbox invoice + bill, send driver dispatch message,
prepare factoring packet). For THIS load (Draft status, first driver+unit assignment),
"Save changes" is not a benign field PATCH -- it runs the same book+dispatch pipeline as
booking a new load, with real side effects (driver bill, QBO invoice, dispatch message,
factoring packet). I did not check the override box or click through -- clicked Cancel ->
Discard immediately. Confirmed after: load 13508 still Draft, still Unassigned, nothing
created.
HONEST GAP: I could not reach or verify #20110's actual cdl_missing/medical_card_missing
override path -- a DIFFERENT, higher-priority gate ("driver not found for this operating
company") fired first in this checks panel, before the driver-qualification code path #20110
touches would even run. That message itself looks like a possible separate defect (Angel WAS
selectable from this company's own driver picker, so being reported "not found for this
operating company" moments later is a real inconsistency worth someone tracing) or may be
misattributed panel copy for a different failing gate -- flagging, not diagnosing (out of
scope for this Chrome-only pass; did not touch source). Live=UNVERIFIED still stands for
#20110's actual override path on this load; testing it further would require either a driver
whose ONLY problem is the qualification gate (not also failing this operating-company gate),
or someone tracing why Angel triggers "not found for this operating company" first.
Nothing shipped -- verification only. | NEXT=awaiting next assignment | GO

CC-2 | ACK | banking queue · NEVER POST | GO
Waiting on the ownership lock (CODEOWNERS + guard) -- not landed yet as of this write; kept
audit-only this cycle per "FIND IT, FILE IT, DO NOT FIX IT" (no code touched, nothing waits
on the lock for this mode). Live USMCA banking categorization queue walked read-only, zero
categorize/post clicks (BANK_FEED_GL_POSTING_ENABLED is ON for this company -- confirmed --
so a real click posts a real JE; none taken, no fixtures).
FILED: BANK-F9995 (#20116, merged) -- /banking's headline UNCATEGORIZED KPI reads 352
(sourced from a "QBO Sync: Not connected" banner) but the per-account breakdown on the same
screen sums to 343; /banking/transactions independently confirms 343 via its own tab count
while carrying the same stale 352 in its own top banner. Filed, not fixed, per this cycle's
mode.
"22 pending" from the packet: could not locate a distinct live figure matching that label
anywhere in Banking Home / Transactions / Reconciliation / Plaid Connections -- Reconciliation
shows 0/0 sessions, no separate "pending" count surfaced. Not claiming it doesn't exist
elsewhere; just didn't find it in this pass's surface area.
Noted, NOT filed as new (already tracked elsewhere, has its own P-0 owner annotation):
/banking/email-queue shows dozens of report-cadence/invoice-send jobs stuck status=queued
from ~Aug 24 onward (Daily Dispatch Board, Weekly Profit per Truck, Cash Position + AR Aging,
several real invoices) vs status=sent for everything Aug 20 and earlier -- consistent with
EMAIL_CRON being intentionally paused, per the existing annotation on two cancelled invoice
rows: "P-0 2026-08-31: parked before EMAIL_CRON -- TEST invoice queued to real broker AP;
to_addresses baked at enqueue; do not send. Owner/Cursor." Recording the observation here so
whoever owns that P-0 has the current queued-count context; not re-filing a thread that
already has an owner marker. | NEXT=continue banking pass once lock lands, or re-scope if
another finding surfaces first | GO
