import { paymentMethodsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function PaymentMethodsListPage() {
  return (
    <AccountingCatalogListPage
      client={paymentMethodsCatalogClient}
      displayName="Payment Methods"
      breadcrumbPath="Lists & Catalogs / Accounting / Payment Methods"
    />
  );
}
