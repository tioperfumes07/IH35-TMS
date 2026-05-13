import { fuelStationStatesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelStationStatesListPage() {
  return (
    <FuelCatalogListPage
      client={fuelStationStatesCatalogClient}
      displayName="Fuel Station States"
      breadcrumbPath="Lists & Catalogs / Fuel / Station States"
    />
  );
}
