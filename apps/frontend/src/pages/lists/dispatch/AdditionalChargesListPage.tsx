import { additionalChargesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function AdditionalChargesListPage() {
  return (
    <DispatchCatalogListPage client={additionalChargesCatalogClient} displayName="Additional Charges" breadcrumbPath="Lists & Catalogs / Dispatch / Additional Charges" />
  );
}
