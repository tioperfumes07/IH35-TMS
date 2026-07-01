import { chartOfAccountsSeedsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ChartOfAccountsSeedsListPage() {
  return (
    <AccountingCatalogListPage
      client={chartOfAccountsSeedsCatalogClient}
      displayName="Chart of Accounts Seeds"
      breadcrumbPath="Lists & Catalogs / Accounting / Chart of Accounts Seeds"
      codeLabel="Account code"
      metadataFields={[
        {
          key: "account_type",
          label: "Account Type",
          type: "select",
          required: true,
          options: [
            { value: "Asset", label: "Asset" },
            { value: "Liability", label: "Liability" },
            { value: "Equity", label: "Equity" },
            { value: "Income", label: "Income" },
            { value: "Expense", label: "Expense" },
          ],
        },
        { key: "detail_type", label: "Detail Type", type: "text" },
        {
          key: "normal_balance",
          label: "Normal Balance",
          type: "select",
          options: [
            { value: "debit", label: "Debit" },
            { value: "credit", label: "Credit" },
          ],
        },
      ]}
      metadataSummary={(row) => `Type: ${String(row.metadata.account_type ?? "—")}${row.metadata.detail_type ? ` · ${String(row.metadata.detail_type)}` : ""}`}
      helperLink={{
        note: "Onboarding template rows — these seed a new company's Chart of Accounts; they are not live GL accounts.",
        label: "Open Chart of Accounts",
        to: "/lists/accounting/chart-of-accounts",
      }}
    />
  );
}
