import { chartOfAccountsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ChartOfAccountsListPage() {
  return (
    <AccountingCatalogListPage
      client={chartOfAccountsCatalogClient}
      displayName="Chart of Accounts"
      breadcrumbPath="Lists & Catalogs / Accounting / Chart of Accounts"
      codeLabel="Account Number"
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
      ]}
      metadataSummary={(row) => `Type: ${String(row.metadata.account_type ?? "—")}`}
    />
  );
}
