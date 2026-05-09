import { pickupTimeTypesCatalogClient } from "../../../api/catalogs-dispatch";
import { DispatchCatalogListPage } from "./DispatchCatalogListPage";

export function PickupTimeTypesListPage() {
  return (
    <DispatchCatalogListPage client={pickupTimeTypesCatalogClient} displayName="Pickup Time Types" breadcrumbPath="Lists & Catalogs / Dispatch / Pickup Time Types" />
  );
}
