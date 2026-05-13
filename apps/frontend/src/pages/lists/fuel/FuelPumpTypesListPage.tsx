import { fuelPumpTypesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelPumpTypesListPage() {
  return (
    <FuelCatalogListPage client={fuelPumpTypesCatalogClient} displayName="Fuel Pump Types" breadcrumbPath="Lists & Catalogs / Fuel / Pump Types" />
  );
}
