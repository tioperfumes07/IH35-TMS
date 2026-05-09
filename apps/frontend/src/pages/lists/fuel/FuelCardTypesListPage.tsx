import { fuelCardTypesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelCardTypesListPage() {
  return (
    <FuelCatalogListPage client={fuelCardTypesCatalogClient} displayName="Fuel Card Types" breadcrumbPath="Lists & Catalogs / Fuel / Card Types" />
  );
}
