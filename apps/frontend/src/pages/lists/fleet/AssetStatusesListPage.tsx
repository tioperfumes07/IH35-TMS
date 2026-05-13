import { assetStatusesCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function AssetStatusesListPage() {
  return (
    <FleetCatalogListPage client={assetStatusesCatalogClient} displayName="Asset Statuses" breadcrumbPath="Lists & Catalogs / Fleet / Asset Statuses" />
  );
}
