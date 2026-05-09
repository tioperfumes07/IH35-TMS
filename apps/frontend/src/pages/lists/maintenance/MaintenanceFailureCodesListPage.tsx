import { maintenanceFailureCodesCatalogClient } from "../../../api/catalogs-maintenance";
import { MaintenanceCatalogListPage } from "./MaintenanceCatalogListPage";

export function MaintenanceFailureCodesListPage() {
  return (
    <MaintenanceCatalogListPage client={maintenanceFailureCodesCatalogClient} displayName="Maintenance Failure Codes" breadcrumbPath="Lists & Catalogs / Maintenance / Failure Codes" />
  );
}
