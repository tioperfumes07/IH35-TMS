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
