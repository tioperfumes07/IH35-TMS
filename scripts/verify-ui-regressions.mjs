#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertNotIncludes(source, needle, message) {
  if (source.includes(needle)) throw new Error(message);
}

try {
  const sidebar = read("apps/frontend/src/components/layout/sidebar-config.ts");
  assertIncludes(sidebar, '"fuel"', "Sidebar is missing FUEL entry");
  assertIncludes(sidebar, '"drivers"', "Sidebar is missing DRIVERS entry");

  const bookLoadEquipment = read("apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx");
  const bookLoadStops = read("apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx");
  const bookLoadModal = read("apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
  const timeWindow = read("apps/frontend/src/pages/dispatch/components/book-load-v4/TimeWindowDropdown.tsx");
  assertNotIncludes(bookLoadEquipment, "<select", "Book load equipment section contains raw <select>");
  assertNotIncludes(bookLoadStops, "<select", "Book load stops section contains raw <select>");
  assertNotIncludes(timeWindow, "<select", "Book load time window control contains raw <select>");
  assertIncludes(bookLoadModal, "Charge row type", "Book load section A is missing charge row combobox");
  assertIncludes(bookLoadModal, "Factoring company", "Book load factoring company combobox missing");

  const customers = read("apps/frontend/src/pages/Customers.tsx");
  const vendors = read("apps/frontend/src/pages/Vendors.tsx");
  const factoring = read("apps/frontend/src/pages/accounting/FactoringListPage.tsx");
  for (const [name, source] of [
    ["Customers", customers],
    ["Vendors", vendors],
    ["Factoring", factoring],
  ]) {
    assertIncludes(source, "Page {safeCurrentPage} of {totalPages}", `${name} pager label missing`);
    assertIncludes(source, "Previous", `${name} previous button missing`);
    assertIncludes(source, "Next", `${name} next button missing`);
  }

  const bankingHome = read("apps/frontend/src/pages/banking/BankingHome.tsx");
  assertNotIncludes(bankingHome, "Categorize ·", "Banking Home categorize band still present");
  assertIncludes(bankingHome, 'onClick={() => setActiveTab("transactions")}', "Banking Home uncategorized KPI link missing");

  const layoutPageHeader = read("apps/frontend/src/components/layout/PageHeader.tsx");
  const formPageHeader = read("apps/frontend/src/components/forms/shared/PageHeader.tsx");
  assertIncludes(layoutPageHeader, "navigate(-1)", "Layout PageHeader back navigation missing");
  assertIncludes(formPageHeader, "navigate(-1)", "Form PageHeader back navigation missing");

  const dispatch = read("apps/frontend/src/pages/Dispatch.tsx");
  const accountingSubNav = read("apps/frontend/src/pages/accounting/AccountingSubNav.tsx");
  const appRoutes = `${read("apps/frontend/src/App.tsx")}\n${
    fs.existsSync("apps/frontend/src/routes/manifest.tsx") ? read("apps/frontend/src/routes/manifest.tsx") : ""
  }`;
  const accountingPreSettlementsPage = read("apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx");
  assertIncludes(dispatch, 'label: "Pre-settlements"', "Dispatch pre-settlements tab missing");
  assertIncludes(accountingSubNav, 'label: "Pre-settlements"', "Accounting pre-settlements tab missing");
  assertIncludes(appRoutes, 'path="/accounting/pre-settlements"', "Accounting pre-settlements route missing");
  assertIncludes(accountingPreSettlementsPage, "PreSettlementsPanel", "Accounting pre-settlements must reuse shared panel");

  const bankingTransactions = read("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx");
  assertIncludes(bankingTransactions, "COMPANY_TRANSACTIONS_PAGE_SIZE = 500", "Banking transactions batch-size fetch guard missing");
  assertIncludes(bankingTransactions, "offset += COMPANY_TRANSACTIONS_PAGE_SIZE", "Banking transactions paging loop missing");
  assertIncludes(bankingTransactions, "bank_account_id: selectedAccount?.id ?? undefined", "Banking account chip filter pass-through missing");
  assertNotIncludes(bankingTransactions, "limit: 300", "Banking transactions still capped at 300 rows");

  const bankingHomePage = read("apps/frontend/src/pages/banking/BankingHome.tsx");
  assertIncludes(bankingHomePage, "bankAccountsPanelRows", "Banking Home accounts panel rows mapper missing");
  assertIncludes(bankingHomePage, "plaidAccountsQuery.data?.accounts", "Banking Home accounts fallback to plaid data missing");

  const vendorDetail = read("apps/frontend/src/pages/VendorDetail.tsx");
  assertIncludes(vendorDetail, "Primary contact", "Vendor profile primary contact section missing");
  assertIncludes(vendorDetail, "Secondary contact", "Vendor profile secondary contact section missing");
  assertIncludes(vendorDetail, "Disputes contact", "Vendor profile disputes contact field missing");

  const customerDetail = read("apps/frontend/src/pages/CustomerDetail.tsx");
  assertIncludes(customerDetail, '"Contracts"', "Customer contracts tab missing");
  assertIncludes(customerDetail, "Upload broker/customer contract PDFs", "Customer contracts section missing");

  console.log("✅ UI regression guards passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
