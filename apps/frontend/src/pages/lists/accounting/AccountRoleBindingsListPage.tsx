import { accountRoleBindingsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function AccountRoleBindingsListPage() {
  return (
    <AccountingCatalogListPage
      client={accountRoleBindingsCatalogClient}
      displayName="Account Role Bindings"
      breadcrumbPath="Lists & Catalogs / Accounting / Account Role Bindings"
      readOnly
      metadataSummary={(row) => `Account: ${String(row.metadata.account_id ?? "unbound")}`}
    />
  );
}
