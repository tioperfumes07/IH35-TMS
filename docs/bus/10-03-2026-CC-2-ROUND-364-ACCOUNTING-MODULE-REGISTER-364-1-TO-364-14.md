# ROUND 364 — CC-2 (with CURSOR on the sweeps) — THE ACCOUNTING MODULE REGISTER, 364.1 THROUGH 364.14
Lead · 2026-10-03 · owner measured every one of these on the live screen
**ROUND 365 outranks this round. Nothing here ships before 365.1 through 365.7 are green.**

The owner's three open questions are ruled at the bottom, on his instruction to take the recommendation.
Measured from `apps/frontend/src/pages/accounting/subnav-manifest.ts` and
`apps/frontend/src/routes/manifest.tsx`, not from the screenshot.

---

## 364.1 — NOTHING IN ACCOUNTING RESIZES (CC-2)
No auto-adjust to full screen or any other viewport. QBO is fluid to the viewport with a max content width;
our Accounting surfaces are fixed. This is a layout contract across every Accounting screen, not one bug.
**Required value:** every Accounting surface renders without horizontal overflow and without dead gutters at
1280, 1440, 1920 and full screen, and at the narrow width the owner actually uses. Report the count of
surfaces fixed. **Guard:** `verify-accounting-surfaces-are-viewport-fluid.mjs`.

## 364.2 — REMOVE `Load costs` FROM ACCOUNTING (CC-2) — RULED
Measured: `{ label: "Load costs", path: "/accounting/load-costs", section: "expenses" }`. Load profitability
is a Dispatch concept and QBO has no equivalent. **Remove the subnav entry only.** What replaces the tab is
the click-through: from a GL line to its load, which is what the `load_id` stamp (363-CC1-A) exists for. You
reach the load from the money, not from a nav tab.

**Owner confirmed the removal and stated what the surface itself is for, 2026-10-03:** *"load costs renders
the live loads and current costs related to that load."* So the Dispatch surface is not merely left alone — it
has a job and it must do it:

- It renders the **live load set** — the one canonical active load set, never a closed or voided load leaking
  in. `verify-one-canonical-active-load-set` is one of the 31 guards failing on main right now (365.6), and it
  is exactly this surface's correctness.
- Each load shows its **current** cost — every expense, fuel purchase, toll, lumper, driver pay line and bill
  posted against it **as of now**, derived from the GL postings through `load_id`, never from a stored total.
- It is the forward half of the same linkage: from the load you see its money, and from the money you see its
  load. Both directions, one source.

Nothing is deleted. If CC-2 believes any page component should be, post it and get a written ruling first.

## 364.3 — TWO EXPENSE TABS, ONE CONCEPT (CC-2)
Measured, both under `section: "expenses"`: `Expenses List` -> `/accounting/expenses/list` **and**
`Expenses` -> `/accounting/expenses`. Measure what each renders. If they render the same set, one goes. If
they differ, the difference is named and the labels say what the difference is — "Expenses" and "Expenses
List" tell the owner nothing.

## 364.4 — THE RECEIPT CREATOR IS THE EXPENSE CREATOR (CC-2)
Receipts has tests; its creator is its own implementation. In QBO a receipt and an expense are the **same form
with a different document type**. One creator, one validation set, one posting path, one writer. **If a second
implementation exists, that is the defect.** **Guard:**
`verify-receipt-and-expense-share-one-creator.mjs` — static.

## 364.5 — THE CHECKS LIST IS NOT WIRED (CC-2)
Must render **all** checks, with full QBO filters: date range, payee, bank account, amount range, and
**multi-select status**. Every record-naming cell click-through, every header sortable (364.11, 364.13).

## 364.6 — CREATE CHECK IS OUT OF PROPORTION (CC-2)
Owner: "it is out of proportion, looks terrible, not like QuickBooks." A correctly sized **modal** with QBO's
check-form proportions — payee, bank account, date, check number, memo, then the line table. Not a full-page
sheet.

## 364.7 — CREATE CHECK DOES NOT OFFER THE PAYEE'S OPEN BILLS, AND THIS IS AN ACCOUNTING DEFECT (CC-2 surface, CC-1 posting)
The owner selected a payee and got no driver bills to apply the check to. **A check written to a payee with
open bills IS a bill payment.** If Create Check posts a fresh expense while the driver bill stays open, the
cost is counted **twice** — once on the bill, once on the check. That is a double-count, not a layout
complaint, and it is the same wound as the 130 bill payments with zero postings (363-CC1-B).

Build the whole QBO sequence: select payee -> **the payee's open bills are offered with their amounts and
ages** -> apply the check to one or many -> any remainder goes to expense lines by account or item -> print
later or print now. Applying to a bill routes through the **bill-payment poster** (CC-1's lane, 363-CC1-B),
never through the expense poster.

**Guard:** `verify-check-applied-to-a-bill-posts-as-a-bill-payment.mjs` — live, on a real USMCA driver bill.

## 364.8 — PRINT CHECKS LISTS ONLY CREATED-AND-NOT-PRINTED (CC-2) — RULED
A print state on the check: to-print, printed, printed-at. The Print checks tab renders **only** to-print.

**Ruled (owner, 2026-10-03): the check number is assigned at PRINT time and the field is EDITABLE**, exactly
as QuickBooks does it. A number assigned at creation and never printed burns a check number and breaks the
sequence an auditor reads straight down. A check printed immediately takes its number at that moment.

Owner's words: *"the check numbers should follow sequence but as in QuickBooks we are able to input our own
number if we change numbers etc."* So:

- The next number is **proposed** from the sequence, never forced.
- The owner can **type over it** — he changes check stock, starts a new box, voids a run, and the real number
  on the paper is whatever is on the paper. The system follows the paper, not the other way round.
- When he types a number, **the sequence continues from the number he typed.** That is QBO behavior and it is
  the only behavior that stays true to the physical checkbook.
- A **duplicate number warns** and names the existing check, QBO-style. It is a warning, not a refusal — the
  owner may legitimately reuse a number after a void, and he decides.
- A **gap** in the sequence is not an error either. It is **recorded and visible**, with the reason where one
  exists (voided, destroyed, printer jam). An auditor reading the sequence straight down must be able to see
  the gap and why.

**Guard:** `verify-check-number-proposed-not-forced-and-gaps-are-recorded.mjs` — live: the proposal follows
the last number used, a typed number is honored and continues the sequence, a duplicate warns, and every gap
carries a record.

## 364.9 — EVERY BILLS SUB-TAB RENDERS ONLY ITS OWN TYPE (CC-2)

| Tab | Renders | Required value |
|---|---|---|
| Bill | **all** bills | full QBO filters, multi-filter, multi-select |
| Maintenance bill | maintenance only | 0 non-maintenance rows |
| Repair bill | repairs only | 0 non-repair rows |
| Fuel bill | fuel only | 0 non-fuel rows |
| Driver bill | driver only | 0 non-driver rows |
| Vendor bill | see 364.10 | measured first |
| Multiple bills | only bills created by the multi-creator — insurance and those types | 0 single-created rows |
| Recurring bills | stays — QBO has recurring transactions | its own filters |

Each tab correctly designed with its own correct filters. **Guard:**
`verify-each-bill-subtab-renders-only-its-type.mjs` — live row counts per tab.

## 364.10 — IS `Vendor bill` THE SAME AS `Bill`? MEASURE BEFORE REMOVING (CC-2)
The owner thinks it is the same and I think he is right, but **no tab is removed on a hunch.** Measure the set
each renders on live USMCA data. Same set -> remove `Vendor bill`. Different -> report the difference and the
label changes to say what it is.

## 364.11 — STATUS IS A MULTI-SELECTOR, EVERYWHERE (CC-2 here, CURSOR app-wide)
Owner: "right now it looks dirty." Status is multi-select on every list in Accounting, using the **same
component** as the account multi-select from LAW 363.8. One component, not two. CURSOR owns the sweep outside
Accounting (363-CUR-C).

## 364.12 — REMOVE THE `Vendors` AND `Customers` TABS FROM ACCOUNTING (CC-2) — SAFE, MEASURED
Measured in `apps/frontend/src/routes/manifest.tsx`:

```
/accounting/vendors    -> <Navigate to="/vendors" replace />
/accounting/customers  -> <Navigate to="/customers" replace />
```

They render **nothing**. They bounce the owner out of Accounting into the modules. Remove the two subnav
entries and the two redirect routes.

**This deletes no surface and does not touch the 2026-10-02 ruling** that the two party views are deliberate
design — that ruling governs PartyBoard versus master-detail **inside** the Customers and Vendors modules,
which stay exactly as they are. Do not touch `PartyListSwitch`, `PartyBoard`, `CustomersListView` or
`VendorsListView`. Keep every deep link from a bill, invoice or payment to the vendor or customer record.

## 364.13 — `Maintenance & shop` STAYS AND IS RENAMED (CC-2) — RULED
The owner asked what it renders. Measured in `MaintenanceShopHubPage.tsx`: one row per **work order**, with
its unit, type, date, amount, status and **the bill or expense that paid for it**, each click-through. It is
the only surface where a work order and the money that settled it sit side by side — the maintenance
subledger-to-GL bridge, and it is exactly the linkage law working.

**Ruled: keep it, rename it `Work orders & bills`.** "Maintenance & shop" reads like a duplicate of the
Maintenance module, which is why it looked like clutter. Keep `maintenance.work_orders` as the hub and
`maintenance.*` as the canonical schema — never `maint.*`.

## 364.14 — THE STANDING RULE ON TABS (ALL SEATS)
**A tab in Accounting must render accounting data.** If it redirects to another module, it is a link on a
record, not a tab. 364.2, 364.3, 364.12 and possibly 364.10 are four or five tabs removed under this rule.
Apply it to every module before adding a tab, not after the owner finds it.

---

**Deadline:** after ROUND 365 is green. 364.7 and 364.8 by **2026-10-05 18:00Z** because 364.7 is a
double-count. 364.1, 364.5, 364.6, 364.9, 364.11 by **2026-10-06 18:00Z**. 364.2, 364.3, 364.10, 364.12,
364.13 by **2026-10-07 06:00Z**.

**Every removal is a subnav and route removal only. No page component is deleted in this round. If you believe
one should be, post it and get a written ruling first** — I withdrew exactly that kind of order on 2026-10-02
and nearly had a seat delete working behaviour.

**Linkage declaration required in every PR.** **NOBODY SEEDS ANY DATA ANYWHERE.**

---

## 364.15 — THE WORK ORDER TRAVELS WITH ITS BILL AND ITS EXPENSE (CC-2 surface · CC-3 linkage) — OWNER, 2026-10-03

Owner: *"in the expense or bills tabs showing the bills or expenses for those as well and will show the order
numbers etc. and a copy of the work order the system created."*

Keeping `Work orders & bills` (364.13) is not enough. The linkage has to be visible **from the money side
too**, which is the linkage law working in both directions.

**On the bill and expense rows, in these tabs** — `Bill`, `Maintenance bill`, `Repair bill`, `Expenses`,
`Expenses List`, `Receipts` and the Reclassify list:

- A **work order column** showing the work order **number**, click-through to the work order. Where a row has
  no work order the cell is empty and means "no work order", never blank-because-we-did-not-look.
- The **unit** and the **trailer** the work order was written against, each click-through. A maintenance bill
  that cannot name its unit is not linked.
- The work order's **status** at a glance, so a bill paid against an open work order is visible as exactly
  that.

**On the bill and expense detail**:

- **A copy of the work order the system created**, openable and printable from the document itself — the same
  PDF the shop and the vendor see, stored in `docs.files` and linked, not regenerated differently each time it
  is opened. A regenerated copy that drifts from what the vendor was handed is worthless as evidence.
- Both directions resolve: work order -> its bill or expense (364.13), and bill or expense -> its work order
  and its stored copy (this item). **Either direction missing is a linkage failure, not a UI gap.**

**Canonical, do not drift:** `maintenance.work_orders` is the hub, `maintenance.*` is the schema — never
`maint.*`. The bill links to `mdata.vendors`, never `mdata.qbo_vendors`. `docs.files` holds the stored copy.

**Required value:** on live USMCA data, the count of maintenance and repair bills and expenses, the count
carrying a work order number, and the count whose stored work-order copy opens. The gap between the first and
the second is named row by row — some bills legitimately have no work order, and those are stated, not
guessed at.

**Guard:** `verify-maintenance-money-and-work-order-link-both-ways.mjs` — live, both directions, plus the
stored copy resolves from `docs.files`.

**Deadline:** with 364.9, **2026-10-06 18:00Z**. CC-3 owns the linkage and the refusal; CC-2 owns the columns,
the detail panel and the print path.
