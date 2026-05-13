import { trailerTypesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function TrailerTypesListPage() {
  return (
    <FleetCatalogListPage client={trailerTypesCatalogClient} displayName="Trailer Types" breadcrumbPath="Lists & Catalogs / Fleet / Trailer Types" />
  );
}
