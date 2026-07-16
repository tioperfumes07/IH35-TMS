# 03 — SIDEBAR FULL INVENTORY

29 visible modules (+ ELD hidden stub). Arch “19 icons” text STALE.

## Dual doors (never delete — add honesty labels)
| Feature | Doors |
|---------|-------|
| Factoring | FACT / Accounting / Dispatch / Banking |
| Settlements | SETTLEMENTS / Drivers / Dispatch |
| Fuel | FUEL / Banking Fuel Planner |
| Parts | INVENTORY / Maint / Lists |
| Program | PROGRAM / SYSTEM |
| HOS | Compliance / Safety |
| Cash flow | CASH FLOW / Reports |

## Thin flyouts vs in-module
Safety flyout 5/~28 · Accounting flyout 4/57 · Banking flyout thin vs design 12 · Lists flyout 3 vs huge catalog · Reports flyout thin.

## Modules without flyout
Fuel, Compliance, Fleet, Customers, Vendors, Docs, FACT, 425C, Cash Flow, Settlements, Program, System, Insurance (own rail → `/safety/insurance`).

Full child route table: see repo `sidebar-config.ts` + prior audit Part 2.

## Deep button inventory (repo) — 2026-07-15

**Source:** `apps/frontend/src/components/layout/sidebar-config.ts` · enforced by `scripts/verify-sidebar-contract.mjs`

### Canonical ids (`SIDEBAR_ITEM_IDS`)
| # | id | File:line | to | Flyout? |
|---|-----|-----------|-----|---------|
| 1 | home | `:33,:91` | `/app/homepage` | no |
| 2 | tasks | `:34,:124` | `/tasks` | no |
| 3 | fuel | `:35,:99` | `/fuel` | no |
| 4 | dispatch | `:36,:100` | `/dispatch` | **yes** ~25 (`:201-228`) |
| 5 | driver-hub | `:37,:109` | `/driver-hub` | no |
| 6 | maintenance | `:38,:92-98` | `/maintenance` | **yes** 11 (`MAINTENANCE_MODULE_NAV_LINKS`) |
| 7 | safety | `:39,:110` | `/safety` | **yes** 5 (`:182-189`) |
| 8 | compliance | `:40,:111` | `/compliance` | no |
| 9 | drivers | `:41,:101` | `/drivers` | **yes** (`:190-200`) |
| 10 | fleet | `:42,:102-108` | `/fleet` | no |
| 11 | insurance | `:43,:113` | `/safety/insurance` | no (own rail) |
| 12 | legal | `:44,:120` | `/legal` | **yes** 4 — misses Matters/Reports (`:235-241`) | DRIFT |
| 13 | eld | `:45,:122` | `/eld` | **hidden stub** (`NAV_HIDDEN_STUB_IDS:72`) | STUB |
| 14 | cash-flow | `:46,:125` | `/cash-flow` | no |
| 15 | settlements | `:47,:126` | `/driver-finance/settlements` | no |
| 16 | accounting | `:48,:112` | `/accounting` | **yes** 4 only (`:162-168`) | DRIFT thin |
| 17 | bank | `:49,:114` | `/banking` | **yes** 5 incl. Fuel Planner (`:171-181`) | DRIFT dual door |
| 18 | factoring | `:50,:115` | `/factoring` | no |
| 19 | finance | `:51,:129` | `/finance/hub` | UNVERIFIED flyout extras |
| 20 | customers | `:52,:116` | `/customers` | no |
| 21 | vendors | `:53,:117` | `/vendors` | no |
| 22 | inventory | `:54,:130` | `/inventory` | no |
| 23 | form_425 | `:55,:123` | `/425c` | no |
| 24 | lists | `:56,:118` | `/lists` | **yes** 3 (`:229-234`) | DRIFT thin |
| 25 | reports | `:57,:119` | `/reports` | UNVERIFIED thin |
| 26 | docs | `:58,:121` | `/docs` | no |
| 27 | users | `:59,:131-138` | `/users` | yes |
| 28 | help | `:60,:139` | `/help` | yes |
| 29 | program | `:61,:141` | `/program` | no |
| 30 | system | `:62,:144` | `/system` | no |

**Visible count:** `SIDEBAR_DEFAULT_ORDER` = all ids except `eld` → **29 visible** (`:72-75`). Arch “19 icons” text is STALE.

### Dual doors (KEEP — never delete)
| Feature | Doors (routes) | Status |
|---------|----------------|--------|
| Factoring | `/factoring` · `/accounting/factoring` · `/dispatch/factoring-queue` · Banking tiles | HAVE multi |
| Settlements | `/driver-finance/settlements` · Drivers subtab · Dispatch stub | HAVE + STUB |
| Fuel | `/fuel` · Banking flyout Fuel Planner → `/fuel` | HAVE |
| Parts | `/inventory` · `/maintenance/parts` · `/maintenance/parts-inventory` · Lists catalogs | HAVE |
| HOS | Compliance tabs · `/safety/hos*` | HAVE dual |
| Escrow | Accounting · Banking · Safety Escrow Record | HAVE triple |
| Program/System | `/program` · `/system` | HAVE |

### Top WILL FAIL / DRIFT (new evidence)
1. **Accounting flyout shows 4 of ~57 accounting surfaces** — Hub/Invoices/Payments/Factoring only (`sidebar-config.ts:162-168`); operators miss Bills/Expenses/JE from flyout.
2. **Safety flyout 5 vs ~28–29 in-module tabs** — most Safety is invisible from hover (`:182-189` vs `SAFETY_GROUPS`).
3. **Legal flyout omits Matters/Reports** while in-module tabs include them (`:235-241` vs `LegalModuleTabs.tsx:8-10`).
