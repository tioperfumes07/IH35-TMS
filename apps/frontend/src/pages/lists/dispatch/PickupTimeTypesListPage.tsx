import { pickupTimeTypesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function PickupTimeTypesListPage() {
  return (
    <DispatchCatalogListPage
      catalogKey="pickup-time-types"
      title="Pickup Time Types"
      description="Manage pickup appointment type values used in load creation and scheduling."
      client={pickupTimeTypesCatalogClient}
    />
  );
}
