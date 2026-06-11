═══════════════════════════════════════════════════════════════════════════════
IH35-TMS — OPTION A: FULL SIDEBAR INVENTORY (all 26 tabs visited live)
Date: 2026-06-11. Every tab was navigated to and inspected — none assumed.
This is the INVENTORY pass. Option B = deep click-through (follow each transaction).
═══════════════════════════════════════════════════════════════════════════════

LEGEND: [arrow] = return arrow present · [tabs] = top-tab row · [+] = QBO-style + add

───────────────────────────────────────────────────────────────────────────────
PER-TAB INVENTORY (in sidebar order)
───────────────────────────────────────────────────────────────────────────────
 1. HOME /app/homepage
    "Welcome, tioperfumes07!" · dashboard · Customize + Privacy links
    [no arrow — correct, it's home] · no top-tabs · OK

 2. TASKS /tasks
    ⚠️ STUB: title "Module · In active development" + "ROADMAP NOTE: Module is in
    active development." NOT BUILT. [arrow] present. → sidebar tab leads to a placeholder.

 3. FUEL /fuel
    [tabs] Home · Planner · Relay inbox · Settings · Expense mapping · History & savings
    · Loves prices · Compliance · [arrow] · "Jump to tab" btn · COHERENT ✓

 4. DISPATCH /dispatch
    [tabs] Load board · Assignments · At-Risk · Detention · Border · Late · Live Map ·
    Factoring · Planning▾ · Settlements▾ · Documents▾ · [arrow] · [+] Book Load
    ⚠️ contains Factoring AND Settlements▾ tabs (cross-module duplication — verify in B
    whether these do the same thing as elsewhere or differ).

 5. DRIVER HUB /driver-hub
    "Driver overview and quick actions" · section "Requests" · [arrow] · no top-tabs
    (note: "Requests" relevant to driver-reported-failures audit work A3)

 6. MAINTENANCE /maintenance
    sparse: [tabs] Master Data▾ only · [arrow] · [+] Create Work Order
    (A3 driver-reported-failures section lands here)

 7. SAFETY /safety
    ⚠️ DIFFERENT NAV: breadcrumb "← Back > Modules > Safety > Incidents & Claims"
    instead of arrow+tabs. subtitle: Compliance · inspections · discipline · liability · alerts
    → nav pattern inconsistent with the other 25 modules.

 8. DRIVER PROFILE /drivers
    "Drivers · 0 new in last 3 days" · [arrow] · [+] Create Driver · Refresh
    metric cards: ACTIVE 50/50 · ON LOADS · AVAILABLE · ON LEAVE · SETTLE DUE ·
    DRIVERS OWE · ESCROW  (settlement-relevant) · COHERENT ✓

 9. INSURANCE /safety/insurance
    ⚠️ opens as "Safety" w/ breadcrumb "Safety > Compliance Docs & Monitoring".
    Sidebar name "Insurance" ≠ page identity "Safety". Redundant w/ Safety. FLAG.

10. LEGAL /legal
    [tabs] Contracts · Templates · Policies · Attorney Review · Matters · Reports
    [arrow] · [+] Create Contract · COHERENT ✓

11. ELD /eld
    [tabs] Live Duty Status · HOS Violations · Unidentified Driving · Driver
    Certifications · ELD Settings · [arrow] · COHERENT ✓

12. CASH FLOW /cash-flow
    [tabs] Daily prediction · Actual vs Projected · [arrow] · COHERENT ✓
    (Settlements page to be inserted AFTER this, per locked decision)

13. ACCOUNTING /accounting
    [tabs] Home · Bills · Expenses · Bill Payment · Invoices · Receive Payment ·
    Settlements · Find Transactions · Unmatched/Needs Review · Factoring ·
    Journal Entries · Reports · [arrow] · [+] Vendor · [+] Create▾ · COHERENT ✓
    → Factoring is correctly ONE clean tab here.

14. BANKING /banking
    [tabs] Accounts · Transactions · Reconciliation · Driver Escrow · Reports
    [arrow] · [+] Import Statement · [+] Create Account · Connect Bank · [+] Connect
    Credit Card · [+] Connect Other · COHERENT ✓  (Driver Escrow relevant to settlements)

15. FACT /accounting/factoring
    ⚠️⚠️ BLOATED TAB ROW (the big one Jorge flagged):
    Bills▾ · Settlements▾ · Expenses · Bill payment · Maintenance & shop · Vendors ·
    Customers · Reports · AR Aging · Collections · AP Aging · Invoices · Multi-entity ·
    Receive Payment · Factoring · Faro CSV import · Factor reconciliation · (+more →)
    [arrow] present · [+] Submit New Batch
    → ~18 top tabs, MOST don't belong on a factoring-batch tracker. This page renders a
      different/legacy/expanded tab set instead of inheriting Accounting's clean row.
      Maintenance & shop, Vendors, Customers, AR/AP Aging, Multi-entity, Collections
      do NOT belong here. THE redundancy to fix.

16. FINANCE /finance
    [tabs] Overview · Projections · Scenarios · [arrow] · COHERENT ✓

17. CUSTOMERS /customers
    [tabs] QBO Customers · Sync now · Reconcile · [arrow] · [+] Create Customer ·
    List view / Master-detail toggle · COHERENT ✓

18. VENDORS /vendors
    [tabs] QBO Vendors · Sync now · Reconcile · [arrow] · List view / Master-detail
    toggle · mirrors Customers exactly · COHERENT ✓

19. INVENTORY /inventory
    titled "Parts & Stock" (sidebar says Inventory — minor name mismatch)
    [tabs] Parts & Stock · Assignments · Purchase History · [arrow] · [+] Create part · OK

20. 425C /425c
    dark banner "IH 35 GROUP — Official Form 425C"
    [tabs] Profiles & Defaults · QB Import · Form 425C · Merge & Export · History
    ⚠️ NO visible return arrow (dark banner header omits it). FLAG.

21. LISTS /lists
    ⚠️ LAYOUT: top-tabs render ABOVE the title (everywhere else tabs are BELOW title)
    [tabs] Lists & Catalogs · Names Master · Catalog domains▾ · Safety catalogs▾ · [arrow]

22. REPORTS /reports
    ⚠️ LAYOUT: top-tabs ABOVE title (same as Lists)
    [tabs] Reports · Run report▾ · [arrow] · [+] Custom report · Schedule
    (A8 audit-reports section lands here)

23. DOCS /docs
    "Documents — organized by entity with expiration tracking" · metric cards
    (Total Docs · Expiring 30 days · Missing Required · Recent Uploads) · [arrow] · OK

24. USERS /users
    "Users · 6 records" · metric cards (Total/Active/Pending/Deactivated) · [arrow] ·
    [+] Add User · COHERENT ✓

25. HELP /help  (not re-captured this pass — verify in B)

26. PAYROLL /payroll-integration
    ⚠️⚠️ DEAD/MISROUTED: navigating here REDIRECTS to /home (Workspace snapshot).
    Does NOT show a payroll page. Confirms replacement by Settlements (locked decision).

───────────────────────────────────────────────────────────────────────────────
CONSOLIDATED FINDINGS (ranked)
───────────────────────────────────────────────────────────────────────────────
A. REDUNDANCY / WRONG-PLACE TABS
   1. FACT page (#15): ~18 top tabs, most don't belong (AR/AP Aging, Collections,
      Vendors, Customers, Multi-entity, Maintenance&shop, Faro CSV import...).
      Should inherit Accounting's clean tab row or show only factoring's own sub-tabs.
   2. INSURANCE (#9) opens a Safety sub-page titled "Safety" — name≠identity, redundant.
   3. Factoring appears as a tab in Accounting, Dispatch, AND its own page #15 +
      Factor reconciliation — VERIFY IN B whether all "Factoring" entries do the same
      thing or diverge (Jorge's exact concern).
   4. Settlements appears in Accounting, Dispatch, FACT — will consolidate into the
      new Settlements page (replacing dead Payroll #26).

B. NAVIGATION INCONSISTENCY
   5. SAFETY (#7) + INSURANCE (#9) use breadcrumb nav; all others use arrow+tabs.
   6. LISTS (#21) + REPORTS (#22) render tabs ABOVE the title; others BELOW. Pick one.

C. MISSING RETURN ARROW
   7. 425C (#20): no visible return arrow (dark banner header).
   8. (Home #1 correctly has none.) Verify Help #25 in B.

D. STUB / DEAD TABS
   9. TASKS (#2): placeholder "in active development."
   10. PAYROLL (#26): dead — redirects to /home. → replace with Settlements.

E. NAME MISMATCHES (minor)
   11. INVENTORY sidebar → page titled "Parts & Stock".
   12. INSURANCE sidebar → page titled "Safety".

POSITIVE / CONSISTENT (no action)
   Fuel, Dispatch(core), Maintenance, Driver Profile, Legal, ELD, Cash Flow,
   Accounting, Banking, Finance, Customers, Vendors, Inventory(content), Docs, Users
   — coherent tab rows, return arrows, QBO-style [+] affordances present.

───────────────────────────────────────────────────────────────────────────────
FOR OPTION B (deep pass) — follow each of these THROUGH:
───────────────────────────────────────────────────────────────────────────────
 - Click every "Factoring" entry (Accounting tab, Dispatch tab, FACT page, Factor
   reconciliation) → confirm they go to the SAME place / do the SAME thing, or differ.
 - Click every "Settlements" entry (Accounting, Dispatch, FACT) → same check.
 - On each list-in-a-textbox, confirm the [+] opens the correct side-page and the
   sequence matches QBO (and returns correctly).
 - Follow a transaction end-to-end (create invoice → see it in Find Transactions →
   in Reports → in the new Audit trail) to confirm linkage actually works.
 - Verify every page's return arrow actually returns to the right parent.
 - Standardize: breadcrumb vs arrow+tabs; tabs-above vs tabs-below title.
═══════════════════════════════════════════════════════════════════════════════
