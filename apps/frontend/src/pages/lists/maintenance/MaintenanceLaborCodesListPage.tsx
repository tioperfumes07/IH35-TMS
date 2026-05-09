import { maintenanceLaborCodesCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceLaborCodesListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenanceLaborCodesCatalogClient} displayName="Maintenance Labor Codes" breadcrumbPath="Lists & Catalogs / Maintenance / Labor Codes" />
  );
}
