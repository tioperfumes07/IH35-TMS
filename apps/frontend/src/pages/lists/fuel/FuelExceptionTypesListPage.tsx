import { fuelExceptionTypesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelExceptionTypesListPage() {
  return (
    <FuelCatalogListPage client={fuelExceptionTypesCatalogClient} displayName="Fuel Exception Types" breadcrumbPath="Lists & Catalogs / Fuel / Exception Types" />
  );
}
