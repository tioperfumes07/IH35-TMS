import { expensiveStatesCatalogClient } from "../../../api/catalogs-fuel";
import { FuelCatalogListPage } from "./FuelCatalogListPage";

export function ExpensiveStatesListPage() {
  return (
    <FuelCatalogListPage client={expensiveStatesCatalogClient} displayName="Expensive States" breadcrumbPath="Lists & Catalogs / Fuel / Expensive States" />
  );
}
