import { fuelBrandsCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelBrandsListPage() {
  return (
    <FuelCatalogListPage client={fuelBrandsCatalogClient} displayName="Fuel Brands" breadcrumbPath="Lists & Catalogs / Fuel / Brands" />
  );
}
