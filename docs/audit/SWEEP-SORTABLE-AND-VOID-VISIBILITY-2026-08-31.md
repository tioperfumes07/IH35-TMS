# SWEEP A + B — SORTABLE COLUMNS · VOID VISIBILITY + MONEY COLUMNS
**Date:** 2026-08-31 · **Mode:** READ-ONLY enumeration (no fix) · **Agent:** Cursor  
**Law cited:** `docs/specs/GLOBAL-SORT-RULE.md` · owner order this session  
**Rigor bar:** same class as navy-381 — file + cite; declared ≠ working

---

# SWEEP A — SORTABLE COLUMNS

## A0. Invoice live symptom — ROOT CAUSE (why declared sort does not sort)

**Surface:** `apps/frontend/src/pages/accounting/InvoicesListPage.tsx`  
**Component:** `ParityTable` (`apps/frontend/src/components/parity/ParityTable.tsx`)

| Layer | Evidence | Verdict |
|---|---|---|
| Declares `sortable: true` | 10/10 columns (`InvoicesListPage.tsx:296–377`) | **DECLARED** |
| Passes controlled sort | `useUrlSort()` → `sortKey` / `sortDirection` / `onSortChange` (`:103`, `:515–517`) | **WIRED** |
| `sortMode` | omitted → default **internal** client sort (`ParityTable.tsx:146–151`, `:333–336`) | **CODE PATH CAN REORDER** the in-memory `rows` |
| Fetch | `listInvoices(...)` **without** `limit`/`offset` (`InvoicesListPage.tsx:227–235`) | Backend default **`limit=100`** (`invoices.routes.ts:30–31`) |
| Client pager | `initialPageSize={50}` (`:514`) slices the fetched ≤100 | Does **not** fetch page 2 from API |
| URL `?sort=&dir=` | Written by `useUrlSort` (`hooks/useUrlSort.ts:31–44`) | **Never sent** to `listInvoices` / never becomes SQL `ORDER BY` |
| Header hit target | Sort `onClick` is on a **label-sized** `<button className="inline-flex items-center gap-1">` (`ParityTable.tsx:976–984`) — **not** the full `<th>` | Clicks on header padding = **no-op** |
| Resize obstruction | `enableColumnResize` defaults **true** (`ParityTable.tsx:312`); grip is `absolute right-0 … w-2` with `onClick stopPropagation` (`:988–1006`) | Steals the right edge of every header |
| Contrast | `DataTable` uses the same button pattern but with **`w-full`** (`DataTable.tsx:197`) so the whole cell is the hit target | ParityTable **regressed** hit area vs DataTable |

**Root cause (one sentence):** Invoices are declared+URL-wired for internal client sort, but (1) ParityTable only listens on a narrow label button (plus resize grip eats the edge), so typical header clicks do nothing, and (2) even a successful label click only reorders the **first API page of 100**, not the full invoice population — `?sort=` never reaches the server.

**Invoice score:**
- **Declared sortable:** 10 of 10  
- **ACTUALLY SORTING (owner-law = click header cell, full dataset):** **0 of 10**  
- **ACTUALLY SORTING (narrow: click label text only, within fetched ≤100):** 10 of 10 code-capable

---

## A1. Primitive census (mechanical, `apps/frontend/src` TSX mounts, tests excluded)

| Primitive | Files with JSX mount | Notes |
|---|---|---|
| `ParityTable` | **185** | User “351” ≈ broader `rg ParityTable` incl. tests/imports; mount count = 185 |
| `DataTable` | **23** | |
| Both in one file | 1 | |

Mechanical `sortable: true` declarations across those mounts: **~1162** (file-level sum; a file with two tables double-counts).  
Files with `onSortChange=`: **24** · `useUrlSort(`: **22** · `sortMode="external"`: **1** file in crude scan (`BankingTransactionsDesignView`; explore also found Detention/Late/AtRisk boards).  
Files with **zero** `sortable: true`: **19** Parity mounts (headers non-sortable by declaration).

---

## A2. Hit-target class (systemwide — this is why “capability exists” still fails live)

| Component | Header click region | Resize grip |
|---|---|---|
| **ParityTable** (app standard) | Label-only `inline-flex` button — **FAIL owner law** | Default ON — obstructs right edge |
| **DataTable** | `inline-flex … **w-full**` — full cell | No resize grip |

**ACTUALLY SORTING under owner law (full header cell):** every ParityTable list inherits the invoice defect unless a page sets `enableColumnResize={false}` **and** the button is widened (no such page found in this pass).

---

## A3. Controlled vs internal vs external

| Mode | Meaning | When ACTUALLY sorts full data |
|---|---|---|
| **Internal** (default) | ParityTable reorders `rows` in memory | Only the array the page passed in |
| **Controlled + internal** (`onSortChange` present, no `sortMode=external`) | URL/state holds key; table still sorts in memory | Same — parent must pass full population |
| **External** (`sortMode="external"` + `onSortChange`) | Table does **not** reorder; parent/API must | Only if parent applies ORDER BY / re-fetch |

**Silent correctness class:** server `offset`/`limit` (or API default limit) + **internal** sort = sorts **current page only**. Named in explore pass: ManualJEListPage, TransactionRegisterPage, DisputeQueuePage, Banking register (external — OK if server sort wired), TransfersListPage, LegalMattersListPage, WorkOrdersConsoleListPage, ReserveDashboard, DriversTable (parent pageSize=25), safety lists with hidePager, FleetCatalogListPage, etc.

**Invoices** sit in a hybrid: **no FE offset**, but **API default limit=100** → same class whenever `has_more` is true.

---

## A4. Priority list enumeration (primary surfaces — cite + counts)

Legend: **CTRL** = `onSortChange` present · **MODE** = internal/external · **SRV** = server/API page (offset/limit or default cap with has_more) · **DECLARED** = sortable:true / total data cols · **ACTUAL\*** = owner-law full-header + full-population (ParityTable → 0 unless noted)

| File | Comp | DECLARED | CTRL | MODE | SRV page? | ACTUAL\* |
|---|---|---|---|---|---|---|
| `pages/accounting/InvoicesListPage.tsx` | ParityTable | **10/10** | Y (useUrlSort) | internal | **Y — API default 100** | **0/10** |
| `pages/accounting/BillsPage.tsx` | ParityTable | 17/18 | Y | internal | fetch cap ~200 | **0/17** |
| `pages/accounting/BillPaymentsListPage.tsx` | ParityTable | 10/11 | Y | internal | cap ~300 | **0/10** |
| `pages/accounting/PaymentsListPage.tsx` | ParityTable | 10/10 | Y | internal | client fetch | **0/10** |
| `pages/accounting/ExpensesListPage.tsx` | ParityTable | 14/15 | Y | internal | limit 200 | **0/14** |
| `pages/accounting/ManualJEListPage.tsx` | ParityTable | 8/9 | Y | internal | **Y offset+limit** | **0/8** (page-slice sort) |
| `pages/accounting/FactoringListPage.tsx` | ParityTable | 8/8 | Y | internal | N | **0/8** |
| `pages/accounting/AccountRegisterPage.tsx` | ParityTable | 12/19 | Y | internal | limit fetch | **0/12** |
| `pages/accounting/TransactionRegisterPage.tsx` | ParityTable | 8/9 | N | internal | **Y** | **0/8** |
| `pages/banking/components/BankingTransactionsDesignView.tsx` | ParityTable | 18/18 | Y | **external** | Y | depends on `bankTxnSortGroup` server/client group — **not label-only fix**; still Parity hit-target |
| `pages/banking/TransfersListPage.tsx` | ParityTable | 3/12 | N | internal | Y | **0/3** declared; 9 undeclared |
| `pages/banking/BankAccountDetail.tsx` | ParityTable | **0/15** | N | — | nested | **0/15** |
| `pages/driver-finance/components/SettlementsTable.tsx` | ParityTable | 9/10 | Y | internal | N | **0/9** |
| `pages/driver-finance/SettlementsPage.tsx` | DataTable | 4/4 (Open bills sub) | N | internal | — | **4/4 code** (w-full); population TBD |
| `pages/driver-finance/CashAdvanceRequestsPage.tsx` | ParityTable | 3/6 | N | internal | N | **0/3** |
| `components/dispatch/DispatchList.tsx` / board | custom / TableHeaderCell | per DISPATCH_SORTABLE_COLS | useUrlSort | board-owned | board fetch | **separate grammar** — not ParityTable |
| `pages/vendors/VendorsListView.tsx` | ParityTable | 11/14 | Y | internal | N | **0/11** |
| `pages/customers/CustomersListView.tsx` | ParityTable | 11/11 | Y | internal | N | **0/11** |
| `pages/drivers/DriversTable.tsx` | ParityTable | 4/4 | N | internal | **parent Y page 25** | **0/4** page-slice |
| `components/FleetTable.tsx` | TableHeaderCell | custom | useUrlSort | — | check fetch | not Parity |
| `pages/insurance/PoliciesList.tsx` | DataTable | 7/7 | N | internal | N | **7/7** hit-target OK (DataTable) |
| `pages/insurance/ClaimsTab.tsx` | ParityTable | 9/14 | N | internal | N | **0/9** |
| `pages/legal/matters/LegalMattersListPage.tsx` | ParityTable | 5/5 | N | internal | **Y** | **0/5** page-slice |
| `pages/maintenance/components/WorkOrdersTable.tsx` | ParityTable | 6/10 | N | internal | N | **0/6** |
| `pages/work-orders/WorkOrdersConsoleListPage.tsx` | ParityTable | **0/8** | N | — | Y | **0/8** |
| `pages/factoring/FactoringHome.tsx` | ParityTable | 17/17 | N | internal | N | **0/17** |
| `pages/factoring/ReserveDashboard.tsx` | ParityTable | 11/11 | N | internal | Y | **0/11** page-slice |
| `pages/safety/*` (CompanyViolations, Idvr, DOT, IntegrityAlerts) | ParityTable | partial | N | internal | Y hidePager | **0 / declared** page-slice |
| `pages/lists/fleet/FleetCatalogListPage.tsx` | DataTable | 5/5 | N | internal | Y | hit OK; **page-slice** |
| `pages/reports/APAgingPage.tsx` | ParityTable | 7/7 | Y | internal | N | **0/7** |
| `pages/reports/ARAgingPage.tsx` | ParityTable | 7/7 | N | internal | N | **0/7** |

**Priority rollup (explore table, 60 primary lists):**  
- **Declared:** **412 of 567** columns (`sortable: true`) ≈ **73%**  
- **ACTUALLY SORTING (owner-law):** **≈ 0 of 412** on ParityTable surfaces; **DataTable subsets** (PoliciesList, Settlements Open-bills, FleetCatalog, UnitsWithoutLoad) are the only hit-target-correct islands — still subject to page-slice where server-paged.

**Broader mount rollup:** ~1162 `sortable:true` decls across 207 mount files; ACTUAL owner-law ≈ **DataTable-only fraction** (23 files) until ParityTable header hit-target is fixed.

---

## A5. Distinctions the owner asked for

| Metric | Result |
|---|---|
| **X of Y sortable (declared)** | Priority lists **412 / 567**; invoices **10 / 10** |
| **X of Y ACTUALLY SORTING** | Invoices under owner law **0 / 10**; ParityTable fleet **~0 / declared**; DataTable islands only |
| Declared ≠ working | **Proven on invoices** — wiring present, live header click fails hit-target + incomplete population |

---

# SWEEP B — VOID VISIBILITY + MONEY COLUMNS

**Global fact:** No shared `VoidBanner` component exists under `apps/frontend`.  
**Owner asks:** detail top banner (`voided_at` + `void_reason`); list void as first-class filterable status (gear); money triad **Total · Open · variance** with **Open = $0 on void**.

## B1. Per document type

### Invoices
| Check | LIST `InvoicesListPage.tsx` | DETAIL `InvoiceDetailPage.tsx` |
|---|---|---|
| VOID banner (at + reason) | n/a | **MISSING** (status text only `:433–435`; void action `:355–371`) |
| Void status filterable | **YES** (`STATUS_OPTIONS` includes `"void"` `:45–55`) | — |
| Gear / status column | Status column `:323`; no dedicated `voided_at` col | — |
| Total | **YES** `:338` | **YES** |
| Open | **YES** + **void→$0** via `invoiceOpenCentsForDisplay` `:66–71`, `:339–346` | Raw `amount_open_cents` — **does NOT** force $0 |
| Variance | **MISSING** | **MISSING** |

### Bills
| Check | LIST `BillsPage.tsx` | DETAIL `BillDetailPage.tsx` |
|---|---|---|
| VOID banner | n/a | **MISSING** (`StatusBadge` voided; no at/reason) |
| Void filter | **YES** (`voided`) | — |
| Total / Open | Original + Balance | amount−paid; **no** void→$0 |
| Variance | **MISSING** | **MISSING** |

### Bill payments
| Check | LIST `BillPaymentsListPage.tsx` | DETAIL `BillPaymentDetailPage.tsx` |
|---|---|---|
| VOID banner | n/a | **MISSING** (uses `revoked_at` → badge “voided”; no reason) |
| Void filter / status col | **MISSING** | — |
| Total / Open / Variance | Amount only · Open **MISSING** · Variance **MISSING** | — |

### Customer payments
| Check | LIST `PaymentsListPage.tsx` | DETAIL `PaymentDetailPage.tsx` |
|---|---|---|
| VOID banner | n/a | **MISSING** (`voided_at` gates badge only; no reason text) |
| Void filter | **YES** (`voided`) | — |
| Money | Amount · Applied · Unapplied (≠ Open) · Variance **MISSING**; Unapplied not forced $0 on void | — |

### Expenses
| Check | LIST `ExpensesListPage.tsx` | DETAIL `ExpenseDetailPage.tsx` |
|---|---|---|
| VOID banner | n/a | **MISSING** (comment: detail payload **lacks** `voided_at` `:209–210`) |
| Void filter | **YES** | — |
| Money | Amount only · Open **MISSING** · Variance **MISSING** | — |

### Settlements (driver)
| Check | LIST `SettlementsTable.tsx` / `SettlementsPage.tsx` | DETAIL `SettlementDetailPage` / `SettlementHeader` |
|---|---|---|
| VOID banner | n/a | **MISSING** (domain = `cancelled`, not void; status string only) |
| Cancelled/void filter | **MISSING** | — |
| Money | Gross / Deductions / Net — not Total/Open/Variance | — |

### Loads
| Check | LIST `DispatchBoard` | DETAIL `LoadDetailDrawer` |
|---|---|---|
| VOID banner | n/a | **MISSING** (cancel lifecycle; reason in modal, not top banner) |
| Cancelled filter | **MISSING** as first-class status filter | — |
| Money triad | **MISSING** | invoice total only |

### Manual journal entries
| Check | LIST `ManualJEListPage.tsx` | DETAIL `JournalEntryDetailPage.tsx` |
|---|---|---|
| VOID banner | n/a | **MISSING** (API has `voided_at`/`void_reason`; UI never renders) |
| Void filter | **YES** (`voided`) | — |
| Money | Debits/Credits · Open **MISSING** · Variance **MISSING** | — |

## B2. Cross-cut matrix

| Doc | Detail banner | List void/cancel filter | Total | Open | Open→$0 void | Variance |
|---|---|---|---|---|---|---|
| Invoices | MISSING | YES | YES | YES | YES list / NO detail | MISSING |
| Bills | MISSING | YES | YES | YES | MISSING UI | MISSING |
| Bill payments | MISSING | MISSING | Amount | MISSING | n/a | MISSING |
| Customer payments | MISSING | YES | Amount | Unapplied≠Open | MISSING | MISSING |
| Expenses | MISSING | YES | Amount | MISSING | n/a | MISSING |
| Settlements | MISSING | MISSING | Gross/Net | MISSING | n/a | MISSING |
| Loads | MISSING | MISSING | partial | MISSING | n/a | MISSING |
| Manual JE | MISSING | YES | DR/CR | MISSING | n/a | MISSING |

**Strongest existing behavior:** invoice **list** Open forced to $0 (`InvoicesListPage.tsx:66–71`).  
**Universal gaps:** detail VOID banners (8/8 MISSING); variance column (8/8 MISSING); bill-payment void list status; settlement/load cancel filters.

---

# Board filing (OPEN — do not fix this turn)

1. `SWEEP-A-PARITYTABLE-HEADER-HIT-TARGET` — ParityTable sort button not `w-full`; resize grip steals edge; invoices prove declared≠working.  
2. `SWEEP-A-INTERNAL-SORT-ON-SERVER-PAGE` — internal sort + API/FE pagination = silent wrong order beyond page (invoices default 100; ManualJE; Drivers; safety; etc.).  
3. `SWEEP-B-VOID-BANNER-MONEY-TRIAD` — systemwide absence of detail void banner + Total/Open/variance with Open=$0 on void (owner will specify fix separately).

---

**LIVE PROOF this pass:** code+route citations above; healthz at time of write `29528ec` (deploy SHA unrelated — no product change).  
**REMAINING:** owner designs fix; coders implement later. This file is the enumeration only.
