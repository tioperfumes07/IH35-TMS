import { paymentTermsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function PaymentTermsListPage() {
  return (
    <AccountingCatalogListPage
      client={paymentTermsCatalogClient}
      displayName="Payment Terms"
      breadcrumbPath="Lists & Catalogs / Accounting / Payment Terms"
      codeLabel="Term Code"
      metadataFields={[{ key: "net_days", label: "Net Days", type: "number", required: true }]}
      metadataSummary={(row) => `Net ${String(row.metadata.net_days ?? "—")} days`}
    />
  );
}
