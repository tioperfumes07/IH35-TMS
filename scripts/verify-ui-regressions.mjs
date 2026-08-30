#!/usr/bin/env node
import fs from "node:fs";
import { checkEntityBadgeSingleSource } from "./verify-entity-badge-single-source.mjs";
import { findOverflowClippedHoverDropdowns } from "./verify-no-overflow-clipped-hover-dropdown.mjs";

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
  const accessorialEditor = read("apps/frontend/src/components/dispatch/AccessorialEditor.tsx");
  assertIncludes(bookLoadModal, "AccessorialEditor", "Book load section A is missing AccessorialEditor (B21-D3)");
  assertIncludes(accessorialEditor, "+ Create charge", "Book load accessorial CTA must use + Create charge");
  assertIncludes(bookLoadModal, "Factoring company", "Book load factoring company combobox missing");

  const customers = read("apps/frontend/src/pages/Customers.tsx");
  const vendors = read("apps/frontend/src/pages/Vendors.tsx");
  const factoring = read("apps/frontend/src/pages/accounting/FactoringListPage.tsx");
  for (const [name, source] of [
    ["Customers", customers],
    ["Vendors", vendors],
    ["Factoring", factoring],
  ]) {
    // Pagination regression guard: each list page must provide a real pager. Accept EITHER the shared
    // ParityTable (QBO-parity A1 — renders its own numbered advanced pager + per-page selector) OR the
    // legacy hand-rolled pager. This still fails hard if a page loses pagination entirely, but does not
    // trip on the ParityTable migration that replaces the hand-rolled table/chooser/pager wholesale.
    const hasParityTable = source.includes("<ParityTable");
    const hasLegacyPager =
      source.includes("Page {safeCurrentPage} of {totalPages}") &&
      source.includes("Previous") &&
      source.includes("Next");
    if (!hasParityTable && !hasLegacyPager) {
      throw new Error(`${name} pager missing (neither ParityTable nor legacy pager present)`);
    }
  }

  const bankingHome = read("apps/frontend/src/pages/banking/BankingHome.tsx");
  assertNotIncludes(bankingHome, "Categorize ·", "Banking Home categorize band still present");
  // Uncategorized KPI must link to the Transactions tab. As of #2249 it navigates there pre-filtered to
  // uncategorized (setTransactionsInitialFilter("uncategorized") + navigate). Assert the pre-filter wiring —
  // a stronger check than the old bare setActiveTab, and it still proves the KPI is a live link, not dead.
  assertIncludes(bankingHome, 'setTransactionsInitialFilter("uncategorized")', "Banking Home uncategorized KPI link missing");

  const layoutPageHeader = read("apps/frontend/src/components/layout/PageHeader.tsx");
  const formPageHeader = read("apps/frontend/src/components/forms/shared/PageHeader.tsx");
  assertIncludes(layoutPageHeader, "navigate(-1)", "Layout PageHeader back navigation missing");
  assertIncludes(formPageHeader, "navigate(-1)", "Form PageHeader back navigation missing");
  assertIncludes(formPageHeader, "string | BreadcrumbItem", "Form PageHeader must accept string[] breadcrumbs from leaf pages");
  assertIncludes(layoutPageHeader, "lastModuleHref", "Layout PageHeader must remember last sidebar module");
  assertIncludes(formPageHeader, "lastModuleHref", "Form PageHeader must remember last sidebar module");
  const app = read("apps/frontend/src/App.tsx");
  assertIncludes(app, "<ScrollToTop", "App must mount CC-2 ScrollToTop (do not duplicate RouteScrollReset)");
  const statementsPrint = read("apps/frontend/src/pages/finance/FinancialStatementsPage.tsx");
  assertIncludes(statementsPrint, "getShowAccountNumbers", "Financial statements print must respect CoA number toggle");
  const accountingChrome = read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx");
  if (!accountingChrome.includes("<PageHeader") && !accountingChrome.includes('aria-label="Back"')) {
    throw new Error("Accounting wrapper must render a back control");
  }
  const fuelPlanner = read("apps/frontend/src/pages/fuel/FuelPlannerHome.tsx");
  assertIncludes(fuelPlanner, 'backHref="/home"', "Fuel module header must have a module-parent backHref");
  const safetyLayout = read("apps/frontend/src/pages/safety/SafetyLayout.tsx");
  assertIncludes(safetyLayout, "hasInAppHistory", "Safety layout back must prefer in-app history");
  const customerCreate = read("apps/frontend/src/components/customers/CustomerProfileForm.tsx");
  assertIncludes(customerCreate, "properPersonOrPlaceName", "Customer create/update payload must title-case names/addresses");
  const vendorCreate = read("apps/frontend/src/components/vendors/VendorCreateModal.tsx");
  assertIncludes(vendorCreate, "properPersonOrPlaceName", "Vendor create payload must title-case names/addresses");

  const dispatch = read("apps/frontend/src/pages/Dispatch.tsx");
  // orphan-triage F1: AccountingSubNav.tsx (verified-dead, zero-consumer duplicate of the live
  // AccountingSubNavWrapper.tsx — see verify-accounting-nav.mjs Check 4) was deleted. It only ever
  // re-exported subnav-manifest.ts's SUBNAV_ITEMS, which is what the `label:` check below matches
  // against, so read the manifest directly.
  const accountingSubNav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
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
  assertIncludes(customerDetail, "CustomerContractsTab", "Customer contracts section missing");
  const contractsTab = read("apps/frontend/src/components/customers/CustomerContractsTab.tsx");
  assertIncludes(contractsTab, "Upload Contract", "Customer contracts upload action missing");

  const entityBadgeReasons = checkEntityBadgeSingleSource({
    topbar: read("apps/frontend/src/components/Topbar.tsx"),
    switcher: read("apps/frontend/src/components/layout/CarrierSwitcher.tsx"),
    helper: read("apps/frontend/src/lib/selected-company-label.ts"),
  });
  if (entityBadgeReasons.length) {
    throw new Error(`Entity badge single-source guard failed:\n${entityBadgeReasons.map((r) => `  • ${r}`).join("\n")}`);
  }

  // CATEGORY-HOVER-FLYOUT-CLIPPED-BY-SCROLL-ANCESTOR: see verify-no-overflow-clipped-hover-dropdown.mjs
  const clippedHoverDropdowns = findOverflowClippedHoverDropdowns();
  if (clippedHoverDropdowns.length) {
    throw new Error(
      `Overflow-clipped HoverDropdown guard failed (flyout menu silently invisible):\n${clippedHoverDropdowns
        .map((f) => `  • ${f}`)
        .join("\n")}`
    );
  }

  console.log("✅ UI regression guards passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
