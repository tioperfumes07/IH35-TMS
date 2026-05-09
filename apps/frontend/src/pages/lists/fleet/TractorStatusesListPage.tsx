import { tractorStatusesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function TractorStatusesListPage() {
  return <FleetCatalogListPage client={tractorStatusesCatalogClient} displayName="Tractor Statuses" breadcrumbPath="Lists & Catalogs / Fleet / Tractor Statuses" />;
}
