import { cdlEndorsementsCatalogClient } from "../../../api/catalogs-driver";
import { DriverCatalogListPage } from "./DriverCatalogListPage";

export function CdlEndorsementsListPage() {
  return (
    <DriverCatalogListPage
      client={cdlEndorsementsCatalogClient}
      displayName="CDL Endorsements"
      breadcrumbPath="Lists & Catalogs / Driver / CDL Endorsements"
    />
  );
}
