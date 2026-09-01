/**
 * HIDE-VOIDED-01 — settlements default-hide cancelled; bill payments hide revoked unless
 * include_voided; customer payments list defaults to status=active.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hide-voided-filter";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const failures = [];

const setl = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
if (!/settlements-hide-cancelled/.test(setl)) {
  failures.push("SettlementsPage must expose Hide cancelled checkbox (data-testid)");
}
if (!/hideCancelled && s\.status === "cancelled"/.test(setl)) {
  failures.push("SettlementsPage must filter cancelled when hideCancelled");
}
if (!/include_cancelled/.test(setl)) {
  failures.push("SettlementsPage must URL-persist include_cancelled");
}

const billPayPage = read("apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx");
if (!/bill-payments-hide-voided/.test(billPayPage)) {
  failures.push("BillPaymentsListPage must expose Hide voided checkbox");
}
if (!/include_voided:\s*hideVoided \? undefined : true/.test(billPayPage)) {
  failures.push("BillPaymentsListPage must pass include_voided when Hide voided is off");
}
// VIS-02 — void as first-class Status column + gear (ParityTable columns) + filter (hide voided).
if (!/key:\s*"status"/.test(billPayPage) || !/VIS-02 — void as first-class Status column/.test(billPayPage)) {
  failures.push("VIS-02: BillPaymentsListPage must expose a Status column with Voided state");
}
if (!/sortMode=["']external["']/.test(billPayPage)) {
  failures.push("BillPaymentsListPage must keep sortMode=external with Status sortable server-side");
}

const billPayApi = read("apps/frontend/src/api/accounting.ts");
if (!/include_voided\?: boolean/.test(billPayApi) || !/include_voided/.test(billPayApi)) {
  failures.push("listBillPayments client must accept include_voided");
}

const billPayRoutes = read("apps/backend/src/accounting/bills.routes.ts");
if (!/include_voided/.test(billPayRoutes)) {
  failures.push("GET /bill-payments must parse include_voided");
}

const billPaySvc = read("apps/backend/src/accounting/bills.service.ts");
if (!/includeVoided/.test(billPaySvc) || !/if \(!options\.includeVoided\)/.test(billPaySvc)) {
  failures.push("listBillPayments must only filter revoked_at when includeVoided is false");
}
if (!/BILL_PAYMENT_LIST_SORT_SQL[\s\S]*?status:\s*`\(CASE WHEN bp\.revoked_at/.test(billPaySvc)) {
  failures.push("VIS-02: BILL_PAYMENT_LIST_SORT_SQL must whitelist status → revoked_at CASE");
}

const payments = read("apps/frontend/src/pages/accounting/PaymentsListPage.tsx");
if (!/useState<"all" \| "active" \| "voided">\("active"\)/.test(payments)) {
  failures.push("PaymentsListPage must default status filter to active (hide voided)");
}

const expenses = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
if (!/useState<"" \| ExpenseListStatus>\("active"\)/.test(expenses)) {
  failures.push("FLT-03: ExpensesListPage must default status filter to active (hide voided)");
}
if (!/value: "active", label: "Active \(hide voided\)"/.test(expenses)) {
  failures.push("FLT-03: ExpensesListPage must expose Active (hide voided) status option");
}

const expRoutes = read("apps/backend/src/accounting/expenses.routes.ts");
if (!/status: z\.enum\(\["draft", "posted", "void", "active"\]\)/.test(expRoutes)) {
  failures.push("FLT-03: listExpensesQuerySchema must accept status=active");
}
if (!/filters\.status === "active"[\s\S]{0,200}e\.status <> 'void'/.test(expRoutes)) {
  failures.push("FLT-03: queryExpensesList must map status=active → e.status <> 'void'");
}

const billsPage = read("apps/frontend/src/pages/accounting/BillsPage.tsx");
if (!/const \[status, setStatus\][\s\S]{0,320}: "active"/.test(billsPage)) {
  failures.push("FLT-03: BillsPage must default status filter to active (hide voided)");
}
if (!/value="active">Active \(hide voided\)/.test(billsPage)) {
  failures.push("FLT-03: BillsPage must expose Active (hide voided) status option");
}

const billsRoutes = read("apps/backend/src/accounting/bills.routes.ts");
if (!/status: z\.enum\(\[[^\]]*"active"[^\]]*\]\)/.test(billsRoutes)) {
  failures.push("FLT-03: listBillsQuerySchema must accept status=active");
}

const billsSvc = read("apps/backend/src/accounting/bills.service.ts");
if (!/function applyBillListStatusFilter/.test(billsSvc) || !/status === "active"[\s\S]{0,120}b\.status NOT IN \('void', 'voided'\)/.test(billsSvc)) {
  failures.push("FLT-03: listBills must map status=active → hide voided bills");
}

const invoicesPage = read("apps/frontend/src/pages/accounting/InvoicesListPage.tsx");
if (!/value: "active", label: "Active \(hide voided\)"/.test(invoicesPage)) {
  failures.push("FLT-03: InvoicesListPage must expose Active (hide voided) status option");
}
if (!/let status: InvoiceListFilter = "active"/.test(invoicesPage)) {
  failures.push("FLT-03: InvoicesListPage must default status filter to active (hide voided)");
}

const invRoutes = read("apps/backend/src/accounting/invoices.routes.ts");
if (!/q\.status === "active"[\s\S]{0,200}i\.status NOT IN \('void', 'voided'\)/.test(invRoutes)) {
  failures.push("FLT-03: listInvoices must map status=active → hide voided invoices");
}

// VIS-02 — invoices Status column renders void as first-class badge (not raw string).
if (!/VIS-02 — void as first-class Status column/.test(invoicesPage) || !/invoiceStatusBadge/.test(invoicesPage)) {
  failures.push("VIS-02: InvoicesListPage must expose Status column with void badge render");
}

// VIS-02 — bills Status column comment + voided badge styling.
if (!/VIS-02 — void as first-class Status column/.test(billsPage) || !/statusBadgeClass\(bill\.status\)/.test(billsPage)) {
  failures.push("VIS-02: BillsPage must expose Status column with voided badge styling");
}

// FLT-02 — posted-only view in accounting list gear/filter (owner req 2.7).
if (!/value: "posted", label: "Posted \(GL\)"/.test(invoicesPage)) {
  failures.push("FLT-02: InvoicesListPage must expose Posted (GL) status filter option");
}
if (!/q\.status === "posted"[\s\S]{0,800}source_transaction_type = 'invoice'/.test(invRoutes)) {
  failures.push("FLT-02: listInvoices must map status=posted → GL-posted invoices EXISTS");
}
if (!/value="posted">Posted \(GL\)/.test(billsPage)) {
  failures.push("FLT-02: BillsPage must expose Posted (GL) status filter option");
}
if (!/status === "posted"[\s\S]{0,200}BILL_POSTED_GL_EXISTS_SQL/.test(billsSvc)) {
  failures.push("FLT-02: listBills must map status=posted → GL-posted bills EXISTS");
}
if (!/status: z\.enum\(\[[^\]]*"posted"[^\]]*\]\)/.test(billsRoutes)) {
  failures.push("FLT-02: listBillsQuerySchema must accept status=posted");
}
if (!/value: "posted", label: "Posted"/.test(expenses)) {
  failures.push("FLT-02: ExpensesListPage must expose Posted status filter option");
}

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
