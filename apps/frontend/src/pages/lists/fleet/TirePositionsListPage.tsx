import { tirePositionsCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function TirePositionsListPage() {
  return <FleetCatalogListPage client={tirePositionsCatalogClient} displayName="Tire Positions" breadcrumbPath="Lists & Catalogs / Fleet / Tire Positions" readOnly />;
}
