import { trailerStatusesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function TrailerStatusesListPage() {
  return <FleetCatalogListPage client={trailerStatusesCatalogClient} displayName="Trailer Statuses" breadcrumbPath="Lists & Catalogs / Fleet / Trailer Statuses" />;
}
