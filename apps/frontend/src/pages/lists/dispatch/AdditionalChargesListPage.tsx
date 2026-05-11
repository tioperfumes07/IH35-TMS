import { additionalChargesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function AdditionalChargesListPage() {
  return (
    <DispatchCatalogListPage
      catalogKey="additional-charges"
      title="Additional Charges"
      description="Manage additional charge codes used for dispatch and customer billing items."
      client={additionalChargesCatalogClient}
    />
  );
}
