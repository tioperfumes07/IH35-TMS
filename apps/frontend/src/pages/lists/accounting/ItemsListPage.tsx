import { itemsCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogListPage } from "./AccountingCatalogListPage";

export function ItemsListPage() {
  return (
    <AccountingCatalogListPage
      client={itemsCatalogClient}
      displayName="Items"
      breadcrumbPath="Lists & Catalogs / Accounting / Items"
      metadataFields={[
        {
          key: "item_type",
          label: "Item Type",
          type: "select",
          required: true,
          options: [
            { value: "Service", label: "Service" },
            { value: "Inventory", label: "Inventory" },
            { value: "NonInventory", label: "Non-Inventory" },
            { value: "Discount", label: "Discount" },
            { value: "Charge", label: "Charge" },
          ],
        },
      ]}
      metadataSummary={(row) => `Type: ${String(row.metadata.item_type ?? "—")}`}
    />
  );
}
