# OWNER DEFECT REGISTER — 2026-09-30 — D01..D33

Every item below is taken verbatim in intent from the owner's 2026-09-30 message and from CC-3's
"CHECK ORDERS" report in the same message. Nothing here is invented and nothing is summarised away.
Status values: DONE (live proof pasted) · IN PROGRESS · OPEN · BLOCKED-ON-OWNER.

Numbering is permanent. A later round may only change a row's STATUS or add PROOF — never renumber.

---

## A. CARRIED FROM CC-3 (PO/WO — DSP-285.3.6)

| # | Defect | Seat | Status |
|---|---|---|---|
| D01 | 3 legacy loads carry neither customer PO nor WO number: **13572, 13578, 13582** (all USMCA, invoiced, `is_sample_data=false`). The numbers exist only on their rate-confirmation documents. CC-3 correctly refused to invent them. | Owner + CC-3 | **BLOCKED-ON-OWNER** — owner supplies the 3 rate confirmations, then CC-3 backfills. |
| D01b | `E2E-2E-95603e75` — cancelled, non-sample, E2E-prefixed. RULED: not chased (cancelled). | Lead | RULED |

Context, not a defect: the PO/WO-required constraint itself is live — PR #23336, SHA `c7a7992a54`.
`bookLoad()` now rejects a new load carrying neither field.

---

## B. CASH FLOW

| # | Defect | Status |
|---|---|---|
| D02 | No visual distinction between rows. | OPEN |
| D03 | Background, header and column-header colors are near-white with no contrast. Must use the house locked palette, same as Truck Line / Kanban. | OPEN |
| D04 | **Is the Cash Flow engine fully and completely built, and working?** Must be answered against the architecture/blueprint docs AND live data — not asserted. | OPEN — audit required |
| D05 | Column format must be uniform: **settlement · load · PU date · DEL date · customer · expenses** — the same column format for every Cash Flow section. (Carried from the owner's earlier message, still unbuilt.) | OPEN |

## C. BANKING

| # | Defect | Status |
|---|---|---|
| D06 | Home: the 3 boxes — Bank Accounts, Factoring, Driver Escrow Visualizer — are too large. Redesign. | OPEN |
| D07 | No distinction between rows inside those boxes. | OPEN |
| D08 | The background where the Bank Accounts show (the top boxes area) must be redesigned. | OPEN |

## D. APP-WIDE (applies to every page, not one screen)

| # | Defect | Status |
|---|---|---|
| D09 | Every page in the app must auto-adjust to the page/viewport size. | OPEN |
| D10 | **Minimum-scroll law:** a list — units, dispatch, maintenance orders, drivers, any list — must be visible in ONE screen without scrolling down. Stacked KPI cards that eat the screen are the main violation. | OPEN — becomes a standing rule + guard |

## E. DRIVER PROFILE

| # | Defect | Status |
|---|---|---|
| D11 | KPIs are stacked one under the other AND sit ABOVE the tab strip. Both wrong: they must not be above the tabs, and they must not stack. | OPEN |
| D12 | Driver names render in the wrong case. Must be Proper Case — capital first letter only, never ALL CAPS, never all lowercase. | OPEN |
| D13 | Telephone must auto-format to `(956) 000-0000`. | OPEN |
| D14 | Columns are too wide; add the missing documentation columns. | OPEN |
| D15 | Each document column needs a document-loaded confirmation and a paperclip upload icon — visa, medical card, and every other document. | OPEN |
| D16 | Driver documents must be completely linked to Safety. | OPEN |
| D17 | Samsara username ↔ driver / driver-vendor mapping must live inside each driver profile. | OPEN |
| D18 | Only ~16 drivers show active. Reconcile the real roster against AlwaysTrack drivers on past loads AND drivers who have signed in or driven in Samsara. | OPEN |
| D19 | Tab logic: Deductions, Permits, Disputes, Cash Advances, Pre-settlements, Settlements — decide which belong in the Driver Profile and which belong in Driver Hub. Lead ruling required. | OPEN — ruling |
| D20 | Redesign the Driver Profile on the QuickBooks Customer/Vendor model: open the profile, edit in place, and a Reports selector inside it — statements, activity, transactions, deductions. | OPEN |

## F. CUSTOMERS AND VENDORS

| # | Defect | Status |
|---|---|---|
| D21 | Customers → Activity / Transaction lists: verify the correct data appears in EACH list. | OPEN |
| D22 | **All Faro purchases and all (or nearly all) invoices carry the same date.** That is wrong and it is a money-facing data defect, not a display one. | OPEN — P0 candidate |
| D23 | Vendors and Customers both need the dropdown filter box with a multi-selector for several options at once. | OPEN |

## G. MAINTENANCE

| # | Defect | Status |
|---|---|---|
| D24 | The Create Work Order wizard opens FULL PAGE. It should not — the design was changed. Restore the modal. | OPEN |
| D25 | Every box in that wizard must be a combo dropdown. | OPEN |
| D26 | The wizard must be fully operable with the Tab key. | OPEN |
| D27 | Sections must be visually distinct; the A / B / C / D section headers dark with light letters. | OPEN |
| D28 | Verify each tab's logic against the architecture and blueprint: RM status board, Fleet table, Active WOs, Service Location, Arriving Soon, In-Transit Issues — all of them. | OPEN — audit |
| D29 | Fleet table: the Total Units / Active / In Shop / Out of Service boxes must be redesigned to look professional. | OPEN |
| D30 | The Trucks / Reefers / Flatbeds / Other boxes must be relocated. | OPEN |
| D31 | Filters are in the wrong format and have no multi-selector. | OPEN |
| D32 | Active WOs: KPIs stacked one on top of another eat most of the screen — apply the D10 minimum-scroll law. | OPEN |
| D33 | The same applies to Service Location, Arriving Soon, and every other Maintenance surface. | OPEN |

---

## H. FIXED THIS SESSION (live proof, PR #23338)

| # | Defect | Proof |
|---|---|---|
| F01 | Company Settlements register and its PDF 500'd on every open — `mdata.loads` has no `unit_id` (it is `assigned_unit_id`). | Render 2026-09-30T10:21:01Z, 42703 at `buildCompanySettlementReport`. Guard `verify-loads-unit-column-is-assigned-unit-id.mjs`, selftest 6/6. |
| F02 | `accounting.escrow_ledger` is a phantom relation — and the ORPH03 guard's own selftest PLANTED it, because `process.exit()` inside a `try` skips the restoring `finally`. | Live: `driver_finance.escrow_ledger` and `accounting.escrow_postings` exist; `accounting.escrow_ledger` does not. ORPH03 selftest 1/7 -> 7/7. |
| F03 | Driver settlement PDF 500'd — a bare `catch` around an optional read left the transaction poisoned; the request died 90 lines later at the audit write with 25P02. | Render 2026-09-30T10:37:55Z. Fixed with a SAVEPOINT + logging. New shrink-only guard, baseline **222 sites in 142 files** of the same class. |
| F04 | main CI red since 2026-09-17 — migration `202614530000` seeds an FK to a production-only `identity.users` row, so no fresh database can apply it. | CI 2026-09-30T10:38:53Z. Fixed in the migration runner (non-prod only), not by editing an applied migration. |
| F05 | `bank-recon-closed-session-conflict` red because a THIRD, correct 409 mapping was added. The guard demanded exactly two. | Now asserted per route; selftest 3/3 -> 5/5. |

---

## I. STILL OPEN FROM THE EARLIER REGISTER (not superseded)

P0 — stop-stamp engine dead since 2026-09-28 18:35 (13 of 16 dispatched loads have zero stamps) ·
P0 — $17,057.44 double-booked factoring (FAC-00048/63/64/82) ·
13 invoices with zero GL postings, $52,960 ·
**19 invoices with a real total and ZERO invoice_lines — $82,175, of which 5 are already SENT ($20,800)** ·
13625/13626 factored pre-delivery without approval ·
G2 17 settlement lines with `item_id` NULL ·
G5 driver 51 vs company 48 ·
`catalog_ready` false blocking the On-time click ·
Truck Line bottom section for booked-but-undispatched loads ·
Truck Line status filter must use the real `components/Combobox` ·
17 orphan guards unwired (`verify:guard-wired`) ·
MASS DELETE blocked · AUGUST and SEPTEMBER close blocked.

---

## J. OWNER ADDENDUM — same day, after the Chrome measurement pass

Measured live on `/customers` with a customer selected:
```
master (list) pane      440px = 20.8%
detail pane            1662px = 78.6%
container              2114px  display:flex  gap:12px
detail pane            background rgba(0,0,0,0) · border 0px · box-shadow none
page background        rgb(244,246,248)
row separator          1.25px oklch(0.967 0.003 264.542)   (~#F4F4F5 — white on white)
row background         rgba(0,0,0,0) for every row after the first
view toggle pills      h=22 · padding 0px 8px · widths 67 / 93
status toggle pills    h=24 · padding 4px 8px · widths 52 / 61 / 31
inactive pill          background rgba(0,0,0,0)
page scroll            content 1808px vs viewport 1090px = 718px of overflow
```

| # | Defect | Seat | Status |
|---|---|---|---|
| D34 | The master-detail split is 1:4 — master 440px (20.8%) against detail 1662px (78.6%). The master must be WIDER; the detail side is out of proportion. Make the split a shared token. | Cursor | OPEN |
| D35 | Driver Profiles home must work like the Customers / Vendors master profile — same shell, same default, same split. One shared component, not three copies. | Cursor | OPEN |
| D36 | **No distinction in lines anywhere.** Detail pane `border: 0px`, `box-shadow: none`; row separator near-white on a near-white page. The owner's loudest complaint, now measured. One systemic token fix, then an app-wide sweep. | Cursor | OPEN — TOP IRRITANT |
| D37 | Master-detail must be the DEFAULT in code, not a localStorage preference — a cleared browser must still land on master-detail. | Cursor | OPEN |
| D38 | Segmented controls out of proportion: two different heights, two different paddings, five different pill widths, no group border, and a fully transparent inactive pill. | Cursor | OPEN |
| D39 | `/customers` renders 1808px into a 1090px viewport — 718px of overflow before the list is visible. The minimum-scroll law (D10), measured. | Cursor | OPEN |

Confirmed CORRECT and not a defect: master-detail IS currently the active view on /customers
(`localStorage['ih35:view-mode:customers'] = "master-detail"`). D37 is about the default for a user
who has never chosen, not about today's rendering.

---

## K. COACHING ORDERS ISSUED — 2026-09-30, 15 jobs per seat

`~/Downloads/09-30-2026-Cursor-NEXT-15-JOBS.md`  (C-01..C-18, includes the addendum above)
`~/Downloads/09-30-2026-CC-1-NEXT-15-JOBS.md`    (A-01..A-15 — accounting, close gate, QBO model)
`~/Downloads/09-30-2026-CC-2-NEXT-15-JOBS.md`    (B-01..B-15 — factoring, AR, the $82,175)
`~/Downloads/09-30-2026-CC-3-NEXT-15-JOBS.md`    (T-01..T-15 — stop-stamp engine, roster, PO/WO)
`~/Downloads/09-30-2026-Codex-NEXT-15-JOBS.md`   (X-01..X-15 — the 17 orphan guards, guard audit)

| D40 | **Customers list defaults to ONLY customers WITH transactions; Vendors list defaults to ONLY vendors WITH transactions.** The full list stays reachable behind an explicit filter — never lost, just not the default. | Cursor + CC-1 | OPEN |

C-19 builds the filter. A-16 defines "has transactions" ONCE — which tables, which status
predicates, and the ruling on a customer whose only invoice is voided — so the frontend filter and
the accounting definition are the same definition, not two guesses.

## L. SEQUENCE — the order these get done in

1. **Unblock everyone.** PR #23338 (this branch): the two settlement PDFs, the Company Settlements
   register, the phantom escrow relation, the 13-day CI red, the bank-recon guard. Then Codex's
   X-01/X-02 wires the 11 orphan guards that already pass. Main goes green.
2. **Stop the bleeding.** CC-3 T-01 restarts the stop-stamp engine — every dispatch surface is
   lying until it runs. CC-2 B-01/B-02/B-03 — $17,057.44, $52,960, $82,175.
3. **Close the books.** CC-1 A-01/A-02, then August, then September. MASS DELETE unblocks behind it.
4. **The app the owner actually looks at.** Cursor C-18 first — the line/contrast token fix is
   systemic and every other UI job inherits it. Then C-16/C-17 (proportion and the shared shell),
   then C-05 (minimum-scroll), then the per-surface work.
5. **Make it stay fixed.** Codex X-06..X-10 — the mutation harnesses, the exact-count guards, the
   raised baselines, the selftests that pass while protecting nothing.

Rule for every seat: nothing is reported done without its number and its pasted live proof.

---

## M. FULL SWEEP OF THE OWNER'S MESSAGES THIS SESSION — nothing left unregistered

I re-read every message the owner sent this session and checked each sentence against the register.
These six were spoken but not yet carried their own number. They do now.

| # | Defect | Seat | Status |
|---|---|---|---|
| D41 | **Company settlement PDF** — was 500 on every open (`42703 column "unit_id" does not exist`). | Lead | **DONE** — PR #23338 |
| D42 | **Driver settlement PDF** — was 500 on every open (`25P02 current transaction is aborted`, a bare catch left the transaction poisoned). | Lead | **DONE** — PR #23338 |
| D43 | **Invoice PDF** — asked whether it is ready. Measured live: HTTP 200, renders, one route and one template. | Lead | **VERIFIED READY** |
| D44 | **The pre-invoice must be EXACTLY the invoice.** It already renders through the SAME route and SAME template — but pre-invoice 13627 shows `Balance due $3,200.00` above a line table containing only `Tax · $0.00`. The gap is the missing `invoice_lines`, not the template. | CC-2 | OPEN — blocked on B-03 |
| D45 | **Lines between SECTIONS inside a box** — distinct from row separators (D36). Inside every panel the owner sees no section boundaries at all: "in all boxes such as these the lines between sections or something, it just looks too simple, it bothers me." | Cursor | OPEN |
| D46 | **Deploy cadence.** The owner: "if no one is going to deploy every 5–10 PRs, then I guess I will turn on autodeploy." Deploys must not depend on someone remembering. Either a named owner deploys on a stated cadence, or autoDeploy goes on with the pre-deploy gates carrying the safety. | Lead + Owner | OPEN — DECISION |

Cross-check performed, message by message: PDFs (D41-D44) · Company Settlements failure (D41) ·
Cash Flow contrast/rows/engine/columns (D02-D05) · Banking three boxes (D06-D08) · app auto-adjust
and minimum-scroll (D09-D10) · Driver Profile KPIs, name case, phone, columns, clip upload, Safety
linkage, Samsara mapping, roster, tab logic, QuickBooks model (D11-D20) · Customers activity lists
and the Faro same-date defect (D21-D22) · multi-select filters (D23) · Maintenance wizard, combo
boxes, Tab key, section headers, tab logic, fleet boxes, relocation, filters, stacked KPIs
(D24-D33) · master-detail proportion, Driver Profile shell, line contrast, default view, segmented
controls, overflow (D34-D39) · transactions-only default (D40) · section dividers (D45) · deploy
cadence (D46) · PO/WO legacy loads (D01).

## N. ORPHAN-GUARD SWEEP — done, with the honest remainder

14 guards that PASSED but ran NOWHERE are now wired through claimed verify-steps (10872..10885).
An unwired guard is a fake green; wiring a passing guard costs nothing.

Ten remain, and they are NOT wired by me on purpose:
  - Eight need a live DATABASE_URL and a baseline. A baseline I set against CI's EMPTY database
    would be a fake green of exactly the kind this sweep exists to remove. They belong to the seats
    that own their data: CC-1, CC-2, CC-3 (orders X-02, A-07..A-09, B-09, B-10, T-09).
  - `verify-match-candidates-are-settlement-born-only` genuinely FAILS —
    "fetchLedgerCandidates must NOT select from AR payments". A real defect. Routed to CC-2 (B-08).
  - `verify-geocode-provider-is-reachable` genuinely FAILS. Routed to CC-3 (T-08).

---

## O. QUICKBOOKS PARITY — the owner's screenshots, 2026-09-30

The owner's benchmark is 25+ years of QuickBooks. These are not taste; they are the specific
things our app dropped that QuickBooks does, measured against his own screenshots.

| # | Defect | Seat | Status |
|---|---|---|---|
| D47 | **The QuickBooks CALENDAR / DATE FORMAT was dropped from the entire app.** QBO shows `9/14/26` in a transaction list and `07/31/2026` in a banking list. One date policy, app-wide. | Cursor | OPEN |
| D48 | **The QuickBooks NUMBER FORMAT and styling were dropped from the entire app** — amount alignment, thousands separators, the `$5,500.00` shape, right-aligned money columns. | Cursor | OPEN |
| D49 | Banking → Action column: use the QuickBooks text size for the text and the dates. Ours is smaller and reads as a different product. | Cursor | OPEN |
| D50 | **Row distinction YES — column lines NO.** QuickBooks separates rows and never draws vertical lines between columns. That is the exact combination the owner wants and the exact opposite of what we ship (no row separation at all). | Cursor | OPEN |
| D51 | **Column-header text must be a step LARGER than the row text. For every list in the app.** | Cursor | OPEN |
| D52 | The multi-select / filter control must be LARGER — follow the QuickBooks control sizes (`All dates ⌄`, `All transactions (40) ⌄`). Ours is a 131×33 bare input with `border: 0px`. | Cursor | OPEN |
| D53 | Add the QuickBooks PRINTER and EXPORT icons to list toolbars, in the QuickBooks position (right of the pager, beside the settings gear). | Cursor | OPEN |
| D54 | Banking actions must be the QuickBooks set the owner is used to: **Add · Match · Record transfer**, rendered as QuickBooks renders them. | Cursor | OPEN |

D47..D54 are ONE systemic typography-and-control pass, not eight jobs. They land with C-18's token
work, because every one of them is a token: a date format, a number format, a row rule, a header
scale, a control size, an icon set.

## P. NEW LEAD RULINGS — 2026-09-30

| # | Ruling | Seat |
|---|---|---|
| R-01 | **Production near-miss (CC-1).** A rehearsal script reused a stale connection string and called `voidDocument` against PRODUCTION on a real factoring advance. Nothing persisted only because the header stamp lives one level up in the bypassed route — luck, not a control. RULE: a rehearsal or ops script FETCHES its connection string fresh every run and ASSERTS the target is not production before its FIRST write, failing closed. "I verified afterwards" is not a control. Ship `assertNotProduction()` plus a guard that fails any ops/rehearsal script that writes without it. | CC-1 |
| R-02 | **REINSTATE IS HEADER-ONLY (CC-2's finding).** A reinstate that restores the header but not the GL is the exact mirror of the void bug CC-2 just fixed — one shows voided while the money is live, the other shows live while the money is reversed. Step 1: reinstate must REFUSE, every family, when the original void reversed GL and the reinstate cannot re-post. Step 2: re-post family by family, each with its own void → TB delta → reinstate → TB returns to its exact starting value. Never change shared reinstate logic without a per-family proof. | CC-2 |
| R-03 | **The void engine's factoring hole (CC-2's find).** `executeVoidCancel("factoring_advance")` never reversed the GL — header-only, on a false comment claiming reversal was impossible. A document showing "voided" while its money stays live in the GL is the most dangerous shape this system can have. Fixed and merged (PR #23353). The guard meant to catch it was not scanning that family; that is now in scope. | CC-2 |
| R-04 | **The 204 database-required guard candidates (Codex).** Route by BEHAVIOUR, not by whether the file mentions a database. Three buckets and nothing else: (a) STATIC — reads source only; stays local. (b) ISOLATED — needs a database but writes only synthetic rows; runs against CI's own loopback database, never production. (c) LIVE-DATA — asserts something about real production rows; runs in CI against the read-only production credential, and its baseline is set by the seat that owns that data, never by Codex and never from an empty database. | Codex |
| R-05 | **G5 CLOSED.** Driver closed 51, company closed 51. Root cause named and fixed under AUTH-167 (three settlements closed without the company-settlement side effect firing; each given its own dedicated header per the standing never-merge-periods ruling). Off the close gate. | CC-1 |
