import { fuelDispatchRoutesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelDispatchRoutesListPage() {
  return (
    <FuelCatalogListPage
      client={fuelDispatchRoutesCatalogClient}
      displayName="Fuel Dispatch Routes"
      breadcrumbPath="Lists & Catalogs / Fuel / Dispatch Routes"
    />
  );
}
