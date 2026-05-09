import { fuelStationBrandsCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelStationBrandsListPage() {
  return (
    <FuelCatalogListPage client={fuelStationBrandsCatalogClient} displayName="Fuel Station Brands" breadcrumbPath="Lists & Catalogs / Fuel / Station Brands" />
  );
}
