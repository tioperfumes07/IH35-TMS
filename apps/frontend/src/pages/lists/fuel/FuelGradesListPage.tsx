import { fuelGradesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function FuelGradesListPage() {
  return (
    <FuelCatalogListPage client={fuelGradesCatalogClient} displayName="Fuel Grades" breadcrumbPath="Lists & Catalogs / Fuel / Grades" />
  );
}
