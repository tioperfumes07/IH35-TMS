# 17 — HOME / DASHBOARD + TASKS

**Verdict:** Two Home surfaces coexist — sidebar lands on QBO-style `/app/homepage`, while design MODULE 1 and Owner attention live on `/home`. Tasks module is real (5 tabs + Create Task) but not in arch design as its own module and has weak money/ops EntityLinks.

## Live evidence notes
**REPO-ONLY.**
- Sidebar HOME → `/app/homepage` (`sidebar-config.ts` L91)
- `/home` → `HomeRoute` → OwnerHome (Owner) or role HomePage (`manifest.tsx` L696–700, L550–555)
- `/app/homepage` → `QboStyleHomePage` (L748–754, L557–560)
- Tasks routes L4052–4057; flyout L270–277
- Arch MODULE 1 expects `/home` with 4 tabs Today/This Week/Open Items/Compliance (`IH35_ARCHITECTURAL_DESIGN.md` L57–94)

---

## HOME

### Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar HOME | Nav | `/app/homepage` (QBO-style) | DRIFT vs design `/home` |
| `/app/homepage` Create Actions | Create invoice | `/accounting/invoices` | HAVE link / DRIFT vocab (no +) |
| `/app/homepage` | Record expense | `/accounting/expenses` | HAVE / WILL FAIL shell (expenses = create page) |
| `/app/homepage` | Receive payment | `/accounting/payments` | HAVE |
| `/app/homepage` | Create bill | `/accounting/bills/vendor` | HAVE |
| `/app/homepage` | Add bank deposit | `/banking/transactions` | DRIFT (“Add” forbidden vocab) |
| `/app/homepage` | Journal entry | `/accounting/journal-entries` | HAVE |
| `/app/homepage` Feed CTAs | View reports / Categorize / Reconcile | `/reports`, `/banking`, `/banking/reconcile` | HAVE (static cards) |
| `/app/homepage` Glance cards | Bank / P&L / Expenses / Invoices / Integrations | Aggregate read APIs | HAVE (read-only) |
| `/home` OwnerHome | **+ Book Load** | `BookLoadModalV4` | HAVE |
| `/home` OwnerHome | **+ Create WO** | `CreateWorkOrderModal` | DRIFT vocab (should be + Create Work Order) |
| `/home` OwnerHome | **+ Create Invoice** | `ManualInvoiceModal` | HAVE |
| `/home` OwnerHome | **+ Record Expense** | `RecordExpenseModal` | HAVE |
| `/home` OwnerHome | TodaysAttentionTop5 / AttentionList | Cross-module drills | HAVE |
| `/home` OwnerHome | SectionQuickJump | Maint/Acct/Bank/Fuel/Safety/Drivers/Dispatch/Lists | HAVE |
| `/home` OwnerHome | QBO sync / Vendor mapping cards | Read integrity | HAVE |
| `/home` KPI cards | Cash / Loads / Drivers / WOs / Revenue | `api/home` + reports KPI | HAVE (partial vs design 6) |
| Design tabs | Today / This Week / Open Items / Compliance | Design L67–74 | MISSING as sub-nav |
| Design top action | + Set Quick Filter | Design L64–65 | MISSING |

### Connectivity (Home)
- Quick actions open real create modals (ops + money).
- QBO home create actions are **navigations**, not modals — land on full-page creators (Accounting chrome gap).
- Almost no EntityLink on home pages (crosscut audit).

### HAVE / MISSING / DRIFT / WILL FAIL (Home)
**HAVE:** Owner attention dashboard at `/home`; QBO-style dashboard at `/app/homepage`; live cash/AR/AP aggregates; quick-create modals on Owner home.
**MISSING:** Design 4-tab Home; + Set Quick Filter; several design attention cards as specified.
**DRIFT:** Sidebar door ≠ design route; dual homes without role explanation in rail; “+ Create WO” / “Add bank deposit” vocab.
**WILL FAIL:** Operators trained on design `/home` tabs never see them if they only use sidebar HOME (`/app/homepage`).

---

## TASKS

### Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar TASKS | Nav | `/tasks` | HAVE |
| Flyout | Task Board / Calendar / My Tasks / Team Chat / Admin Report | Matching routes | HAVE |
| Module tabs | Same 5 | `TasksModuleTabs.tsx` | HAVE |
| Shared bar | **+ Create Task** | `CreateTaskModal` (all tabs) | HAVE |
| Task Board header | **+ Create Task** (duplicate) | Board page also mounts modal | HAVE (redundant OK) |
| `/tasks` | `TaskPlannerGrid` | Planner board | HAVE |
| `/tasks/calendar` | Calendar page | | HAVE |
| `/tasks/mine` | My tasks | | HAVE |
| `/tasks/chat` | Team chat + mentions | | HAVE |
| `/tasks/report` | Admin report | | HAVE |
| Daily Tasks | `/daily-tasks` (Dispatch flyout) | Separate DailyTasksPage | DRIFT (second task surface) |
| Customer/Vendor Tasks tabs | Coming soon / present | Customer hub stub; Vendor detail Tasks tab | DRIFT (not linked to Tasks module) |

### Connectivity (Tasks)
- CreateTaskModal can attach company context; customer/vendor/load EntityLinks not verified as first-class on board rows (module largely ops checklist, not money).
- Customer hub Tasks tab explicitly unwired (`Customers.tsx` COMING_STATE_COPY).

### HAVE / MISSING / DRIFT / WILL FAIL (Tasks)
**HAVE:** Full 5-tab Tasks module + Create Task everywhere on module bar.
**MISSING:** Arch design module entry (Tasks not MODULE-numbered); entity-linked tasks from Customers/Vendors.
**DRIFT:** `/daily-tasks` vs `/tasks`; dual Create buttons on board.
**WILL FAIL:** “Tasks” on customer record does not show `/tasks` items — operators assume CRM linkage.

## Professional recommendation
Keep both Home surfaces (never delete). Make sidebar HOME land on the Owner attention home (`/home`) for Owner, or surface both doors in flyout: “Attention Home” + “QBO Home”. Align MODULE 1 design to shipped dual layout in the same commit. Unify Daily Tasks into Tasks module or clearly label Dispatch Daily Tasks as dispatch-ops only. Wire customer/vendor Tasks tabs to the Tasks API with EntityLink — no second orphan task store.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/home/` · `apps/frontend/src/pages/tasks/` · sidebar `sidebar-config.ts:91,124,270-276`

### HOME dual doors (KEEP both)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar HOME | `sidebar-config.ts:91` | `/app/homepage` QBO-style | DRIFT vs design `/home` |
| QBO Create Actions | `QboStyleHomePage.tsx:52-58` | Nav links (no `+` on most; **Add bank deposit** forbidden vocab) | HAVE / DRIFT |
| Owner **+ Book Load** | `QuickActionsBar.tsx:45` | `BookLoadModalV4` | HAVE |
| Owner **+ Create WO** | `QuickActionsBar.tsx:56` | Create WO modal | DRIFT vocab |
| Owner **+ Create Invoice** | `QuickActionsBar.tsx` (invoice btn) | Manual invoice modal | HAVE |
| Owner **+ Record Expense** | `QuickActionsBar.tsx:78` | Record expense modal | HAVE |
| Design 4-tab Home | Not implemented as subnav | Today / This Week / Open Items / Compliance | MISSING |

### TASKS
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar TASKS | `sidebar-config.ts:124` | `/tasks` | HAVE |
| Flyout 5 | `sidebar-config.ts:272-276` | Board / Calendar / Mine / Chat / Report | HAVE |
| Module bar **+ Create Task** | `TasksModuleTabs.tsx:53-56` | `CreateTaskModal` on all tabs | HAVE |
| Board duplicate **+ Create Task** | `TaskBoardPage.tsx:25,34` | Second create affordance | HAVE (redundant OK) |
| Customer hub Tasks | `Customers.tsx` COMING_STATE | Unwired to Tasks API | STUB / WILL FAIL CRM expectation |
| Dispatch `/daily-tasks` | Separate DailyTasksPage | Second task surface | DRIFT — KEEP labeled |

### Top WILL FAIL (new evidence)
1. **Sidebar HOME ≠ design `/home` attention dashboard** — operators miss Owner attention + Book Load.
2. **QBO “Add bank deposit” vocab** — `QboStyleHomePage.tsx:57`.
3. **Customer “Tasks” tab ≠ `/tasks` items** — CRM linkage assumed, missing.

**Never delete** `/home`, `/app/homepage`, Tasks module, or Daily Tasks — dual/triple doors stay; labels + wiring only.
