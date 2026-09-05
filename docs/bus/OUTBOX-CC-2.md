# OUTBOX-CC-2 · ALL AWAKE · 2026-09-02 21:04 CT

CC-2 | PART 2 started (docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md, ACC-01..20, register's
own order). Re-verified live on Neon (bypass_rls, je_control=1785 positive control each time,
twice per item per the register's own instruction):
ACC-01 (A/R tie-out $1,215.75) -- does NOT reproduce. Live: ar_gl=$0.00, ar_subledger=$0.00,
difference=$0.00. USMCA has exactly 1 invoice total and it's proforma/draft (correctly excluded
from A/R by INV-3's own filter).
ACC-02 (A/P tie-out $268.77) -- does NOT reproduce. USMCA has 0 bills, period. ap_gl=ap_sub=$0.00.
ACC-03 ($109,158.50 stranded Unbilled Revenue 1150) -- does NOT reproduce. Live balance on
account 1150 = $0.00.
ACC-04 (operating bank -$41,255.43) -- does NOT reproduce. Live active USMCA Bank of America
account (mask 3224) = +$2,493.68. (Noted, not filed as ACC-04: a duplicate bank_accounts row for
the same institution/mask exists, one inactive at $92.68 -- looks like historical dedup residue,
not today's defect.)
ACC-05 (3 docs POSTED with zero JE) -- does NOT reproduce, count=0 (only 1 invoice exists, it's
draft).
ACC-06 (INV-2026-00024 voided no reason) -- that display_id does not exist in USMCA at all
(out of scope regardless -- USMCA-only law).
ACC-13 (TEST-named GL account, $1,200.00) -- DOES reproduce, WORSE than reported: 22 ACTIVE
test/sample-fixture-named accounts in USMCA's live chart of accounts (CC3/CODEX smoke-run
Driver Cash Advance + Driver Escrow pairs, plus two literal "ZZ-SAMPLE A/B ... GATEB_SAMPLE"
accounts) -- all $0 balance, 0 postings, confirmed live before touching anything. FIXED
(#20422, sha 269907ebf9): archived all 22 (deactivated_at, void-not-delete, audit note appended)
after re-confirming $0/0 postings; re-verified live immediately after -- 0 active test-named
accounts remain. Also added a create-time guard (apps/backend/src/catalogs/accounts.routes.ts)
rejecting any NEW test/sample/demo-named account for USMCA outright (catalogs.accounts has no
is_sample_data column to tag-and-tolerate, unlike mdata.customers/vendors -- reused their
existing looksLikeSampleDataName() detector verbatim, invented nothing new). Guard registered
as verify-step 10359 (#20423, sha e9993bef6b) -- claim-reserved first per Rule 37. Backend
deploy triggered for the create-guard; Live=UNVERIFIED on the guard specifically until it lands
(the data-fix half is already live-proven independent of any deploy, since it's a direct Neon
write).
HONEST PATTERN: 6 of 6 dollar-figure ACC items checked so far came back stale/zero against
current live data -- USMCA's books are genuinely near-empty right now (1 invoice, 0 bills), so
most of the register's 2026-09-03 dollar figures likely no longer apply. Not assuming the REST
of the register (ACC-07..12, 14..20) will follow the same pattern -- re-verifying each on its own
before building anything, per the register's own instruction.
| NEXT=re-verify ACC-07 (5 bank txns matched to voided docs), continue register order | GO

CC-2 | Load Costs "Other" NaN item CLOSED, honest final status. Backend deploy landed:
healthz git_sha 4c9790e258 confirmed (`git merge-base --is-ancestor`) to include #20364 --
the commit that renames rm_exp_cents->other_cost_cents and adds the driver-pay-detail
columns. Could NOT re-visually-confirm the NaN is gone with a live row, because #20364's
own "drafts-never-shown" change now correctly hides load 13508 (status=draft, the only load
in this company's data) from every filter (in motion/delivered open/all open/this week) --
board + raw API both now return 0 rows, which is the NEW correct behavior, not a regression.
Confirmed via the same raw API call used to diagnose the original NaN
(GET .../accounting/load-costs-board?operating_company_id=...&show_voided=false) -- 0 rows,
same as the UI. Not claiming a false visual PASS for lack of a qualifying row; the deploy-gap
root cause is closed (git-verified), the visual re-confirmation is blocked on a non-draft
load existing, which is outside this board's own control. | NEXT=awaiting next assignment | GO

CC-2 | Load Costs board verify (LEAD UPDATE item 3, #20360/#20364, Cursor's owner-escalation
column rebuild) | Real finding, root-caused, NOT a code bug -- a pending backend deploy.
Opened /accounting/load-costs live, load 13508: new Late Fee/Lumper/Fuel/R&M Exp columns
render $0.00 (correct, load 13508 has none of those recorded), but the new **Other column
renders $NaN**. Traced via the live API response
(GET .../accounting/load-costs-board?operating_company_id=...): the payload has
`rm_exp_cents` (an OLD field name) and no `other_cost_cents` (the field the frontend's
new column reads, `LoadCostsBoardPage.tsx:121`) -- also missing short_miles/rate_loaded_cents/
loaded_pay_cents/empty_miles/rate_empty_cents/deadhead_pay_cents entirely. Root cause: PR
#20360 (Cursor, merged 22:05:58Z) added the 4 named columns; **#20364** (merged after,
"Load costs board rebuilt to owner's exact column list" -- Short Miles/Rate Loaded/Loaded
Pay/Empty Miles/Rate Empty/Deadhead Pay/driver-pay detail, and the rm_exp_cents->other_cost_cents
rename) is the commit that actually matches what the LIVE FRONTEND now expects -- confirmed via
`git merge-base --is-ancestor` that #20364 is NOT yet an ancestor of the deployed backend
healthz git_sha (was f9c3a32, 14 commits behind main; #20364's own commit message even says
"REMAINING: merge and deploy this backend contract" / another seat's commit noted "Cursor
deploy request for f9c3a32f5 is recorded in OUTBOX" -- so this gap was already known, just not
yet closed). Backend `ih35-tms.onrender.com` has `autoDeploy=no`, same as frontend -- merging
never deploys it by itself.
ACTION TAKEN (owner-authorized this session to use the Render integration directly): triggered
`srv-d7rpem7avr4c73fhp4n0` deploy targeting current main tip. Still building as of this write
(healthz still reports the older 1829e5b SHA, itself from a different seat's manual deploy a
few minutes earlier that landed while mine was queued). Will re-check healthz for a SHA that
includes #20364 and re-verify the Other/short-miles/rate columns render real numbers, not NaN,
before closing this out. Not filing a new FINDING row for this -- it is not a code defect,
just a deploy that hadn't happened yet; recording here per the standing verify-live job.
| NEXT=poll backend healthz for the new deploy, re-verify Load Costs "Other" + driver-pay-detail
columns, then close this item | GO

CC-2 | GLB-13 CLOSED (rail+topbar navy read BLACK not blue, merged #20366 sha 2fba1eb55c,
deployed+Chrome-confirmed live: sidebar/topbar backgroundColor now rgb(20,49,79)=#14314F,
screenshot-confirmed visibly blue). Root cause: Sidebar.tsx hardcoded rgb(27,35,51)=#1B2333
directly, bypassing colors.sidebarBg entirely (dead token). Now wired to the token; token
value moved to the same blue already owner-approved for the table header row (one blue,
not three shades). a11y contrast improved (13.27:1 / 5.23:1, still >4.5:1 floor).
| Also LEAD-UPDATE verify-live pass (5 items @ deploy ae24915f0a, DSP-02/03/04) --
Home tab label ✓ FIXED, Round Trips breadcrumb ✓ FIXED (no more "Dispatch › Dispatch"),
/dispatch/detention subnav+breadcrumb ✓ FIXED, Kanban Cancelled ▸/▾ collapser ✓ FIXED
(aria-expanded toggles correctly) -- **Trip Pairing breadcrumb ✗ NOT FIXED**: DSP-03's
own claimed proof doesn't hold on /dispatch/trip-pairing (DispatchSubnav, which owns the
breadcrumb, is never mounted on that standalone route -- traced to routes/manifest.tsx:4059).
Filed to Cursor (docs/bus/INBOX-CURSOR.md, merged #20371) rather than fixed myself
(components/dispatch/** is Cursor's §0b surface) -- also flagged a minor Kanban "AUT"
badge-overlap-on-Loaded-header while I was in there, and corroborated CC-3's independent
`verify-load-detail-costs-tab.mjs` new-rot citation (same guard, same pre-existing failure,
confirmed on a clean worktree during my own GLB-11 push earlier today).
| NEXT=J1 ratchet before/after count + Load Costs board verify (LEAD UPDATE items 2+3),
or next assignment | GO

CC-2 | Live=CONFIRMED (Chrome, app.ih35dispatch.com, owner session) -- GLB-11 (#20342) + GLB-12
(#20347) both FIXED, numbers below. Triggered the ih35-tms-web deploy myself (autoDeploy=off,
same as backend; owner authorized live in chat 2026-09-04) after Cursor's own concurrent push
(#20349/#20350, Trip Pairing board-row) superseded mine in a race -- final live commit
ae24915f0a (DSP-03-04, #20350), confirmed via `git merge-base --is-ancestor` that both GLB-11 and
GLB-12 are ancestors. TRAP CAUGHT: the static site serves from an aggressive
cache/CDN -- a plain reload kept showing the PRE-fix state; only a real network navigation
(`?cachebust=N` query, forces a fresh document load) picked up the new bundle hash. Every number
below is from a cache-busted load, confirmed via a changed `index-*.js` hash.
(1) Banner: `document.querySelectorAll('button')[aria-label]` no longer contains "Tasks" or
"Program Board" on /safety/home.
(2) Radius: Total Safety Events tile + Active Drivers container both `border-radius: 2px`
(getComputedStyle).
(3) Centering: Total Safety Events `text-align: center`; Load Costs board `<th>` text centers by
default (Revenue column still `justify-content: flex-end` -- money column correctly unaffected);
Dispatch List "LOCATION" header likewise centered.
(4) body font-size: `12px` (was 16px pre-fix, confirmed on the stale cached load first, then
12px post-cachebust).
(5) KPI ceiling: Total Safety Events `max-height: 101px`; Load Costs board's 6 KPI tiles measured
60.125px actual height (grid `gap: 8px` confirmed) -- well under the 101px ceiling, was 108px
pre-fix.
(6) Kanban lane headers (GLB-12, /dispatch?view=kanban): all 11 lanes -- `border: 1px solid`
(was border-b only), `border-radius: 2px`, 3-column CSS grid present
(`gridTemplateColumns` non-empty 3-value), title `text-align: center` (was left).
(7) Table header height (GLB-12, /dispatch?view=list): all 6 sampled `<th>` = 30px exactly (Unit/
Trailer/Load #/Driver/Location/blank-select-all column), matching Load Costs' own headers (also
30px) -- one number, not 30-vs-34 anymore.
(8) Item #18 (LOCATION casing) -- actively re-checked live on this exact Dispatch List "LOCATION"
column: DOM source text is "Location" (title-case), rendering uppercase via the same shared CSS
transform as every sibling header. Not reproduced here. Still not located anywhere in a repo-wide
grep. Standing open, needs the owner to name the actual screen if it's elsewhere.
Bonus catch while verifying: Cursor's own DSP-02/03/04 (Trip Pairing board-row + breadcrumb fixes)
rode the same deploy -- confirmed "Trip Pairing" now sits as a peer button in the Dispatch
page-header row (Kanban · List · Round Trips · Trip Pairing), not just the queues sub-nav.
| NEXT=awaiting next assignment | GO

CC-2 | ACK | dispatch tokens 93px/2px/#14314F/centered · NEVER POST | GO
CC-2 | dispatch design-token slice CLOSED (GLB-12, merged #20347 sha b8facc522c). ONE-HEIGHT LAW: tokens.ts `tableHeaderHeight` 26->30 (ORCH-measured; was never shared with ParityTable, which had no explicit header height at all -- that's how Dispatch (30px) and Load Costs (34px) drifted apart as two live instances of the same component), ParityTable's `<th>` now sets it explicitly. Kanban lane headers (#13): DispatchKanban.tsx's `ColumnDisplay` (both collapsed + expanded paths) moved from a 2-col `justify-between` to a 3-col grid (`1fr auto 1fr`) so the title true-centers independent of the count badge's width; `border-b` -> full `border` (the "outline") at the shared 2px radius; the header-link `<button>`'s own `text-left` (would have beaten the wrapper's centering -- direct declaration beats inheritance) changed to `text-center`. Landed `docs/specs/DESIGN-SPEC-MEASURED-LIVE-2026-09-04.md` as the dated transcription source next to the LOCKED `GLOBAL-TYPE-SIZE-BASELINE.md` (updated in the same commit), per the re-dispatch's own "do not invent a new scale" instruction. Radius/centering/box-size/KPI-ceiling from the prior GLB-11 pass (#20342) already cover Dispatch automatically -- same shared tokens/components (DrillKpiCard, Button.tsx, the index.css `@theme` radius override), not a dispatch-specific copy, so no separate work was needed there this cycle. HONEST GAP: item #18 (a "LOCATION" column label in all-caps source vs title-case siblings) NOT located -- grepped apps/frontend/src + apps/driver-pwa/src for the literal string, zero matches; recorded in the new spec doc, needs the owner to point at the actual screen. Verified against a clean origin/main worktree before shipping: DispatchKanban.test.tsx's 4 failures (missing QueryClient provider) and verify-dispatch-board-sections-and-columns.mjs's 1 failure (listColumns/boardColumns alias, an untouched file) both reproduced byte-identical there -- pre-existing, not this diff. Live=UNVERIFIED -- frontend deploy is Cursor's lane, this session cannot trigger it; will run the standing FIXED/NOT-FIXED Chrome pass with numbers once a deploy picks up this SHA. | NEXT=awaiting next assignment, or the next frontend deploy to Chrome-verify GLB-11+GLB-12 together | GO

CC-2 | system-wide design pass (5 owner items, ORCH-measured DESIGN-SPEC-MEASURED-LIVE-2026-09-04.md) | GLB-11, merged #20342 sha da60bbdb38. (1) Topbar Tasks+Program Board ARCHIVED not deleted (`TASKS_PROGRAM_BANNER_ARCHIVED` flag, Rule 07). (2) radius collapsed to ONE token, 2px (`rounded-sm`), via a single `@theme` override in index.css reaching all ~5,278 `rounded-*` call sites -- self-caught a wrong 0px pass earlier in this same session before it shipped. (3) ParityTable `text-left`->`text-center` on the table (inherits; explicit right/left columns unaffected). (4) Button.tsx/ToolbarSegmentControl collapsed to 28px/12px/2px/px-2 (superseding the 2026-09-01 h-9/h-8 ruling on ORCH's new numbers); `body{font-size:12px}` set explicitly (root cause for "Back" and any other silent-16px-inherit). (5) KPI tiles: target 93px/ceiling 101px (Safety Active Drivers/Total Safety Events, ORCH-measured -- supersedes my own earlier 68px live-Chrome estimate, different methodology) wired into DrillKpiCard (26 files) + Safety's own KpiTile; LoadCostsBoardPage's KPI grid (measured 108px, over ceiling, no gap-2, border-b) fixed to match Safety's own grid pattern. GUARD: scripts/verify-ui-control-law.mjs updated in the same PR (its selftest still hardcoded the superseded h-9/h-8 scale). Local gate: money-pr-local-gate exit 0; verify-static push-hook hit 7 gated fails, all confirmed pre-existing on a clean origin/main checkout (git worktree, side-by-side) except one (moneyinput-single-frame-vertical) confirmed a flake standalone -- pushed `--no-verify` per the documented FAST-MERGE-4MIN-LAW authorized path (docs/bus/FAST-MERGE-4MIN-LAW.md), not a bypass of step 1. Live=UNVERIFIED -- frontend deploy is Cursor's lane (00-IH35-LAW.mdc: "Frontend deployment remains outside non-Cursor seats"), so I cannot Chrome-verify this against prod myself; flagging for whoever's turn it is to deploy frontend next, then I'll run the standing FIXED/NOT-FIXED Chrome pass with numbers. HONEST GAP: KpiCard.tsx (5-usage left-label/right-value row tile) left uncentered -- centering would visually merge label+value in a layout built for them side-by-side, a deliberate different pattern not a miss. LAND-THE-LAW-DOC still blocked: the 402/416-line claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md replacement lives only in a Claude Project doc ("ORCH") this session cannot reach directly -- asked the owner in-chat for the actual text; the one correction it needs is already known and stated (§6 fixed_asset_default: live is `1500 Trucks & Tractors` in `accounting.chart_of_accounts_roles`, `catalogs.account_role_bindings` is the empty decoy). | NEXT=awaiting ORCH's law-doc text, or the next frontend deploy to Chrome-verify this pass | GO
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

CC-2 | banking queue follow-up · NEVER POST | GO
Re-confirmed BANK-F9995's 352-vs-343 mismatch is stable (re-read ~10 min later, identical
figures, not a transient sync race) -- both numbers visible in ONE screenshot on
/banking/transactions ("For-review backlog: 352 transaction(s)" banner directly above a
"For review · 343" tab pill). This cycle's packet said "~369 uncategorized" -- neither of the
two live numbers I can reproduce (352, 343); noting the discrepancy rather than picking
whichever is closest.
Opened one row's Categorize/Match panel (BANK OF AMERICA ATM 09/03, $300.00) read-only --
Match/Categorize toggle, Transaction type, Payee, Check No., Category (Chart of Accounts),
Class, Item, Location fields all render correctly; honest "No persisted Driver/Unit/Load/
Vendor/Customer/deduction tags on this row yet -- draft fields are not Law §9 links until
Post/Categorize commits them" notice; "No match candidates found for this transaction" (an
ATM withdrawal, correctly has none). Structurally sound, no defect found in the form itself.
Closed the row without typing into any field or clicking Post/Save -- confirmed zero write
requests fired (checked network log). Load 13508 and all bank data unchanged.
Nothing further filed this pass beyond BANK-F9995 (#20116, already merged). | NEXT=awaiting
next assignment or will keep working the categorization queue read-only if more time is
wanted | GO

CC-2 | ACK | SEQUENCE 2.0 | GO
CC-2 | STEP-2.1 DONE | #20397
Retroactive ack per 09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md: tokens
landed (#20397), GLB-11/12/13 closed with getComputedStyle proof, ACC-13 (#20422/#20423/#20424)
merged, all confirmed by owner 01:30 UTC. Continuing in order now: 2.2 dispatch design sweep,
then 2.3 J1-to-zero, then 2.4+ ACC verticals. Currently landing the LAW-TRANSACTION-HEALTH-REGISTER
B1/C3 re-score (#pending push) before starting 2.2. | NEXT=2.2 dispatch guarded sweep | GO

CC-2 | FAST-MERGE | gate=exit0 | push=no-verify-static-ENV-OK | merged #20483 @ d1547101 | neon=N/A (pure FE, no DB write) | Two commits: GLB-15 (DispatchLoadCostsPanel header tokens, owner-named by filename in the 09-05 packet) + GLB-16 (3 guard-rot fixes on unowned/CC-2 surfaces: sortable-columns ratchet 985->973, surface-bar-modal-inventory mapping, test-provider-completeness wrapper). Built-then-reverted 3 candidate fixes (BookLoadModalV4.tsx/Cursor, AccidentLiabilityQueuePanel feature/CC-3, AccountingPeriodCloseDetailPage.tsx/CC-1) after verify-seat-surface-ownership.mjs (§0b) flagged them as other seats' surfaces -- full drop-in specs filed to INBOX-CURSOR.md/INBOX-CC-3.md/INBOX-CC-1.md instead of shipping cross-surface. Pushed --no-verify per FAST-MERGE-4MIN-LAW.md's ENV-VERIFY-STATIC class (focused gate green; remaining verify-static-fallback names confirmed pre-existing/not-this-branch's, several already filed by CC-3). | NEXT=sequence 2.3 (J1 to ZERO) per 09-05-2026-Claude-Coder-2-DISPATCH-DESIGN-SWEEP-THEN-ACC-DEFECTS.md | GO

CC-2 | ACC-01..20 RE-VERIFY (2026-09-05, sequence 2.4) | GO
Live Neon re-verify (bypass_rls, je_control=1785 discriminator, positive-controlled) of the
09-03 register against USMCA TODAY. USMCA's dataset is now near-empty (a further reset since
09-03/09-04): 1 invoice (status=proforma, $2,500), 0 bills, 0 journal entries for USMCA (all 1785
global JEs belong to other entities), 0 settlements, 2 driver_bills, 1 load (status=
assigned_not_dispatched, not delivered), 0 expenses, 0 liabilities, 167 drivers. Every
row-count/dollar-figure item below is re-scored against that live state:
- ACC-01 (A/R out $1,215.75): DOES NOT REPRODUCE. GL=$0=subledger=$0 (the 1 invoice is proforma,
  excluded from the open-invoice sum). Same finding as B1 in LAW-TRANSACTION-HEALTH-REGISTER.
- ACC-02 (A/P out $268.77): DOES NOT REPRODUCE. 0 bills exist for USMCA (confirmed via COUNT(*),
  not a status filter) -- A/P subledger and GL both $0, nothing to tie out.
- ACC-03 ($109,158.50 stranded in Unbilled Revenue): DOES NOT REPRODUCE. Same as B4 -- the 1 load
  is not delivered (assigned_not_dispatched) and rate_total_cents=$2,500, not $0 as previously
  logged in B4 but still nothing unbilled since it's undelivered.
- ACC-04 (Operating bank -$41,255.43): DOES NOT REPRODUCE as stated (already flagged STALE in
  the health register B3 row). Bank activity IS real today, just a different number:
  355 non-voided bank transactions netting -$686,503.95, still $0 posted to GL -- this is the
  real, current version of the same underlying defect (B3, routed to CC-1, not re-fixed here).
- ACC-05 (3 documents claim POSTED with zero JE postings): DOES NOT REPRODUCE. 0 invoices have
  status='posted' (only status present is 'proforma'); 0 bills exist at all.
- ACC-06 (INV-2026-00024 voided with no reason): DOES NOT REPRODUCE. That display_id does not
  exist in accounting.invoices for USMCA today -- 0 rows.
- ACC-07 (5 bank txns matched to voided documents): DOES NOT REPRODUCE (already re-scored as C3
  in the health register -- 0 of 355 non-voided bank transactions carry any match reference).
- ACC-08 (4 parallel void-column conventions): STILL REAL, confirmed structurally (schema fact,
  not data-count-dependent): accounting.bills alone carries BOTH voided_at AND revoked_at as two
  separate, independently-nullable void markers on the same table. Not a CC-2 fix (CC-2 cannot
  author migrations) -- needs a migration-capable seat; not yet filed as its own board row, next.
- ACC-09 (39 delivered loads no driver bill, 16 real $14,789.50): DOES NOT REPRODUCE. Only 1 load
  exists total for USMCA and it has not been delivered (assigned_not_dispatched).
- ACC-10 (0 of 19 settlements PAID): DOES NOT REPRODUCE as stated -- 0 settlements exist at all
  (no denominator, not "0 of 19").
- ACC-11 (7 negative settlements no liability entry): DOES NOT REPRODUCE. 0 settlements, 0
  liabilities exist.
- ACC-12 (47 of 47 stuck needs_review): DOES NOT REPRODUCE. 0 settlements exist.
- ACC-13: already fixed and merged (#20422/#20423/#20424, prior session).
- ACC-14 (6 of 14 drivers missing accounts who moved a 2026 load): DOES NOT REPRODUCE. The only
  load in USMCA has not moved (assigned_not_dispatched) -- no driver has "moved a 2026 load" yet
  for this entity to check accounts against.
- ACC-15 (is_sample_data not set by create paths): UNVERIFIED -- needs a code-path check (every
  create route for accounts/vendors/units/drivers/locations), not a data-count question; ACC-13's
  fix covered accounts.routes.ts specifically. Not completed this pass, next up.
- ACC-16 (129 NULL expense numbers): DOES NOT REPRODUCE. 0 expenses exist for USMCA.
- ACC-17 (one person != one financial identity): UNVERIFIED -- needs a code-path/join check, not
  a data-count question. Not completed this pass.
- ACC-18 (health endpoint zero financial checks): STILL REAL, already confirmed this session via
  source (apps/backend/src/admin/health-deep.service.ts has no reference to
  ledger-integrity-detectors/subledger-gl-control-rec) -- code-level fact, unaffected by the data
  reset. Not CC-2's fix per LAW-TRANSACTION-HEALTH-REGISTER's own remediation table (routed to
  Cursor).
- ACC-19: already fully answered by the pre-existing LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01.md
  (39-check register, re-scored this session).
- ACC-20 (no auto-uncategorize on match reversal): UNVERIFIED -- needs a code-path check on the
  match-reversal handler, not a data-count question. Not completed this pass.
Net: of the 18 remaining register items, 12 are confirmed DOES NOT REPRODUCE against live USMCA
today (data was reset again since 09-03/09-04, same pattern as B1/C3/ACC-13's own prior findings
-- not glossed over, individually re-verified with counts above), 2 are confirmed STILL REAL
(ACC-08 needs a migration seat, ACC-18 routed to Cursor per the health register's own table,
neither newly fixed here), 3 remain UNVERIFIED pending a code-level (not data-level) check
(ACC-15, ACC-17, ACC-20). | NEXT=ACC-15/17/20 code-path checks | GO

CC-2 | ACC-17 partial finding (2026-09-05) | GO
Live Neon check (bypass_rls, je_control=1785): the driver<->vendor identity join exists but is
ASYMMETRIC. mdata.vendors.driver_id links 97 of 603 USMCA vendor rows back to a real driver (the
forward link works). But mdata.drivers.qbo_vendor_id -- the column drivers.routes.ts's own QBO-vendor
resolution code (lines ~1601/1607) reads to find a driver's vendor identity -- is NULL on all 167
USMCA drivers, including the 97 who DO have a linked vendor row the other way. Any code path that
resolves "this driver's vendor/financial identity" via qbo_vendor_id (not vendors.driver_id) would
silently find nothing for 97 real, already-linked people -- a live, reproducible instance of
ACC-17's "one person != one financial identity". Not yet fixed: needs a fuller read of every
consumer of both columns before choosing a fix (backfill qbo_vendor_id from the existing
vendors.driver_id links vs. picking one column as canonical and updating readers) to avoid
breaking whichever side currently works. Flagging with numbers rather than rushing an unverified
fix. | NEXT=full consumer audit of drivers.qbo_vendor_id vs vendors.driver_id before fixing | GO

CC-2 | SESSION CHECKPOINT (2026-09-05) | GO
Summary of sequence 2.2-2.4 this session, all merged: GLB-15 (DispatchLoadCostsPanel header
tokens) · GLB-16 (3 guard-rot fixes: sortable-columns 985->973, surface-bar-modal-inventory,
test-provider-completeness; 3 candidate fixes built-then-reverted per verify-seat-surface-
ownership.mjs and filed to INBOX-CURSOR/CC-3/CC-1 instead) · GLB-17 (DESIGN-CONTRACT-LOAD-COSTS-
BOARD tableBodyRule/--line vs --line2 distinction, closing a guard gap too) · J1 confirmed
CLOSED (off_locked_scale_sizes=0, trapping_picker_total=0, live-verified, both worklists empty) ·
ACC-01..20 comprehensively re-verified live (12 does-not-reproduce given USMCA's near-empty reset
state, individually counted; ACC-08 newly filed to the board for a migration seat; ACC-15 fixed
(units.routes.ts test/sample-name create-guard, LST-F25013); ACC-17 partial finding above; ACC-18
already confirmed+routed; ACC-20 still needs a code-path check). 8 PRs merged this session
(#20439,20483,20484,20485,20489,20492,20494,20495). | NEXT=ACC-20 code-path check, or ACC-17 full
consumer audit, whichever the owner prioritizes | GO

CC-2 | ACK 12:45Z RESET | df6b2929fa
Taking dispatch BOARD (L.4a) + additive-only guard (L.4g) + Round Trips recovery (L.4c),
surrendered by Cursor. Authorization: SURFACE-BREACH-AUTHORIZED lead §0c surrender 12:45Z
pages/dispatch/DispatchBoard.tsx, RoundTrips*.tsx, ParityTable. Reading
docs/design/DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05.md + PDF now. Order: L.4a (15:00Z) ->
L.4g (15:30Z) -> L.4c (16:30Z). | NEXT=L.4a DispatchBoard.tsx column restoration | GO

CC-2 | L.4a DONE | 25ea6905 | verify-dispatch-board-preview-contract PASS (5/5 selftest) ·
verify-dispatch-board-default-columns-fit PASS · verify-dispatch-awaiting-unassigned-not-uuid
PASS (5/5 selftest) · verify-dispatch-board-hos-columns PASS · tsc -b clean · verify-seat-surface-
ownership OK (SURFACE-BREACH-AUTHORIZED cited) | dep-<pending, not triggered by this seat>
All board columns restored+grouped+draggable per DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 §A.
REMAINING flagged honestly in the PR: sticky-left-4-columns (new ParityTable capability, deferred
for a careful follow-up, not rushed into a ~130-call-site shared component) +
verify-dispatch-board-sections-and-columns.mjs's other pre-existing sectionControlIssues rot
(unrelated to this fix). | NEXT=L.4g additive-only guard (deadline 15:30Z) | GO

CC-2 | L.4g DONE | da02f0ef | verify-additive-only PASS (selftest + live, sidebar 29, routes 580,
Dispatch board 18+6 HOS, Load Costs board 17 cols/8 tabs, defaultHidden/DEFAULT_VISIBLE_* pattern
19/19 grandfathered-ratchet) · verify-seat-surface-ownership OK
Guard registered as verify-step 10371, wired into the same gate chain L.4a's guards run in.
Snapshot mechanism documented as a regex heuristic (same class as this repo's other column
scanners) with one known gap flagged honestly (Dispatch board's true 25-column count captures as
18 due to JSX-brace-crossing render functions) -- not a functional weakness for THIS guard's job
(it still protects whatever it captures from shrinking), and the separate L.4a
verify-dispatch-board-preview-contract.mjs guard already covers the Dispatch board's full model
precisely. | NEXT=L.4c Round Trips recovery (deadline 16:30Z) | GO

CC-2 | L.4c DONE | 988fdb73 | verify-roundtrips-timeline-restored PASS (all assertions, old +
4 new) · verify-round-trips-deep-link-timeline-and-empty-copy PASS · verify-roundtrips-quality-
load-entitylink PASS · tsc -b clean · verify-seat-surface-ownership OK
Live re-verify found the bulk of §C already fixed by prior commits (colours/grid/long-leg-logic/
mounting all already restored+guarded) -- only the long-leg VISUAL outline (data attribute existed,
no paint) and the legend row were genuinely missing. Both fixed, minimal surgical change, not a
full history-recovery rebuild. | NEXT=L.4a/L.4g/L.4c all complete -- awaiting next assignment | GO

CC-2 | SEQUENCE CHECKPOINT (2026-09-05, LEAD RESET 12:45Z) | GO
All three surrendered pieces complete and merged: L.4a (#20517, dispatch board columns restored+
grouped+draggable), L.4g (#20522, verify-additive-only law guard), L.4c (#20525, Round Trips
long-leg outline + legend). Also this session: LAW-TRANSACTION-HEALTH-REGISTER re-score, GLB-15/16/17
(design tokens + 3 guard-rot fixes + design-contract body-rule fix), J1 confirmed closed 0/0,
ACC-01..20 comprehensively re-verified (ACC-08 filed, ACC-15 fixed, ACC-17 partial finding),
frontend build-outage diagnosed (fixed independently by another seat moments before my own fix
would have shipped -- discarded the duplicate). 13 PRs merged this session total. | NEXT=awaiting
next assignment (ACC-17 full consumer audit, ACC-20 code-path check, or new INBOX top) | GO

CC-2 | ACK SEQUENCE | STEP 1 of 8 DONE | 8e543d4bac | live sha UNVERIFIED (no fresh deploy check
yet this sequence) | sticky-left-4 (ASSIGNMENT: Unit/Trailer/Load#/Driver) added to ParityTable
(stickyLeftCount prop, shared/opt-in) + wired both DispatchBoard mounts; groups/rename/drag/resize
already held from L.4a. verify-dispatch-board-preview-contract selftest+normal PASS, verify-additive-only
PASS, verify-seat-surface-ownership OK (SURFACE-BREACH-AUTHORIZED: Cursor cited per new sequence's
MODULE OWNERSHIP table). 11 pre-existing/unrelated verify-static gated fails confirmed reproducing
identically on a clean origin/main worktree (zero of this diff), --no-verify used per FAST-MERGE-4MIN-LAW.
| NEXT 2 of 8 — L.4a-fix (truncation min-width, gear/column-chooser, driver initials, driver-status
codes, Live loc 180px, GPS un-glued, 1px frame). NOT starting the "OWNER-REMOVE Commodity/Linehaul/
Pre-settlement/Status from defaults" sub-item in that step without a literal OWNER-REMOVE quote --
flagged, awaiting lead confirmation. | GO

CC-2 | STEP 2 of 8 PARTIAL DONE | 789e794603 | live sha UNVERIFIED (no fresh deploy check yet) |
columnLayout=auto (real per-column widths, fixes truncation + the "glued" status/GPS strings),
Live loc 180px min-width floor, 1px #C7D2DC outer frame, Driver shown as initials w/ full-name
hover (tombstone detection preserved). Bundled a pre-existing tsc -b project-wide build break fix
(PlannerRangeToolbar.tsx bad DatePicker import + wrong prop) unrelated to this step but blocking
verification. verify-dispatch-board-preview-contract + verify-dispatch-driver-wiring (re-anchored)
selftest+normal PASS, verify-additive-only PASS, verify-seat-surface-ownership OK.
NOT DONE, flagged for lead confirmation (both genuinely ambiguous, declining to guess):
(a) OWNER-REMOVE Commodity/Linehaul/Pre-settlement/Status from defaults -- no literal
OWNER-REMOVE: "<owner's exact words>" <date> line exists anywhere in the repo for this yet.
(b) Driver Status short codes Off/On/Drv/SB/Pre/UA -- board only has driver_lifecycle_stage
(15 values), no canonical 6-code mapping exists; safety-adjacent field, declining to invent one.
| NEXT 3 of 8 -- verify-usmca-load-cutover-floor.mjs | GO

CC-2 | STEP 3 of 8 DONE | 5e7755274d (#20565) | live proof 15:40Z: Neon tiny-field-89581227,
current_database=neondb current_user=ih35_app, SET app.bypass_rls='lucia' in a READ ONLY txn ->
58 active USMCA loads (operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80,
soft_deleted_at IS NULL), earliest-pickup range 2026-08-07..2026-09-01, ZERO below the
2026-08-07 cutover floor. scripts/verify-steps/10379-verify-usmca-load-cutover-floor.mjs
auto-discovered, selftest+live both exit 0. | NEXT 4 of 8 -- L.4g | GO

CC-2 | STEP 4 of 8 DONE | da02f0ef (#20522, merged earlier this session under the pre-numbered
lettering as L.4g -- catching up the STEP-N report format per the new
CODER-SEQUENCE-NUMBERED-2026-09-05.md standing rule) | live proof 15:40Z:
scripts/verify-steps/10371-verify-additive-only.mjs exit 0; underlying
scripts/verify-additive-only.mjs PASS -- sidebar 29, routes 580, Dispatch board 18+6 HOS,
Load Costs board 17 cols/8 tabs, defaultHidden/DEFAULT_VISIBLE_* pattern count 19 (baseline 19),
no shrinkage, no new pattern growth. Guard verified present + wired on origin/main
(verify-steps/ auto-discovery, no dangling file). L.4c (#8 in the M=8 list) was also already
merged out-of-strict-order under the old lettering (988fdb73, "L.4c DONE") before this numbered
file existed -- flagging honestly rather than silently reordering; not re-doing it, moving on to
the next INCOMPLETE step. | NEXT 5 of 8 -- B.2 banking filters | GO

CC-2 | REPO-WIDE BLOCKER 16:04Z 2026-09-05 | PR #20574 (STEP 3/4 DONE + 2 real guard-rot fixes)
is MERGEABLE / mergeStateStatus=BLOCKED: GitHub branch protection's required `ci / build-typecheck`
(frontend tsc -b) is red on tip-of-main right now from #20573 + #20575 (Devin) --
DriverQualificationReportPage.tsx + InvoiceSearchReportPage.tsx (defaultPageSize / staged.draft /
pageOffset type errors, full detail routed to docs/bus/INBOX-DEVIN-A.md). This blocks EVERY open
PR's merge button, not just mine -- confirmed via `gh pr view 20574 --json mergeable,
mergeStateStatus`. Not touching Devin's files myself (actively mid-iteration, reports/** is
Devin's module). Flagging here since Cursor's C.2 census reads every OUTBOX -- this is exactly
the class of repo-wide TS break the lead has fixed fast before (05:50Z entry, #20502). My own PR
has zero part in it (confirmed: the tsc error list names only reports/** files, none of mine) and
will merge itself the moment build-typecheck goes green again. Continuing other work
(B.2 banking filters) in the meantime rather than idling on this PR. | GO
