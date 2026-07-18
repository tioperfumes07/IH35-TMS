import { describe, expect, it } from "vitest";
import bills from "../BillsPage.tsx?raw";
import payBill from "../PayBillModal.tsx?raw";
import ccPayment from "../bill-payments/CCPaymentModal.tsx?raw";
import paymentDetail from "../PaymentDetailPage.tsx?raw";
import paymentMethods from "../PaymentMethodsCatalogPage.tsx?raw";
import expenseMap from "../ExpenseCategoryMapPage.tsx?raw";
import reconciliation from "../ReconciliationWorkspacePage.tsx?raw";
import cashForecast from "../CashForecastPage.tsx?raw";

const cases = [
  ["Bills paymentsQuery", bills, "paymentsQuery.isError", "paymentsQuery.refetch()"],
  ["Bills vendorsQuery", bills, "vendorsQuery.isError", "vendorsQuery.refetch()"],
  ["Pay Bill accountsQuery", payBill, "accountsQuery.isError", "accountsQuery.refetch()"],
  ["CC Payment accountsQuery", ccPayment, "accountsQuery.isError", "accountsQuery.refetch()"],
  ["Payment Detail openInvoicesQuery", paymentDetail, "openInvoicesQuery.isError", "openInvoicesQuery.refetch()"],
  ["Payment Methods accountsQuery", paymentMethods, "accountsQuery.isError", "accountsQuery.refetch()"],
  ["Expense Category Map accountsQuery", expenseMap, "accountsQuery.isError", "accountsQuery.refetch()"],
  ["Reconciliation accountsQuery", reconciliation, "accountsQuery.isError", "accountsQuery.refetch()"],
  ["Cash Forecast settingsQuery", cashForecast, "settingsQuery.isError", "settingsQuery.refetch()"],
] as const;

describe("Accounting Wave C query error contracts", () => {
  it.each(cases)("%s renders a visible shared error and exact retry", (_name, source, errorMarker, retryMarker) => {
    expect(source).toContain("ListErrorBanner");
    expect(source).toContain(errorMarker);
    expect(source).toContain(retryMarker);
  });
});
