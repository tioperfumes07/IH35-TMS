import { assetLocationsCatalogClient } from "../../../api/catalogs-fleet";
import { FleetCatalogListPage } from "./FleetCatalogListPage";

export function AssetLocationsListPage() {
  return (
    <FleetCatalogListPage
      client={assetLocationsCatalogClient}
      displayName="Asset Locations"
      breadcrumbPath="Lists & Catalogs / Fleet / Asset Locations"
    />
  );
}
