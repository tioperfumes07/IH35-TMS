# 05 — ACCOUNTING

**Verdict:** HIGH creator chrome drift. Canonical forms exist; Maintenance forks ignore them; default Expenses route is CREATE not list; not QBO side panels.

## Live evidence (2026-07-15)
- `/accounting/expenses` = full-page Record expense (Vendor, Category, Payment Date, Amount, Unit, Description, Payment method, Payment account*, Save expense). Not side panel.
- `/accounting/bills/vendor` = full-page Create vendor bill (tabs Repair/Fuel/…, Section A/B).
- Create Vendor / Customer = centered rich modals (KEEP per owner).

## Surface / button inventory
| Surface | Control | Pattern | Status |
|---------|---------|---------|--------|
| Subnav | Accounting, Bills▾, Expenses▾, Bill payment▾, Maint & shop▾, Vendors, Customers, Reports, More | 57 grouped items | DRIFT vs design ~12 |
| Flyout | Hub, Invoices, Payments, Factoring only | | DRIFT (orphans rest) |
| + Create ▾ | Expense → full page create | | FAIL shell |
| Expense create | RecordExpenseForm + ReferenceSelect | Full page / list modal | MIXED — +Add yes |
| Expenses list | `/accounting/expenses/list` ParityTable | EntityLink expense → NULL | FAIL click |
| Maint Create Expense | CreateExpenseModal | No ReferenceSelect | OLD fork |
| Vendor bill | VendorBillForm | Full page | FAIL shell vs §7.6 |
| Multiple / Recurring bills | Full pages | | MIXED |
| Maint Create Bill | CreateBillModal | No +Add | OLD fork |
| Pay bill | PayBillModal / BillPaymentModal / VendorDetail inline | Thin modals ×3 | DRIFT |
| Receive payment | RecordPaymentModal | No customer +Add | OLD |
| Check / Deposit create | — | | MISSING vs QBO |
| Account Register | ParityTable after account pick | | HAVE when selected |
| CoA | AccountDrawer create | | HAVE |
| Save and new/close | SaveDropdown unused on AP/expense | | MISSING |

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** RecordExpenseForm + VendorBillForm + ReferenceSelect on accounting path; ParityTable on major lists; Invoice wizard.  
**MISSING:** Side panels for txs; unified bill payment; expense `:id` detail; Check/Deposit.  
**DRIFT:** Maintenance clones; Expenses hub = create.  
**WILL FAIL:** Training “Expenses” lands on thin form; WO→expense link opens create; three payment UIs diverge audit.

## Professional recommendation
Share RecordExpenseForm/VendorBillForm into Maintenance (entry points stay). Move Expense/Bill/Bill payment to QBO side panels. Default Expenses to list. Add expense detail route. One bill-payment chrome.

## Deep button inventory (repo) — 2026-07-15

### Subnav & + Create
| Control | File:line | Target | Status |
|---------|-----------|--------|--------|
| Expenses hub | subnav-manifest.ts:79 | `/accounting/expenses` = **ExpenseCreatePage** | DRIFT (create≠list) |
| Expenses List | :80 | `/accounting/expenses/list` | HAVE |
| Vendor bill | :74 | `/accounting/bills/vendor` full page | FAIL shell §7.6 |
| + Create ▾ New Bill / Expense / Invoice / Receive payment / JE | AccountingSubNavWrapper.tsx:77-96 | full pages / modals | MIXED |
| + Vendor | :70-75 | `/vendors` | HAVE |

### Canonical vs Maintenance forks
| Dimension | RecordExpenseForm / VendorBillForm | CreateExpenseModal / CreateBillModal |
|-----------|--------------------------------------|--------------------------------------|
| Shell | Full page / centered RecordExpenseModal | Centered Modal from Maint |
| Vendor/Category | ReferenceSelect +Add | SelectCombobox **no +Add** |
| Class | (expense N/A) / bill free text | free-text → memo |
| WO FK | optional | hard work_order_id / unit_id |
| API | createExpense / createVendorBill | **same APIs** |

Open sites: WorkOrderDetailPage.tsx:740-748 · MaintenanceHome.tsx:478-483

### Dead / ignored
| Issue | File:line |
|-------|-----------|
| EntityLink expense → null | EntityLink.tsx:100-101 |
| “View all expenses” → create page | RecordExpenseModal.tsx:28-29 |
| `?basis=` unread on Account Register | AccountRegisterPage.tsx:94 vs 98-99 |
| CreateBillModal terms UI not in payload | CreateBillModal.tsx:42,158-162 vs 109-124 |
| SaveDropdown unused on expense/bill | no hits in forms |
| No `/accounting/expenses/:id` | manifest create+list only |

## Live evidence (2026-07-15, app.ih35dispatch.com/accounting/expenses)
Confirmed LIVE: full-page create form titled Expenses / “Record a vendor expense or bill payment” — fields Vendor, Category, Payment Date, Amount, Truck/Unit, Description, Payment method, Payment account *, Supporting Documents, Save expense. Not a QBO side panel. Subnav: Accounting · Bills · Expenses · Bill payment · Maintenance & shop · Vendors · Customers · Reports · More · + Create ▾ · + Vendor.
