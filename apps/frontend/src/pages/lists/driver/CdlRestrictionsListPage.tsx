import { cdlRestrictionsCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function CdlRestrictionsListPage() {
  return (
    <DriverCatalogListPage
      client={cdlRestrictionsCatalogClient}
      displayName="CDL Restrictions"
      breadcrumbPath="Lists & Catalogs / Driver / CDL Restrictions"
    />
  );
}
